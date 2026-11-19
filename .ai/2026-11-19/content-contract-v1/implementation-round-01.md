---
task: content-contract-v1
round: 01
date: 2026-11-19
---

# 实现记录:第 01 轮

## 本轮改动

第 1 轮:按 plan 实现。全部改动都在 plan「改动范围」表列出的路径内;未提交、未推送、未运行评审脚本。

| 文件 | 改动摘要 |
|---|---|
| `contract/primitives.ts` | `CONTRACT_VERSION = 1`;语言标签(BCP 47 常用子集、规范大小写)、RFC 3339 UTC 时间与日历日期、sha256、slug、id、词表键、短词、标题 id;不可信 URL 判定 `isSafeUrl`(沿用既有文档站规则)、`WebUrl` / `HttpsUrl` / `SitePath` / `RelativePath` / `Hostname`;规范序列化 `canonicalJson`;体积上限常量 `SIZE_LIMITS`;`ContractError` |
| `contract/site.ts` | `site.json` 的 schema(§0)、`urlPattern`、渲染相关快照 `SiteSnapshot` / `toSiteSnapshot`;`createContract(site)`(语言 / 频道 / 参与者 / 外部资源域名 / 描述键的取值全部来自配置);`jsonSchemaSources()`(不带上下文的 schema,供生成 JSON Schema) |
| `contract/inputs.ts` | 词表、重定向、导航的 schema(§1.1) |
| `contract/envelope.ts` | 信封 `item.json`(§1):`stage`、`workflow`、`sources`、`refs`、`seo`、图标四种形态与 `resolveIcon`;提升必填在 `itemObject(type)` 组合后的结构里表达;跨字段规则(workflow 时间不减、末项 stage);frontmatter(主稿 / 译文)与语言文件规则 `localeFilesSchema`;静态类型 `ItemOf<K>` / `Item` |
| `contract/types.ts` | 类型注册表 `TYPE_REGISTRY`(7 个类型:来源、正文模式、`data`、`l10n`、提升必填、默认图标)、各类型 `data` schema、资源来源 `assetSource`、全局引用 `GlobalRef` / `parseGlobalRef`(正则由注册表生成) |
| `contract/ast.ts` | 正文 AST(四种节点、元素白名单、深度上限 64)、链接规则 `isSafeHref`(含 `ref:` 实体引用与任意前缀的站内路径)、图片(资源引用 + 宽高)、组件注册表(`Callout`、`EntityCard`)、`Toc`、`StructuredData`、页对象与规范序列化 |
| `contract/release.ts` | 表 / 列 / 索引常量(`TABLES`、`INDEXES`)、各表行 schema、§1.2 的输入到行映射函数、整行插入语句生成、就绪 / 首次激活 / 切换 / 回滚 / 读指针的 SQL 常量、结果判定 `judgeActivation` |
| `contract/storage.ts` | R2 键 `assetKey` / `manifestKey`、资源引用 `assetRef`、MIME 白名单、`finalizeAsset`(资源定稿的唯一入口;摘要用 Web Crypto,不依赖 Node 专有模块) |
| `contract/limits.ts` | `checkSize(kind, 输入)` / `assertSize`(按原始字节计量,上限为「小于等于」) |
| `contract/index.ts` | 统一导出(包的唯一对外入口) |
| `migrations/0001_init.sql` | §4 的 11 张表与 5 个索引;STRICT 表、取值与 JSON 的 CHECK、对 `releases` 的外键;`links` 为 WITHOUT ROWID(见偏差 D-01) |
| `scripts/gen-schemas.ts` | 用 Zod 4 的 `z.toJSONSchema`(draft 2020-12、输入形状、不可表达即抛错)生成 `schemas/*.schema.json`;可指定输出目录 |
| `scripts/check-schemas.sh` | TC-10 的断言脚本:重新生成到临时目录,与 `schemas/` 比较文件集合与内容;用三种人为漂移自检 |
| `scripts/smoke-consumer.sh` | TC-16 的断言脚本:构建 → 打包 → 在临时目录的独立 TypeScript 项目里离线安装 → 类型检查(不跳过库检查)→ 运行 |
| `scripts/check-hygiene.sh` | TC-17 的断言脚本:§8 的三类规则 + 内置的「应通过 / 应命中」样本自检 |
| `schemas/`(11 份) | 生成物:`site`、6 个 Git 类型各一份、`frontmatter`、`taxonomy`、`redirects`、`navigation` |
| `templates/<type>/` | 6 个 Git 类型各一个脚手架单元:`item.json` + `en.mdx`;`docs.api` 只有 `item.json` |
| `test/*.test.ts`(13 个) | `envelope`、`types`、`ast`、`ast-baseline`、`icon`、`site`、`inputs`、`schemas-semantics`、`templates`、`storage`、`limits`、`migration`、`activation` |
| `test/helpers.ts`、`test/d1.ts` | 测试辅助:示例站点契约与断言函数;本地 D1(miniflare)的打开、迁移应用与读写封装 |
| `test/fixtures/samples.ts`、`test/fixtures/cases.ts` | 示例 `site.json`、各类型合法样本、TC-02 / 03 / 08 的正反例(同一批样本同时驱动 TC-09) |
| `test/fixtures/ast-baseline/`(5 个) | 从任务目录 `assets/ast-baseline/` 原样复制的页对象样本(字节一致,测试核对 sha256 等于文件名) |
| `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml` | 依赖钉确切版本;`exports` 指向 `dist/`(ESM + 类型声明),`prepare` 在安装时构建;workspace 文件只放安装脚本白名单(`workerd`) |
| `tsconfig.json`、`eslint.config.mjs`、`.prettierrc`、`vitest.config.ts` | strict + noUncheckedIndexedAccess;类型感知的 Promise 规则;格式化与测试配置 |
| `.github/workflows/ci.yml` | lint 与类型检查、测试、Schema 漂移检查 |
| `docs/architecture/README.md`、`overview.md`、`contract.md`、`publishing.md`、`usage.md` | 架构回写;`contract.md` 逐条标注出处或「项目约定」;`publishing.md`、`usage.md` 标明尚未实现的能力 |
| `docs/decisions/0002-…`、`0003-…`、`README.md` | 0002 信封 + 类型注册表;0003 版本化 D1 表与内容寻址正文;索引新增两条 |
| `CHANGELOG.md` | Unreleased 新增条目 |

