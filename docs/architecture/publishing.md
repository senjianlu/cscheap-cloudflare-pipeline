# 发布契约:写序、就绪、激活、回滚

> **状态**:本文只写已经定下的**契约**——写入顺序、就绪条件、指针切换与回滚的规则,以及表达这些规则的 SQL
> (在 `contract/release.ts`,已在本地 D1 上验证)。**发布器、回滚命令、清理、可复用工作流都尚未实现**;
> 远端 D1 上的验证放到发布任务,作为其前置用例。

目标:发布是整版原子的。任何一步失败,都不得留下「指针指向不完整版本」的状态;同一提交重复发布结果相同;
中断后重跑不产生重复行或孤儿指针。表结构见 [contract.md §4](contract.md)。

## 写序

1. **资源定稿**(在生成正文 AST 之前)。对每个被引用的仓内资源,先做该类型要求的处理(svg 清洗),再对
   **处理后的字节**计算 sha256,得到最终路径;正文 AST 与图标引用的是这个最终路径。之后不得再改动资源字节或
   AST 中的资源引用,因此页对象的摘要与体积在此之后是确定的。唯一入口:`finalizeAsset(资源, 处理函数?)`。
2. **写入**,顺序固定:
   1. R2 上传资源,逐个核对存在与大小;
   2. `objects`(同一摘要已存在则跳过:`INSERT_OBJECT_SQL`);
   3. `releases` 一行:`status = 'writing'`、`assets_verified = 0`,带 `expected` 与 `site` 快照;
   4. 带新 `release_id` 的各表行(含 `release_assets`);
   5. R2 写入版本清单(`manifestKey`);
   6. `release_assets` 中的全部资源与清单都核对无误后,把 `assets_verified` 置为 1(`MARK_ASSETS_VERIFIED_SQL`)。
3. **就绪**(`MARK_READY_SQL`,一条带条件的更新)。同时满足三项才把 `status` 改为 `ready`:
   - 各表该 `release_id` 的实际行数与 `expected` 相符,被引用的不同正文对象数与 `expected.objects` 相符;
   - `entry_locales` 引用的每个 `object_sha256` 在 `objects` 中存在;
   - `assets_verified = 1`。

   影响 1 行即已就绪;影响 0 行表示条件不满足(或早已就绪)。`ready` 之后该版本的全部行不可变;
   `assets_verified` 置位与 `writing → ready` 是版本行仅有的两次更新。

## 激活与切换

4. **首次激活**(该来源该频道还没有指针行):`ACTIVATE_FIRST_SQL`,带条件的插入——仅当目标版本存在、
   `status = 'ready'`、`source` 与 `channel` 与指针一致、且指针行仍不存在时插入,`previous_release` 为空。
5. **切换**:`SWITCH_POINTER_SQL`,带条件的单条更新——除第 4 步对目标版本的三个条件外,还要求 `current_release`
   等于写入前读到的值,且**不等于目标版本**;成立则 `previous_release` 取旧的 `current_release`。
6. **结果判定**(`judgeActivation`:语句影响的行数 + 回读到的指针):

   | 影响行数 | 回读到的 `current_release` | 结论 |
   |---|---|---|
   | 1 | 目标 | 已切换 |
   | 0 | 目标 | **已是当前版本**:幂等成功,`previous_release` 与 `activated_at` 不变 |
   | 其余 | — | 冲突(旧值已变)或目标不合格(不存在、仍为 `writing`、归属不符);指针不变 |

7. **回滚**:与切换是同一条语句(`ROLLBACK_POINTER_SQL`),目标取某个仍为 `ready` 且同来源同频道的版本;
   对已是当前版本的目标同样判为幂等成功。回滚只改指针。
8. **读取**:每个请求先取指针(`READ_POINTER_SQL`),其后所有查询显式带 `release_id`。

频道指针是发布完成后唯一会被改写的行。

## 语句与参数

所有语句用编号占位符绑定参数,不拼接字符串。

| 常量 | 参数 |
|---|---|
| `insertSql(表)` + `rowParams(表, 行)` | 按 `TABLES[表].columns` 的顺序;对象与数组序列化为 JSON 文本 |
| `INSERT_OBJECT_SQL` | 同 `insertSql('objects')`,摘要已存在时不做任何事 |
| `MARK_ASSETS_VERIFIED_SQL` | `?1` release_id |
| `MARK_READY_SQL` | `?1` release_id |
| `READ_POINTER_SQL` | `?1` source,`?2` channel |
| `ACTIVATE_FIRST_SQL` | `?1` 目标 release_id,`?2` source,`?3` channel,`?4` 激活时间 |
| `SWITCH_POINTER_SQL` / `ROLLBACK_POINTER_SQL` | `?1` 目标 release_id,`?2` source,`?3` channel,`?4` 写入前读到的 `current_release`,`?5` 激活时间 |

每张表至多 11 列,整行插入的绑定参数远低于 D1 每条语句 100 个的上限;批量写入时如何分块由发布任务决定。

## 输入到行的映射

各表的行由 `contract/release.ts` 的映射函数从输入生成(对照表见 [contract.md §1.5](contract.md))。其中时间列有一条
必须遵守的规则(项目约定):

- `entries.published_at`、`entries.updated_at` 写入**规范化的 UTC 时间**——小数部分固定九位,例如输入
  `2026-01-01T00:00:00Z` 写成 `2026-01-01T00:00:00.000000000Z`,输入 `…00.5Z` 写成 `…00.500000000Z`(`normalizeUtc`)。
  这两列是 TEXT 并建有按 `published_at DESC` 的索引;输入允许不同的小数位数,原样写入时文本顺序与时间顺序不一致
  (倒序时 `…00Z` 会排在更晚的 `…00.5Z` 前面),规范化后定宽,文本顺序即时间顺序。
- `publishedAt` 缺省时取 `workflow` 中首次进入 `published` 的时间,同样规范化;两者都没有则为 NULL。
- 发布器不得绕过 `toEntryRow` 自行拼时间;`EntryRow` 的 schema 只接受规范化后的写法。

## 失败语义

| 中断位置 | 留下的状态 | 重跑 |
|---|---|---|
| 写入途中 | 一个 `writing` 的版本,指针未动;读取端看不到它 | 同一提交的 `release_id` 相同;如何续写或重写由发布任务定义 |
| 就绪条件不满足 | 版本保持 `writing`,不可被激活 | 补齐后再执行就绪语句 |
| 切换时旧值已变 | 指针不变,判为冲突 | 重新读取指针再决定 |
| 切换成功后重跑 | 指针不变,判为幂等成功 | 无需处理 |

被指针引用的版本受外键保护,不能被删除;清理的规则(保留多少个版本、何时回收不再被引用的 `objects` 与 R2 资源)
尚未定义,归清理任务。

## 已验证与未验证

- 已验证(本地 D1,miniflare):迁移可应用;表、列、索引与契约常量一致;一版数据的写入与逐字段读回;
  就绪的三个条件各自生效;首次激活、目标不存在、目标为 `writing`、错误归属、旧值冲突、正确切换、重复激活、
  回滚与重复回滚;反向链接查询走索引。
- 未验证:远端 D1 的行为差异;R2 上传与核对;并发发布;大批量写入的分块与耗时。
