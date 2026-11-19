---
status: approved
task: content-contract-v1
date: 2026-11-19
approved_at: 2026-11-19 12:25
evidence_format: v1
impl_fix_max_rounds: 5
---

# 方案:内容契约 v1(信封、类型注册表、正文 AST、D1 表、R2 路径)与工程骨架

## 需求原文

> 在我设想中,docs 和 content 经历一样的 ci 流程将数据内容上传到 CF,区别在于 docs 由前端渲染,content 由 wiki 和 blog 进行渲染。
>
> 关于内容契约的设计,涉及到文章、wiki、饰品和 docs 等的"元数据"或是"数据结构"概念吗?……同时考虑不同项目结构的不同,最好能有类似模板的概念?
>
> 我希望 blog 文章、wiki 内容都用 R2 或者 D1 存储、和饰品信息保持一致。
>
> (图标)我觉得用引用就可以……图标名就不走受控清单了,然后自定义图片图标最好也能支持。(图标库已对齐为 Lucide。)
>
> (共享管线)要不发布为一个单独的公开仓库?

对齐结论:语言标签用 BCP 47;缺译文的语言不出页;标签用受控词表;同步类实体(如饰品)不在 Git,但要进同一张类型注册表;
存储用 D1(元数据 + 正文 AST)与 R2(二进制),按版本原子切换并可回滚。

**本任务交付**:一份可被内容仓与渲染端钉版本引用的契约库(Zod 源 + 生成的 JSON Schema)、对应的 D1 迁移、
各内容类型的脚手架模板、契约文档,以及支撑它们的工程骨架与 CI。不含校验命令行、MDX 编译与发布。

## 背景与目标

本仓目前只有工作流与文档骨架。后续的校验、编译、发布三个任务,以及两类读取端,都要以同一份契约为准,所以契约先行。

目标:

1. 定义**公共信封**(所有内容单元共用的元数据)与**类型注册表**(每个类型的专属数据、是否有正文、来源)。
2. 定义**正文 AST**:受白名单约束,渲染端不编译、不 `eval`。
3. 定义**发布侧形状**:D1 表结构(版本、频道指针、内容寻址正文、条目、译文、标签、引用边、重定向、词表)与 R2 路径。
4. 提供**模板**:每个 Git 类型一个脚手架单元,且模板自身通过契约校验。
5. 契约只有一份:JSON Schema、迁移中的常量、文档都从 `contract/` 派生或由测试核对一致。

## 改动范围

