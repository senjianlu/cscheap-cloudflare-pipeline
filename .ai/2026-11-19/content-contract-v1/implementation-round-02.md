---
task: content-contract-v1
round: 02
date: 2026-11-19
---

# 实现记录:第 02 轮

## 本轮改动

第 2 轮:只修 `review-round-01-fail.md` 的 R-01 至 R-05,逐项对应;未提交、未推送、未运行评审脚本。
未改 `plan.md`,未改第 1 轮的记录。

| 文件 | 改动摘要 |
|---|---|
| `contract/ast.ts` | R-01:新增 `MAX_HREF_LENGTH = 4096`,`SafeHref` 的长度上限从 2048 改回既有文档站的 4096 |
| `contract/primitives.ts` | R-02 / R-03:新增 `normalizeUtc`(小数固定九位的定宽写法)、`NormalizedUtcDateTime`、`compareUtc`(按九位小数的完整精度比较);删除只保留毫秒的 `utcMillis` |
| `contract/envelope.ts` | R-03:`workflow` 的先后比较改用 `compareUtc`;格式不合法的项由字段自身的校验报告,比较时跳过 |
| `contract/release.ts` | R-02:`toEntryRow` 把 `published_at`、`updated_at` 规范化后写入(`publishTime`);`EntryRow` 这两列的 schema 改为只接受规范化写法 |
| `contract/site.ts` | R-05:`admits` 先用 `Object.hasOwn` 确认频道是配置里的自有属性 |
| `scripts/check-hygiene.sh` | R-04:域名增加「`assetHosts` 字段取值」规则(任何顶级域);语言改为「语言字段取值(任何合乎语法的标签)+ ISO 639-1 全表的带引号两字母代码 + 语言-地区标签 + 常见代码作对象键」;歧义位置按「文件 + 词」精确豁免(`LANG_EXEMPT`);自检样本增加 12 个应命中、扩充应通过 |
| `test/ast.test.ts` | R-01:3000、4095、4096 字符的合法链接(外链与站内路径)通过;4097 字符被拒 |
| `test/envelope.test.ts` | R-03:同一毫秒内的倒退、不同小数位数间的倒退被拒且错误指向倒退的那一项;同一时刻的不同写法、同一毫秒内前进通过;`normalizeUtc` / `compareUtc` 的直接断言 |
| `test/migration.test.ts` | R-02:无小数与不同小数位数混排的 11 条数据打乱写入本地 D1,按 `published_at` 正序、倒序与范围查询的顺序都等于真实时间顺序,且走索引;列值为定宽写法、精度不丢;原有的往返断言改为规范化后的值 |
| `test/site.test.ts` | R-05:未配置时 `constructor` 等与继承属性同名的频道一律不准入、不抛错;显式配置 `constructor` 频道时按配置准入 |
| `docs/architecture/contract.md` | R-01:§3.2 写明链接长度上限 4096;R-02 / R-03:§8 新增「规范化的 UTC 时间」一行(标「项目约定」),§1.5、§4、§7 相应说明 |
| `docs/architecture/publishing.md` | R-02:新增「输入到行的映射」一节,写明两个时间列的规范化规则 |

`schemas/` 未变(`check-schemas.sh` 无漂移):五项修复都不改变信封与仓级输入的结构,信封输入仍接受原有的时间写法。

## plan 评审 minor 交接

不适用(仅第 1 轮填写)。

## 修复对照