依赖的确切版本:

| 包 | 版本 | 用途 |
|---|---|---|
| `zod` | 4.6.7 | 契约与 JSON Schema 生成(唯一的运行时依赖) |
| `typescript` | 5.9.3 | 类型检查与构建 |
| `vitest` | 5.1.0 | 测试(5.1.1 发布不足一天,会触发 pnpm 的最短发布时长排除项,故取上一个版本) |
| `miniflare` | 4.20260730.0 | 本地 D1(带出 `workerd` 1.20260730.1,其安装脚本列入白名单) |
| `ajv` | 8.20.0 | TC-09 用的独立 JSON Schema 校验器(draft 2020-12) |
| `eslint`、`@eslint/js` | 9.39.5 | lint |
| `typescript-eslint` | 8.73.0 | 类型感知规则 |
| `prettier` | 3.10.1 | 格式化 |
| `@types/node` | 22.20.5 | 脚本与测试的 Node 类型 |

环境:Node v22.22.3、pnpm 11.7.0。`scripts/gen-schemas.ts` 直接由 Node 运行(依赖 Node 22.18 起默认开启的类型擦除);
`package.json` 的 `engines` 按要求写 `>=22`。

plan 留给实现补定的细节(都写进了 `docs/architecture/contract.md`,并标为「项目约定」;请用户过目):

- 取值集合:`wiki.site.risk` 取 `low` / `medium` / `high`;`wiki.event.datePrecision` 取 `day` / `month` / `year`;
  `wiki.guide.difficulty` 取 `beginner` / `intermediate` / `advanced`;`wiki.event.eventKind`、`wiki.guide.guideKind`
  未枚举,只要求 slug 格式;`rating.score` 只要求非负(未限定量程)。
- 同步类型 `item` 的引用键格式:`<命名空间>/<名称>`,名称只含 URL 非保留字符,其余按百分号编码。
- `urlPattern` 的语法(`/` 开头、小写字面量段或 `{locale}` / `{slug}` / `{id}`,且必须含 `{slug}` 或 `{id}`);
  `site.types` 至少启用一个类型。
- 语言标签要求规范大小写(同一语言只有一种写法)。
- 发布侧取值:信封 `refs` 在 `links.source_locale` 写空串;对全部语言生效的重定向在 `redirects.locale` 写 `*`;
  正文里的引用在 `links.rel` 记为 `mentions`;`releases.expected` 的键用表名加 `objects`。
- `ico` 的 MIME 取 IANA 登记的 `image/vnd.microsoft.icon`。
- `img.src`:接受内容寻址的资源引用 `/assets/<sha256>/<文件名>`,**同时保留**既有形式 `/assets/<文件名>`
  (plan 要求 AST 只做加法扩展;基线样本里没有 `img`,只收新形式就会让既有形状失效)。是否去掉旧形式请用户定。
- 各类型的 `l10n` 首版都不声明任何键(plan 的类型表没有列出本地化短文本);机制已就位。

## plan 评审 minor 交接

`bash .ai-workflow/scripts/plan-review.sh __minors .ai/2026-11-19/content-contract-v1` 汇总出 5 条。