| 路径 | 内容 |
|---|---|
| `contract/primitives.ts` | 基础类型:BCP 47 语言标签、RFC 3339 UTC 时间、sha256 摘要、slug、id、安全 URL、体积上限常量 |
| `contract/site.ts` | 使用方配置 `site.json` 的 schema(§0),以及由它派生出带语言 / 频道 / 参与者上下文的契约的工厂函数 |
| `contract/inputs.ts` | 内容仓的仓级输入:词表、重定向、导航的 schema(§1.1) |
| `contract/envelope.ts` | 公共信封 `item.json` 与各语言 frontmatter 的 schema(字段见实现方案 §1) |
| `contract/types.ts` | 类型注册表与各类型的 `data` schema(§2) |
| `contract/ast.ts` | 正文 AST 节点、组件注册表、目录、搜索用结构化文本(§3) |
| `contract/release.ts` | 发布侧形状:版本、指针、页对象、条目行、引用边等的 schema 与表名 / 列名常量(§4) |
| `contract/storage.ts` | R2 路径生成函数与资源 MIME 白名单(§5) |
| `contract/limits.ts` | 体积上限与按原始字节计量的检查入口(§7) |
| `contract/index.ts` | 统一导出与 `CONTRACT_VERSION` |
| `migrations/0001_init.sql` | §4 的建表与索引 |
| `scripts/gen-schemas.ts`、`scripts/check-schemas.sh`、`scripts/smoke-consumer.sh` | 从 Zod 生成 `schemas/*.schema.json`;漂移比较;消费侧冒烟(后两者为 TC-10、TC-16 的断言脚本) |
| `schemas/` | 生成物:`site`、每个 Git 类型一份(信封 + 该类型 `data` 与提升必填)、`frontmatter`、`taxonomy`、`redirects`、`navigation` |
| `templates/<type>/` | 每个 Git 类型一个脚手架单元(`item.json` + 示例语言正文) |
| `test/` | 契约单测、AST 白名单与既有基线兼容、模板校验、生成 Schema 的语义与漂移检查、存储路径、体积边界、迁移在本地 D1 上的集成测试、消费侧冒烟;样本在 `test/fixtures/`(含 `ast-baseline/`,见 §3) |
| `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`tsconfig.json`、`eslint.config.mjs`、`.prettierrc`、`vitest.config.ts` | 工程骨架(实现必需:没有它们契约无法类型检查与测试) |
| `.github/workflows/ci.yml` | 本仓 CI:lint、类型检查、测试、Schema 漂移检查(实现必需:契约仓的防漂移手段) |
| `docs/architecture/README.md`、`overview.md`、`contract.md`、`publishing.md`、`usage.md` | 架构回写;`contract.md` 是人读的契约全文,逐条标注出处或标明「项目约定」;`publishing.md` 只写本任务已定的写序、激活与回滚**契约**,`usage.md` 只写引用方式与 `site.json`,二者都标明哪些能力尚未实现 |
| `docs/decisions/0002`、`0003` 与索引 | 0002 信封 + 类型注册表的形状;0003 D1 版本化表与内容寻址正文 |
| `CHANGELOG.md` | Unreleased 条目 |

明确不动:`.ai-workflow/`、`.claude/`、`.githooks/` 等工作流受管文件。

## 非目标

- 校验命令行、跨单元规则(id 唯一、引用可解析、slug 与路径一致)的**执行**——本任务只在契约里定义规则与数据形状,执行归「校验」任务。
- MDX → AST 的编译器、代码高亮、目录与搜索文本的生成。
- 写入 D1 / R2、指针切换、回滚、清理的实现,以及可复用 GitHub 工作流。
- 任何使用方仓库的迁移(现有文档仓的旧契约升级、网站数据迁入)与读取端改造。
- 创建或修改任何 Cloudflare 资源;远端 D1 上的验证(本任务只在本地 D1 验证迁移)。
- 站内全文检索方案(D1 FTS 等)。契约只保留「每页的搜索用结构化文本」。
- 同步类实体(饰品等)的表结构:归同步方所有,本仓只在注册表里登记其类型与引用键格式。
- 公开仓卫生的机器扫描(原 §8 与 TC-17):用户 2026-11-19 裁决取消——该项不是重要交付,靠 AGENTS.md 的「使用方无关」「公开仓卫生」规则与评审把关即可;已实现的脚本与数据文件随之删除,见实现记录第 04 轮。
- 发布 npm 包;打 tag(契约稳定并有首个使用方接入后另行决定)。

## 实现方案

版本:`CONTRACT_VERSION = 1`(新谱系;与现有文档仓的旧契约编号无关)。Git 侧键名 camelCase;时间一律 RFC 3339 UTC。

分发入口:`package.json` 的 `exports` 指向构建产物(ESM + 类型声明),`prepare` 脚本在以 git 依赖安装时完成构建;
对外入口只有包根(契约)一个。

### 0. 使用方配置 `site.json`

| 字段 | 说明 |
|---|---|
| `source` | 来源标识(小写短词);用于指针行与 R2 清单路径 |
| `locales[]`、`defaultLocale` | BCP 47;`defaultLocale` 必须在 `locales` 内。**主稿 = `defaultLocale` 的正文文件**,其余为译文 |
| `channels` | 频道名 → 准入的 `stage` 列表(如预览频道收 `reviewed` 与 `published`,生产频道只收 `published`);频道名与数量由使用方定,至少一个 |
| `actors[]` | `workflow[].by` 的合法取值 |
| `types` | 启用的类型键 → `{urlPattern}`;键必须是注册表里 `source: git` 的类型 |
| `assetHosts[]` | 允许被内容以绝对地址引用的外部资源域名(仅 `https`);缺省为空 |
| `specs` | 可选。外部描述文件的登记:`<描述键>` → `{<locale>: 仓内相对路径}`;供正文模式为 `generated` 的类型定位来源(§2) |

渲染端也需要其中一部分配置(把实体引用解析成地址、判断外部资源是否可用)。因此发布时把 `locales`、`defaultLocale`、
`types`(含 `urlPattern`)、`assetHosts` 作为快照写入该版本(§4 `releases.site`),渲染端从版本读取,不另行维护一份。

契约里与语言、频道、参与者有关的 schema 不写死取值,由 `createContract(site)` 按配置生成;JSON Schema 生成时对这些位置
输出格式约束(语言标签的正则等),取值集合的校验留在 Zod 侧并在 `contract.md` 列明。

### 1. 公共信封

`item.json`(语言无关):

| 字段 | 必填 | 说明 |
|---|---|---|
| `schemaVersion` | 是 | 等于 `CONTRACT_VERSION` |
| `type` | 是 | 注册表里的类型键 |
| `id` | 是 | 类型内唯一、永不改;全局引用写作 `<type>:<id>` |
| `slug` | 是 | URL 段,ASCII,各语言相同;可改,改动须登记重定向 |
| `stage` | 是 | `draft` / `reviewed` / `published` / `held` / `retired`;哪个 `stage` 进哪个频道由 `site.channels` 决定(§0) |
| `workflow[]` | 是 | 只追加:`{stage, by, at, note?}`;时间不减,末项 `stage` 等于顶层 `stage`;`by` 的取值由 `site.json` 给定 |
| `publishedAt`、`updatedAt` | 否 | 缺省时 `publishedAt` 取首次进入 `published` 的时间;`updatedAt` 表示实质修订 |
| `authors[]` | 否 | 引用词表 `authors` |
| `sources[]` | 否 | `{kind:"url", url, retrievedAt?}` 或 `{kind:"project", id}` |
| `category`、`tags[]` | 否 | 引用受控词表 |
| `refs[]` | 否 | 显式关系:`{rel, target}`,`rel` 取 `about` / `mentions` / `related` / `partOf` / `supersedes`,`target` 为全局引用 |
| `icon` | 否 | 不写 = 类型默认;`false` = 不显示;字符串 = Lucide 图标名(短横线写法,只校验格式,**不设受控清单**);`{image, imageDark?, width?, height?}` = 图片,`image` / `imageDark` 为单元内或仓级资源的相对路径,或域名在 `site.assetHosts` 内的 `https` 绝对地址(绝对地址时 `width`、`height` 必填) |
| `seo` | 否 | `{noindex?, canonical?, ogImage?}` |
| `data` | 是 | 类型专属,由该类型 schema 校验(可为空对象) |

各语言正文文件 `<locale>.mdx` 的 frontmatter:`title`、`description` 必填;译文必填 `sourceDigest`(主稿全文的 sha256),主稿不得带;
可选 `seoTitle`、`summary`、`imageAlt`,以及该类型声明的本地化短文本 `l10n`。

语言文件与正文的关系(`generated` 类型除外):

- 一个单元**有哪些语言 = 有哪些 `<locale>.mdx` 文件**;主稿文件必须存在,译文文件可缺(缺则该语言不出页)。
- 正文模式 `optional` 指**正文内容可为空**:文件仍须存在并带完整 frontmatter,只是 frontmatter 之后没有正文。
  此时该语言照常产生 `entry_locales` 行,`object_sha256` 为空,页面照常生成。
- 正文模式 `required` 的类型,正文为空即不合法。

原则:能翻译的进 frontmatter,不能翻译的进 `item.json`,能算出来的只进数据库。

`stage` 五态与只追加的 `workflow` 沿用现有文档仓已在用的审核流(使两个内容仓同一套流程是需求原文的要求),不是新增业务规则。

### 1.1 仓级输入(词表、重定向、导航)

| 文件 | 结构 |
|---|---|
| `taxonomy/<vocabulary>.json` | `{schemaVersion, vocabulary, terms: {<键>: {labels: {<locale>: 文本}, …}}}`;`vocabulary` 取 `authors` / `categories` / `tags`;`defaultLocale` 的标签必填;`authors` 的项可带 `url` |
| `redirects.json` | `{schemaVersion, redirects: [{from, to, status, locale?}]}`;`from` / `to` 为站内路径,`status` 取 301 / 308,`locale` 缺省表示对全部语言生效 |
| `navigation.json` | `{schemaVersion, groups: [{title: {<locale>: 文本}, icon?, pages: [全局引用…]}]}`;可选文件,`icon` 取值同信封 |

本任务只定义这三种文件的 schema。信封里的 `authors` / `category` / `tags` 是否能在词表中找到、改 slug 是否登记了重定向,
属于跨文件规则,执行归「校验」任务。

### 1.2 输入字段到发布字段的映射

| 输入 | 发布位置(§4) |
|---|---|
| `type`、`id`、`slug`、`category` | `entries` 同名列 |
| `publishedAt`、`updatedAt` | `entries.published_at`、`entries.updated_at` |
| `seo.noindex` | `entries.noindex`(单列,供 sitemap 过滤) |
| `authors`、`sources`、`seo.canonical`、`seo.ogImage`、`icon` | `entries.meta`(JSON) |
| `data` | `entries.data`(JSON) |
| `tags` | `entry_tags` |
| `refs` 与正文里的引用 | `links` |
| frontmatter `title`、`description`、`summary`、`l10n` | `entry_locales` 同名列 |
| frontmatter `seoTitle`、`imageAlt` | `entry_locales.seo_title`、`entry_locales.image_alt` |
| 正文与图标引用到的仓内资源 | R2 + `release_assets` |
| `site.json` 的渲染相关子集 | `releases.site` |
| 正文 | `objects` + `entry_locales.object_sha256` |
| `stage`、`workflow`、`schemaVersion`、`sourceDigest` | **不发布**(只用于准入与校验) |

### 2. 类型注册表

每个类型登记:`source`(`git` 或 `sync`)、正文模式(`required` / `optional` / `none` / `generated`)、`data` schema、`l10n` schema、信封里被提升为必填的字段、默认图标名。
`generated` 表示仓里没有正文文件:`data.spec` 给出 `site.specs` 里的描述键,连同该类型的定位字段(对 `docs.api` 是 `operationId`)
确定来源。**有哪些语言 = 该描述键登记了哪些语言的文件**;各语言的标题与描述取自对应语言描述文件中该操作的摘要与说明。
这类单元只有 `item.json`。生成的执行归编译任务,本任务只定义定位字段与 `site.specs` 的结构。
**提升必填在类型组合后的 Zod 结构里表达**(不是事后的校验函数),因此生成的每类型 JSON Schema 带有同样的必填约束。
URL 模式、是否启用由使用方的 `site.json` 决定,不写进注册表。

| 类型 | 来源 | 正文 | `data` 必填 | `data` 可选 |
|---|---|---|---|---|
| `blog.post` | git | required | —(信封 `authors`、`seo.ogImage` 提升为必填) | `series`、`heroImage` |
| `wiki.site` | git | optional | `name`、`url`、`code` | `affUrl`、`featured`、`order`、`risk`、`rating{provider,url,score?,reviews?,ratedAt?}`、`marketCode`、`foundedYear`、`sameAs[]`、`logo` |
| `wiki.event` | git | required | `eventKind`、`startDate` | `endDate`、`datePrecision`、`officialUrl`、`location{name,address}`、`organizer` |
| `wiki.guide` | git | required | `guideKind` | `difficulty`、`term` |
| `docs.page` | git | required | `kind`(tutorial / how-to / reference / explanation) | `deprecated`、`projects[]` |
| `docs.api` | git | generated | `spec`、`operationId` | `deprecated` |
| `item` | sync | none | —(不经本仓校验) | — |

`sync` 类型只登记类型键与引用键格式(`item:<命名空间>/<名称>`),使内链解析与引用边对两类实体走同一套规则;
它没有模板、没有 `stage`,数据与表结构归同步方。

首版类型集合的依据:需求原文点名了「文章、wiki、饰品和 docs」。`wiki.site` 的字段取自使用方现有网站目录数据的实际字段,
`docs.page` / `docs.api` 取自现有文档仓的两类单元(手写页与由接口描述生成的参考页),`wiki.event` / `wiki.guide` 对应已确认的
「大事件」与指南条目。`blog.post` 把作者与分享图提升为必填,是因为文章页的结构化数据与分享卡片依赖它们。这些取舍列入摘要交用户裁决。

### 3. 正文 AST

沿用现有文档站已在生产中使用的形状,保证既有渲染器可以继续工作,只做三处扩展。

**兼容基线(已固定,见任务目录 `assets/ast-baseline/`)**:

- `existing-ast-contract.ts`:既有文档仓契约中正文 AST、目录、搜索用结构化文本的定义摘录,来源提交
  `7040c14587c82e2d4241af2ab6ac975faaf56946`。
- 5 个页对象样本(文件名为原始字节的 sha256,未经改写)与 `manifest.json`(来源提交、每个样本的语言与路径、覆盖的节点清单)。
  覆盖:`p strong code a blockquote ul ol li h2 h3 table thead tbody tr th td`、`codeBlock`、`Callout`(info、warning);三种语言各至少一份。
  既有产物中没有 `img` 节点,`img` 的既有形状以定义摘录为准。

实现时把这 5 个样本原样复制到 `test/fixtures/ast-baseline/`(字节一致,由测试核对 sha256)。兼容的判据:样本的 `body`、`toc`、
`structuredData` **不经改写**即通过新契约的校验;样本里的站内链接按「已解析的站内路径」处理。

既有形状(不变):

- `codeBlock`:`{type, lang, title?, colors: [{light, dark}](≤64 项,十六进制色值), lines: [[文本, 调色板下标]…]}`;下标为 -1 表示无色,其余必须小于 `colors` 长度。
- `toc`:`[{title, url(以 # 开头), depth(2–6)}]`。
- `structuredData`:`{headings: [{id, content}], contents: [{heading?, content}]}`。

扩展:

- 节点四种:`text`、`element`、`codeBlock`、`component`;根为 `root`;嵌套深度上限 64;不允许原始 HTML 与表达式。
- 元素白名单不变:`p strong em del blockquote ul ol li hr br table thead tbody tr th td code a img h2`–`h6`;标题必须带 id。
- **扩展一(链接)**:`a.href` 除锚点、外链(只认 `https` / `http` / `mailto`)外,允许两种站内形式——已解析的站内路径,
  或未解析的实体引用 `ref:<type>:<id>`(同步类实体在渲染期解析,目标缺失时渲染端降级为纯文本)。
  站内路径不再写死任何语言或路径前缀,合法性由编译任务按 `site.json` 判定。
- **扩展二(图片)**:`img.src` 为资源引用(编译后指向内容寻址的 R2 路径),可带 `width`、`height`(避免布局抖动)。
- **扩展三(组件)**:组件注册表,首批两项——`Callout{type: info|warning|tip|danger, title?}`(既有组件,`info` / `warning` 为既有取值)、
  `EntityCard{ref}`(嵌入一个实体的卡片,`ref` 为全局引用;需求里「文章中引用饰品 / 网站」的载体)。未登记的组件一律不合法。

页对象:`{schemaVersion, type, id, locale, body, toc, structuredData}`;单个页对象上限 256 KiB(序列化后)。

### 4. D1 表(`migrations/0001_init.sql`)

Git 内容用「单表多类型 + JSON 列」,不按类型分表:列表、反向链接、sitemap 都是跨类型查询,新增类型不应要求迁移。

| 表 | 主键 | 作用 |
|---|---|---|
| `releases` | `release_id` | 一次发布:`source`、`channel`、`commit_sha`、`contract_version`、`status`(`writing` / `ready`)、`expected`(JSON:各表应有行数、对象数、资源数)、`assets_verified`(0 / 1)、`site`(JSON 快照,§0)、`created_at` |
| `channel_pointers` | `(source, channel)` | `current_release`、`previous_release`(可空)、`activated_at`;某来源某频道从未激活时**没有这一行** |
| `objects` | `sha256` | 内容寻址、不可变、跨版本去重:`kind`、`size`、`body`(页对象 JSON) |
| `entries` | `(release_id, type, id)` | 语言无关的一行:`slug`、`category`、`published_at`、`updated_at`、`noindex`、`meta`(JSON)、`data`(JSON) |
| `entry_locales` | `(release_id, type, id, locale)` | 译文行:`title`、`description`、`seo_title`、`summary`、`image_alt`、`l10n`、`object_sha256`(空 = 无正文) |
| `entry_tags` | `(release_id, tag, type, id)` | 标签成员 |
| `links` | `(release_id, source_type, source_id, source_locale, target_type, target_key, rel)` | 正向引用边;反向链接靠 `(release_id, target_type, target_key)` 索引查询 |
| `redirects` | `(release_id, locale, from_path)` | `to_path`、`status` |
| `release_assets` | `(release_id, sha256, name)` | 该版本引用的 R2 资源清单:`mime`、`size`;路径由 `sha256` 与 `name` 按 §5 生成 |
| `taxonomy_terms` | `(release_id, vocabulary, term)` | 词表项与各语言标签(JSON) |
| `nav` | `(release_id, locale)` | 导航树 JSON(分组可带 `icon`);不用导航的使用方不写此表。保留它是因为现有文档站的侧栏依赖导航树,且「分组图标」是已确认的需求 |

索引:`entries(release_id, type, slug)` 唯一;`entries(release_id, type, published_at DESC)`;
`entries(release_id, type, category, published_at DESC)`;`links(release_id, target_type, target_key, source_type)`;
`entry_locales(release_id, locale, type)`。

发布契约(实现归发布任务;此处定规则,并在本地 D1 上以 SQL 验证其可表达):

1. **资源定稿**(在生成正文 AST 之前):对每个被引用的仓内资源,先做该类型要求的处理(svg 清洗),再对**处理后的字节**
   计算 sha256,得到最终路径;正文 AST 与图标引用的是这个最终路径。之后不得再改动资源字节或 AST 中的资源引用,
   因此页对象的摘要与体积在此之后是确定的。`contract/storage.ts` 提供 `finalizeAsset(资源, 处理函数?)` 作为这一步的唯一入口。
2. **写入**:R2 上传资源并逐个核对存在与大小 → `objects`(已存在则跳过)→ `releases` 一行(`status = 'writing'`,
   `assets_verified = 0`,带 `expected` 与 `site`)→ 带新 `release_id` 的各表行(含 `release_assets`)→ R2 写入清单。
   `release_assets` 中的全部资源与清单都核对无误后,才把 `assets_verified` 置为 1。
3. **就绪**:同时满足三项才把 `status` 改为 `ready`——各表该 `release_id` 的实际行数与 `expected` 相符;
   `entry_locales` 引用的每个 `object_sha256` 在 `objects` 中存在;`assets_verified = 1`。
   `ready` 之后该版本的全部行不可变;`assets_verified` 置位与 `writing → ready` 是版本行仅有的两次更新。
4. **首次激活**(该来源该频道没有指针行):带条件的插入——仅当目标版本存在、`status = 'ready'`、`source` 与 `channel`
   与指针一致、且指针行仍不存在时插入,`previous_release` 为空。
5. **切换**:带条件的单条更新——除第 4 步对目标版本的三个条件外,还要求 `current_release` 等于写入前读到的值,
   且**不等于目标版本**;成立则 `previous_release` 取旧的 `current_release`。
6. **结果判定**(影响行数 + 回读指针):影响 1 行 = 已切换;影响 0 行且 `current_release` 已是目标 = **已是当前版本**
   (幂等成功,`previous_release` 与 `activated_at` 不变);其余 = 冲突或目标不合格,指针不变。
7. **回滚**:与切换同一条语句,目标取某个仍为 `ready` 且同来源同频道的版本;对已是当前版本的目标同样判为幂等成功。
8. **读取**:每个请求先取指针,其后所有查询显式带 `release_id`。

频道指针是发布完成后唯一会被改写的行。

### 5. R2 路径

- `assets/<sha256>/<文件名>`:内容寻址、不可变;MIME 白名单 `png`、`jpeg`、`webp`、`svg`、`ico`、`json`。`sha256` 是**实际上传字节**的摘要:
  svg 在资源定稿时先清洗再计算摘要(§4 第 1 步);清洗器的实现归编译任务,契约只规定顺序与摘要口径。文件名只允许字母、数字、点、下划线、短横线。
- `<source>/releases/<releaseId>/manifest.json`:该版本的清单,供审计与重建;`source` 须符合 `site.json` 的格式,`releaseId` 为 64 位十六进制摘要。
- 路径一律由 `contract/storage.ts` 的函数生成,函数对非法入参抛错,不拼接未经校验的片段。

### 6. Schema 生成与模板

- Zod 是唯一事实源;`scripts/gen-schemas.ts` 生成 JSON Schema 入库,CI 重新生成并要求无差异。
- JSON Schema 表达不了的跨字段规则(`workflow` 时间单调、末项 `stage` 一致、主稿 / 译文与 `sourceDigest` 的关系、取值集合来自 `site.json`)留在 Zod 的校验函数里,并在 `contract.md` 列明;结构性约束(含各类型的提升必填)必须进 JSON Schema。
- `templates/<type>/` 每个 Git 类型一份,占位值可直接通过契约校验;由测试保证模板与契约不漂移。正文模式为 `generated` 的类型,
  模板只有 `item.json`。模板里的正文示例只放一份主稿,文件名用示例语言 `en`。

### 7. 体积上限

按**原始文件字节**计量(UTF-8 编码后的字节数,含空白)的输入,及各自上限:

| kind | 上限 |
|---|---|
| `site`(`site.json`) | 64 KiB |
| `item`(`item.json`) | 64 KiB |
| `frontmatter`(一份正文文件的 frontmatter 段) | 16 KiB |
| `taxonomy`(单个词表文件)、`redirects` | 各 1 MiB |
| `navigation` | 256 KiB |

页对象(`page`)按规范序列化后的字节数计量,上限 256 KiB。
`contract/limits.ts` 提供 `checkSize(kind, bytes)`,在解析之前调用;上限为「小于等于」。

## 测试用例

| 编号 | 档位 | 前置条件 | 步骤 | 预期结果 | 证据形态 |
|---|---|---|---|---|---|
| TC-01 | A | 依赖已安装 | `pnpm lint && pnpm typecheck` | 退出码 0 | (a) `evidence.sh TC-01 -- pnpm run check:static` |
| TC-02 | A | 同上 | 信封单测:每个 Git 类型一份合法样本;非法样本含缺必填、未知字段、`workflow` 时间倒退、末项 stage 不符、译文缺 `sourceDigest`、主稿带 `sourceDigest`、非法语言标签、非 UTC 时间 | 合法全部通过;每个非法样本被拒且错误指向对应字段。另含语言文件规则:`optional` 类型的主稿只有 frontmatter(合法,映射为 `object_sha256` 为空的译文行);只有主稿、没有译文(合法,只产生一行);缺主稿(非法);`required` 类型正文为空(非法) | (a) 包住 `vitest run test/envelope.test.ts` |
| TC-03 | A | 同上 | 类型单测:`blog.post` 缺 `authors`、缺 `seo`、缺 `seo.ogImage`;`wiki.event` 缺 `startDate`;`wiki.site` 的 `url` 为 `javascript:`;未注册的 `type`;`docs.api`:`spec` 指向 `site.specs` 中存在的键(合法)、缺 `spec`、`spec` 不在 `site.specs`、描述路径含 `..` 或为绝对路径 | 非法全部被拒;同字段的合法值通过 | (a) 包住 `vitest run test/types.test.ts` |
| TC-04 | A | 同上 | AST 单测:未登记组件、原始 HTML 节点、`a.href` 为 `javascript:` 与含路径穿越、无 id 的标题、`img` 带子节点、嵌套 65 层、调色板下标等于 `colors` 长度、`ref:` 引用格式错误 | 全部被拒;含 `EntityCard`、`ref:` 链接、带宽高图片、下标为 -1 的合法树通过 | (a) 包住 `vitest run test/ast.test.ts` |
| TC-05 | A | `test/fixtures/ast-baseline/` 已从任务 `assets/ast-baseline/` 原样复制 | 核对每个样本文件的 sha256 等于文件名;用新契约校验其 `body`、`toc`、`structuredData`,不做任何改写 | 5 个样本摘要相符且全部通过 | (a) 包住 `vitest run test/ast-baseline.test.ts` |
| TC-06 | A | 依赖已安装 | 图标单测:不写、`false`、合法图标名、`{image}` 相对路径、`{image,imageDark}`、白名单域名的 `https` 地址带宽高;非法:`true`、空串、含大写或空格的名字、相对路径含 `..`、`http` 地址、域名不在 `assetHosts`、绝对地址缺宽高 | 合法形态通过并可区分「未配置」与「不显示」;非法全部被拒 | (a) 包住 `vitest run test/icon.test.ts` |
| TC-07 | A | 同上 | `site.json` 单测:自定义频道名与准入 stage;非法:`defaultLocale` 不在 `locales`、频道为空、`types` 含未注册或 `sync` 类型、`assetHosts` 含非域名、`specs` 的路径为绝对路径;并验证 `createContract(site)`:`by` 不在 `actors` 被拒、语言不在 `locales` 被拒、同一份正文在 `defaultLocale` 下按主稿规则、在其他语言下按译文规则校验 | 合法通过;每个非法样本被拒 | (a) 包住 `vitest run test/site.test.ts` |
| TC-08 | A | 同上 | 仓级输入单测:词表(缺 `defaultLocale` 标签、未知 `vocabulary`)、重定向(非法状态码、`from` 非站内路径)、导航(分组带四种图标形态、`pages` 非全局引用格式) | 合法通过;非法全部被拒 | (a) 包住 `vitest run test/inputs.test.ts` |
| TC-09 | A | 同上 | 生成 Schema 的语义检查:用独立的 JSON Schema 校验器,以 TC-02、TC-03、TC-08 的结构性正反例(含 `blog.post` 缺 `authors` / `seo` / `ogImage`)校验生成的 Schema | 生成 Schema 对这些样本的接受 / 拒绝结果与 Zod 一致 | (a) 包住 `vitest run test/schemas-semantics.test.ts` |
| TC-10 | A | 同上 | Schema 漂移:生成到临时目录,与 `schemas/` 比较**文件集合与内容**;并以三种人为漂移(删一个文件、多一个文件、改一处内容)验证比较脚本能发现 | 当前无差异;三种人为漂移各自被发现 | (b) 断言脚本 `scripts/check-schemas.sh`,exit 0 = 无漂移且自检通过 |
| TC-11 | A | 同上 | 用契约校验 `templates/` 下每个单元;断言每个 `source: git` 的类型都有模板,`generated` 类型的模板只有 `item.json` | 全部通过,无缺失 | (a) 包住 `vitest run test/templates.test.ts` |
| TC-12 | A | 同上 | 存储路径单测:合法入参得到确切路径(含 `ico`);非法:摘要长度或字符不符、文件名含分隔符 / `..` / 绝对路径、`source` 或 `releaseId` 格式不符、MIME 不在白名单。`finalizeAsset`:处理函数改变了字节时,返回的摘要与路径取处理后的字节,且与用该结果构造的 AST 资源引用一致;不传处理函数时取原始字节 | 合法路径逐字相符;非法全部抛错;两种定稿结果符合预期 | (a) 包住 `vitest run test/storage.test.ts` |
| TC-13 | A | 同上 | 体积边界(对 §7 的每个 kind 参数化:`site`、`item`、`frontmatter`、`taxonomy`、`redirects`、`navigation`、`page`):「上限内」「恰等于上限」「超 1 字节」三档;含多字节字符的样本(字符数未超、字节数超);以空白撑大的原始文件 | 每个 kind 前两档通过,第三档被拒;按字节而非字符判定;空白撑大者被拒 | (a) 包住 `vitest run test/limits.test.ts` |
| TC-14 | A | 本地 D1(miniflare) | 应用 `0001_init.sql`;断言表、列、索引与 `contract/release.ts` 常量一致;写入一版含 §1.2 全部字段的数据并读回 | 迁移成功;读回的作者、来源、SEO、图标、`imageAlt`、资源清单、`site` 快照等与输入逐字段相符;按 `(release_id, target_type, target_key)` 的反向查询命中索引(`EXPLAIN QUERY PLAN` 不出现全表扫描) | (a) 包住 `vitest run test/migration.test.ts` |
| TC-15 | A | 同上 | 就绪与激活规则(§4 第 3–7 步的 SQL)。就绪:行数与 `expected` 不符;行数相符但某个 `object_sha256` 在 `objects` 中缺失;`assets_verified = 0`;三项都满足。激活:空库首次激活;目标版本不存在;目标为 `writing`;目标属于别的来源或频道;带错误旧值的切换;正确切换;对当前版本重复激活;回滚到上一版后重复回滚 | 就绪:前三种不得变为 `ready`,第四种变为 `ready`。激活:首次激活插入 1 行且 `previous_release` 为空;目标不存在、`writing`、错误归属、旧值冲突均影响 0 行且指针三列不变;正确切换影响 1 行并正确移动 `previous_release`;重复激活与重复回滚判为幂等成功,`current_release`、`previous_release`、`activated_at` 均不变 | (a) 包住 `vitest run test/activation.test.ts` |
| TC-16 | A | 已执行构建 | 消费侧冒烟:把本仓打成包,装进临时目录里的独立 TypeScript 项目(不联网),该项目导入契约的类型与 schema,执行类型检查并运行一段解析合法 / 非法 `item.json` 的脚本 | 类型检查通过;运行结果为合法通过、非法被拒 | (b) 断言脚本 `scripts/smoke-consumer.sh`,exit 0 = 全部断言成立 |

## 风险与回滚

- **Zod 生成 JSON Schema 的能力**:递归的 AST 与带自定义校验的字段可能无法完整表达。应对:JSON Schema 只覆盖结构,
  不可表达的规则在 `contract.md` 列明;AST 不生成 JSON Schema(只供本仓与读取端以类型使用)。若生成器对信封也不可用,停下报告,不自行换方案。
- **本地 D1 与远端 D1 的差异**:本任务只在 miniflare 上验证迁移与索引。远端验证放到发布任务,并作为其前置用例。
- **契约定得过早**:首批使用方接入前不打 tag,允许无迁移地调整;接入后的破坏性变更升主版本并写迁移说明。
- **既有渲染器的兼容**:AST 只做加法扩展;若实现中发现必须改动既有节点形状,按「偏差需停下问用户」处理。
- 回滚:本任务不触碰任何线上资源,回滚即回退提交。