| 评审问题编号 | 严重度 | 修复方式 |
|---|---|---|
| R-01 | major | `a.href` 的长度上限改回基线的 4096(`MAX_HREF_LENGTH`),不再套用 2048。TC-04 新增:3000 / 4095 / 4096 字符的 https 链接与站内路径通过,4097 字符被拒。证据:`TC-04-r2.log`;基线样本仍原样通过:`TC-05-r2.log` |
| R-02 | major | 选定的表示:`YYYY-MM-DDTHH:MM:SS.fffffffffZ`,小数固定九位(契约接受的最高精度,不足补零)——不丢精度、定宽,按字典序比较即按时间比较。`toEntryRow` 写 `published_at`(含取自 `workflow` 的缺省值)与 `updated_at` 时规范化;`EntryRow` 只接受这种写法;信封输入不变。TC-14 新增「无小数 + 不同小数位数混排」的写入与查询顺序验证(正序、倒序、范围、走索引),并保留一条断言说明原样文本排序是错的。写进 `contract.md` §8(项目约定)与 `publishing.md`。证据:`TC-14-r2.log` |
| R-03 | major | `workflow` 的时间比较改为按九位小数的完整精度(比较规范化后的定宽文本),不再经 `Date.parse`。TC-02 新增 6 条倒退用例(含评审举的 `.0009Z` → `.0001Z`、第九位小数的倒退、不同位数间的倒退)与 4 条通过用例(同一时刻的不同写法、同一毫秒内前进)。证据:`TC-02-r2.log` |
| R-04 | major | 卫生扫描不再只靠有限枚举:① 域名——识别配置字段 `assetHosts`,其每个取值不论顶级域都必须在允许清单内(支持跨行数组与 JSON 写法);② 语言——识别语言字段(`locales` 数组、`defaultLocale` / `locale` 的值、`labels` / `title` 对象的键),任何合乎语法的语言标签都算(含三字母代码);带引号的两字母代码改用 ISO 639-1 全表;③ 歧义位置按「文件 + 词」精确豁免(`contract/ast.ts` 的 `tr` `th` `li` `br` `hr` 等 11 条),并有两个自检样本证明同样的词在别的文件、别的词在同一文件仍会命中。评审给的三个漏检样本(`assetHosts: ['cdn.customer.cloud']`、`locales: ['fi']`、模板 JSON 的 `labels: {fi: …}`)已加入「应命中」。自检共 27 个应命中样本,仓库无命中。证据:`TC-17-r2.log` |
| R-05 | major | `admits` 先 `Object.hasOwn(site.channels, channel)` 再取值。TC-07 新增:未配置时 `constructor`、`toString`、`valueOf`、`__proto__`、`hasOwnProperty` 等不抛错并返回 false;显式配置名为 `constructor` 的频道时按其 stage 列表准入。证据:`TC-07-r2.log` |

## 测试结果

修复改动了 `contract/` 的公共模块,所以 17 条用例全部对修复后的代码重跑,证据为 `TC-NN-r2.log`。**本轮结果以 `-r2` 为准**。
另外整体跑过一次 `pnpm test`(13 个文件、562 条通过)。

| 编号 | 档位 | 结果 | 证据 |
|---|---|---|---|
| TC-01 | A | pass | TC-01-r2.log |
| TC-02 | A | pass | TC-02-r2.log |
| TC-03 | A | pass | TC-03-r2.log |
| TC-04 | A | pass | TC-04-r2.log |
| TC-05 | A | pass | TC-05-r2.log |
| TC-06 | A | pass | TC-06-r2.log |
| TC-07 | A | pass | TC-07-r2.log |
| TC-08 | A | pass | TC-08-r2.log |
| TC-09 | A | pass | TC-09-r2.log |
| TC-10 | A | pass | TC-10-r2.log |
| TC-11 | A | pass | TC-11-r2.log |
| TC-12 | A | pass | TC-12-r2.log |
| TC-13 | A | pass | TC-13-r2.log |
| TC-14 | A | pass | TC-14-r2.log |
| TC-15 | A | pass | TC-15-r2.log |
| TC-16 | A | pass | TC-16-r2.log |
| TC-17 | A | pass | TC-17-r2.log |

命令与第 1 轮相同:TC-01 `pnpm run check:static`;TC-02–09、11–15 `pnpm exec vitest run test/<名称>.test.ts --reporter=verbose`;
TC-10 `bash scripts/check-schemas.sh`;TC-16 `bash scripts/smoke-consumer.sh`;TC-17 `bash scripts/check-hygiene.sh`。

通过的用例数相对第 1 轮终态的变化:TC-02 83 → 94(R-03 的 11 条);TC-04 57 → 59(R-01 的 2 条);
TC-07 33 → 35(R-05 的 2 条);TC-14 22 → 26(R-02 的 4 条);TC-17 应命中样本 15 → 27(R-04);其余不变。

## 与方案的偏差

无新增。没有对 plan 测试表做机械性更正;新增的测试都放在已有的测试文件里,对应已有的用例编号。

## 停车场

第 1 轮的条目继续有效,本轮新增:

1. `img.src` 的长度上限现为 2048,而基线里既有形式 `/assets/<文件名>` 没有长度上限。R-01 只指出了链接(`a.href`),
   这里没有动;要严格做到「只做加法」,可以去掉这个上限。
2. `releases.created_at`、`channel_pointers.activated_at` 由发布器提供,契约只要求是 UTC 时间,没有要求规范化写法;
   这两列目前没有排序用途。发布任务若要按它们排序,应同样用 `normalizeUtc`。
3. 卫生扫描里「带常见顶级域的裸域名」仍是启发式(本轮只补了几个顶级域);不在 `assetHosts` 字段、也不带协议的任意顶级域裸域名
   仍可能漏检。要完全覆盖只能对照公共后缀表,需要新增数据文件或依赖。
4. 卫生扫描的语言字段规则认的是字段名(`locales`、`defaultLocale`、`locale`、`labels`、`title`);`site.specs` 里以语言为键的对象
   没有纳入(键的位置只查常见代码)。