| 来源 | 内容 | 处置 |
|---|---|---|
| 01/R-12 | 文档回写清单遗漏 publishing.md 和 usage.md | 已在 plan 修订中解决(改动范围已列入两篇);本轮按修订后的 plan 写出两篇并标明尚未实现的能力 |
| 01/R-13 | docs.api 的「生成」没有对应注册表声明的正文模式 | 已在 plan 修订中解决(正文模式增加 `generated`);本轮注册表、语言文件规则与模板测试都按 `generated` 实现 |
| 01/R-14 | 「频道指针是唯一会被改写的行」与 release 状态迁移矛盾 | 已在 plan 修订中解决(限定为「发布完成后」,并写明版本行仅有的两次更新);本轮 `MARK_ASSETS_VERIFIED_SQL`、`MARK_READY_SQL` 即这两次更新,TC-15 核对就绪后二者都不再生效 |
| 02/R-09 | stage 字段说明仍保留固定的预览 / 生产准入规则 | 已在 plan 修订中解决(改为由 `site.channels` 决定);本轮 `contract.admits(channel, stage)` 只看配置,TC-07 用自定义频道核对 |
| 02/R-10 | 字段映射表的「同名列」与实际 SQL 列名不一致 | 已在 plan 修订中解决(§1.2 显式列出 `published_at` 等转换);本轮映射函数与 `contract.md` §1.5 按修订后的表实现 |

## 修复对照

不适用(第 1 轮)。

## 测试结果

证据由 `evidence.sh` 产出,落 `evidence/`。每条用例跑过两次:首跑 `TC-NN.log`,之后按保守口径做了四处收敛
(见下方说明),再对终态代码全部重跑为 `TC-NN-final.log`。**结果以 `-final` 为准**;首跑文件按「只增不改」保留,
同样全部 exit 0。

| 编号 | 档位 | 结果 | 证据 |
|---|---|---|---|
| TC-01 | A | pass | TC-01-final.log |
| TC-02 | A | pass | TC-02-final.log |
| TC-03 | A | pass | TC-03-final.log |
| TC-04 | A | pass | TC-04-final.log |
| TC-05 | A | pass | TC-05-final.log |
| TC-06 | A | pass | TC-06-final.log |
| TC-07 | A | pass | TC-07-final.log |
| TC-08 | A | pass | TC-08-final.log |
| TC-09 | A | pass | TC-09-final.log |
| TC-10 | A | pass | TC-10-final.log |
| TC-11 | A | pass | TC-11-final.log |
| TC-12 | A | pass | TC-12-final.log |
| TC-13 | A | pass | TC-13-final.log |
| TC-14 | A | pass | TC-14-final.log |
| TC-15 | A | pass | TC-15-final.log |
| TC-16 | A | pass | TC-16-final.log |
| TC-17 | A | pass | TC-17-final.log |

各条的命令与要点:

- TC-01:`pnpm run check:static`(= `pnpm lint && pnpm typecheck`),exit 0。
- TC-02–TC-09、TC-11–TC-15:`pnpm exec vitest run test/<名称>.test.ts --reporter=verbose`(写法 a,直接包被测命令;
  `--reporter=verbose` 只是让证据里逐条列出用例名)。通过的用例数:TC-02 83、TC-03 57、TC-04 57、TC-05 12、
  TC-06 30、TC-07 33、TC-08 22、TC-09 88、TC-11 19、TC-12 49、TC-13 46、TC-14 22、TC-15 25。
- TC-10:`bash scripts/check-schemas.sh`(写法 b),输出「无漂移」且三种人为漂移(missing、extra、changed)各自被发现。
- TC-16:`bash scripts/smoke-consumer.sh`(写法 b):构建、打包、`pnpm install --offline`、`tsc`(不跳过库检查)、
  运行 8 条运行时断言。
- TC-17:`bash scripts/check-hygiene.sh`(写法 b):仓库无命中;「应通过」样本无命中;15 个「应命中」样本各自命中指定规则。

首跑与终态之间的四处收敛(都是把首跑时多做的东西收回到 plan 字面范围内,没有放宽任何断言):

1. `img.src` 从「只收新形式」改为同时保留既有形式 `/assets/<文件名>`(保证只做加法扩展);TC-04 相应增加既有形式通过的用例,
   原「既有形式被拒」一条改为四条其他非法地址。
2. 去掉注册表里 plan 未列的「`data` 资源字段登记」:`entries.data` 原样写入;TC-14 的断言相应改为原样往返。
3. 去掉 `wiki.site` 的本地化短文本键 `tagline`(plan 的类型表未列);TC-02 改为核对「各类型未声明的键被拒、空对象通过」,
   TC-14 的 `l10n` 列往返改为直接构造一行。
4. 去掉 `templates/blog.post/og.png`(plan 写的是「`item.json` + 示例语言正文」);TC-11 相应改为断言每个模板恰好只有这两个文件
   (`generated` 类型只有 `item.json`)。

实现过程中由测试发现并修正的两个问题(记录在此供评审参考):

- TC-14 的 `EXPLAIN QUERY PLAN` 首次运行显示反向链接查询走了主键的自动索引、只用到 `release_id` 一列,而不是
  `links_release_target`。原因是主键索引覆盖了全部列、新建的二级索引不覆盖。处理见偏差 D-01。
- TC-16 的独立项目类型检查首次运行失败:`ItemOf<'blog.post'>` 里被提升的 `authors`、`seo.ogImage` 在静态类型上仍是可选。
  原因是形状里用了「必填 / 可选」两种 schema 的联合。已改为先给出全可选的公共形状、再按注册表去掉可选包装,
  并在 `test/types.test.ts` 加了静态类型断言(由 `tsc` 判定)。

## 与方案的偏差

| 编号 | 类型 | 内容 | 原因 | 处置 |
|---|---|---|---|---|
| D-01 | 替代 | `links` 表建为 `WITHOUT ROWID`(plan §4 只列了主键与索引,未说明存储形式) | 普通表上,plan 指定的索引 `links(release_id, target_type, target_key, source_type)` 不覆盖查询,规划器改走主键索引、只按 `release_id` 检索,TC-14「反向查询命中索引」无法成立。全部列都在主键里时用 WITHOUT ROWID,二级索引自带其余主键列,查询稳定走该索引。表名、列、主键、索引列均未改动 | 已实现;写入 `docs/architecture/contract.md` §4 与决策 0003 |
| D-02 | 替代 | 构建参数写在 `package.json` 的 `build` 脚本里(`tsc contract/index.ts` 加命令行参数),没有另建构建专用的 tsconfig | plan 的改动范围只列了 `tsconfig.json` 一个;它要同时覆盖 `contract/`、`scripts/`、`test/` 的类型检查,不能直接用于只产出 `contract/` 的构建 | 已实现;分发入口(`exports` 指向构建产物、`prepare` 构建)与 plan 一致 |
| D-03 | 收窄 | 实现中一度给 `.github/workflows/ci.yml` 加了「公开仓卫生扫描」一步,该步骤不在 plan 改动范围表所列的 CI 内容(lint、类型检查、测试、Schema 漂移检查)内 | 属于 plan 范围之外的追加,未经用户确认 | 送审前已从 `ci.yml` 删除,CI 与 plan 一致;是否加入见停车场第 11 条。卫生扫描脚本本身是 plan 内交付物,由 TC-17 验证 |

没有对 plan 测试表做机械性更正;17 条用例的步骤、预期与档位均按原文执行。

## 停车场

只记录、未实现:

1. `README.md` 的「状态」一句与 `AGENTS.md`「目录约定」里的「代码尚未生成」已经过时;两个文件都不在本任务改动范围内。
2. `data` 里的资源字段(`blog.post.heroImage`、`wiki.site.logo`)发布时如何替换成定稿后的引用:需要在注册表登记哪些字段是资源。
   目前 `entries.data` 原样写入,信封里的 `icon`、`seo.ogImage` 已经替换。留给编译 / 发布任务定。
3. 各类型需要哪些本地化短文本(例如 `wiki.site` 的一句话简介):`l10n` 机制已就位,首版没有类型声明键。
4. 模板里补一张占位分享图:`templates/blog.post/item.json` 引用了 `og.png`,模板目录里没有这个文件;引用是否存在归「校验」任务检查,
   届时模板需要带上它。
5. 模板目录里放一份示例 `site.json`:现在模板的占位值(参与者 `author`、描述键 `public-api`)依赖测试里的示例配置。
6. 资源来源的相对路径按单元目录还是仓级目录解析,契约只校验了格式;解析规则归「校验」/ 编译任务。
7. CI 未运行消费侧冒烟(`pnpm run smoke:consumer`);plan 的 CI 范围没有列它。
8. `.nvmrc` 写的是 22.23.5,本机是 22.22.3;按要求未改。脚本依赖 Node 22.18 起默认开启的类型擦除,`engines` 写的是 `>=22`,
   两者之间有一段版本(22.0–22.17)能安装使用契约、但跑不了本仓的生成脚本。
9. 卫生扫描的语言规则检测不到与元素名同形的两字母代码(`tr`、`th`、`li` 等),脚本头部已说明;要更严只能改为解析语法树。
10. `eventKind`、`guideKind` 目前只约束格式;使用方接入后是否收紧为枚举或词表。
11. CI 增加「公开仓卫生扫描」一步(`pnpm run check:hygiene`):脚本已交付并由 TC-17 验证,但 plan 的 CI 范围没有列它。
