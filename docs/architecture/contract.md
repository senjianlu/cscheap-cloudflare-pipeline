# 内容契约 v1

本文是契约的人读全文。机器契约在三处,以代码为准,本文与之不符时是本文的缺陷:

| 载体 | 位置 | 用途 |
|---|---|---|
| Zod 源 | [`contract/`](../../contract/index.ts) | 唯一事实源;命令行与读取端直接引用 |
| JSON Schema | [`schemas/`](../../schemas/) | 由 `scripts/gen-schemas.ts` 生成,供内容仓编辑器与其他语言实现使用 |
| D1 迁移 | [`migrations/0001_init.sql`](../../migrations/0001_init.sql) | 表结构;与 `contract/release.ts` 的常量一致(测试核对) |

每条规则后面标注出处:公共规范给链接,本仓自己定的写「项目约定」。取舍的理由见
[决策 0002](../decisions/0002-envelope-and-type-registry.md) 与 [决策 0003](../decisions/0003-versioned-d1-tables.md)。

`CONTRACT_VERSION = 1`。信封、仓级输入与页对象的 `schemaVersion` 必须等于它(项目约定)。
Git 侧键名用 camelCase,D1 列名用 snake_case(项目约定)。

## 0. 使用方配置 `site.json`

契约里与语言、频道、参与者有关的取值不写死,全部来自这份配置。`createContract(site)` 按它生成带取值上下文的 schema。

| 字段 | 必填 | 规则 | 出处 |
|---|---|---|---|
| `source` | 是 | 小写字母开头的短词(字母、数字、短横线,至多 32 个字符);用于指针行与 R2 清单路径 | 项目约定 |
| `locales[]` | 是 | 至少一项、不重复;每项是规范大小写的语言标签(见 §8) | [BCP 47 / RFC 5646](https://www.rfc-editor.org/rfc/rfc5646);大小写要求为项目约定 |
| `defaultLocale` | 是 | 必须在 `locales` 内。主稿 = 该语言的正文文件,其余为译文 | 项目约定 |
| `channels` | 是 | 频道名 → 准入的 `stage` 列表(非空、不重复);至少一个频道;名称与数量由使用方定 | 项目约定 |
| `actors[]` | 是 | `workflow[].by` 的合法取值;至少一项 | 项目约定 |
| `types` | 是 | 启用的类型键 → `{urlPattern}`;键必须是注册表里来源为 git 的类型;至少一个 | 项目约定 |
| `types.*.urlPattern` | 是 | 以 `/` 开头,每段是小写字面量或占位符 `{locale}`、`{slug}`、`{id}`;必须含 `{slug}` 或 `{id}` | 项目约定 |
| `assetHosts[]` | 否 | 允许被内容以 `https` 绝对地址引用的外部资源域名(小写、至少两段);缺省为空 | 项目约定 |
| `specs` | 否 | 外部描述文件的登记:描述键 → `{<语言>: 仓内相对路径}`;语言必须在 `locales` 内;路径不得为绝对路径、不得含 `.` 或 `..` 段 | 项目约定 |

发布时把 `locales`、`defaultLocale`、`types`、`assetHosts` 作为快照写入 `releases.site`,渲染端从版本读取,不另行维护一份(项目约定)。

## 1. 公共信封 `item.json`

语言无关。未列出的字段一律不合法(严格对象,项目约定)。

| 字段 | 必填 | 规则 | 出处 |
|---|---|---|---|
| `schemaVersion` | 是 | 等于 `CONTRACT_VERSION` | 项目约定 |
| `type` | 是 | 注册表里来源为 git、且在 `site.types` 中启用的类型键 | 项目约定 |
| `id` | 是 | 类型内唯一、永不改;小写字母、数字,以单个 `.` `_` `-` 分隔;全局引用写作 `<type>:<id>` | 项目约定 |
| `slug` | 是 | URL 段,只含小写字母、数字、短横线,各语言相同;可改,改动须登记重定向 | 字符集取自 [RFC 3986 §2.3](https://www.rfc-editor.org/rfc/rfc3986#section-2.3) 的非保留字符子集;其余为项目约定 |
| `stage` | 是 | `draft` / `reviewed` / `published` / `held` / `retired`;哪个 `stage` 进哪个频道由 `site.channels` 决定 | 项目约定(沿用现有文档仓已在用的审核流) |
| `workflow[]` | 是 | 只追加,至少一项:`{stage, by, at, note?}`;`by` 在 `site.actors` 内;时间不减;末项 `stage` 等于顶层 `stage` | 项目约定 |
| `publishedAt`、`updatedAt` | 否 | UTC 时间(§8)。`publishedAt` 缺省时取 `workflow` 中首次进入 `published` 的时间;`updatedAt` 表示实质修订 | 时间格式见 [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339);缺省规则为项目约定 |
| `authors[]` | 否 | 词表 `authors` 的键,非空、不重复 | 项目约定 |
| `sources[]` | 否 | `{kind:"url", url, retrievedAt?}`(`url` 只认 `http` / `https`)或 `{kind:"project", id}` | 项目约定 |
| `category`、`tags[]` | 否 | 词表 `categories` / `tags` 的键;`tags` 不重复 | 项目约定 |
| `refs[]` | 否 | `{rel, target}`;`rel` 取 `about` / `mentions` / `related` / `partOf` / `supersedes`;`target` 为全局引用(§2.2) | 项目约定 |
| `icon` | 否 | 见 §1.1 | 图标库为 [Lucide](https://lucide.dev/icons/);取值形态为项目约定 |
| `seo` | 否 | `{noindex?, canonical?, ogImage?}`;`canonical` 为站内路径或 `https` 地址;`ogImage` 为资源来源(§1.2) | `ogImage` 对应 [Open Graph](https://ogp.me/) 的 `og:image`;其余为项目约定 |
| `data` | 是 | 类型专属,由该类型的 schema 校验(可为空对象),见 §2 | 项目约定 |

原则:能翻译的进 frontmatter,不能翻译的进 `item.json`,能算出来的只进数据库(项目约定)。

### 1.1 图标

| 写法 | 含义 |
|---|---|
| 不写 | 使用类型的默认图标(注册表的 `defaultIcon`) |
| `false` | 不显示图标 |
| 字符串 | Lucide 图标名,短横线写法(小写字母、数字、短横线)。只校验格式,**不设受控清单** |
| `{image, imageDark?, width?, height?}` | 图片图标。`image` / `imageDark` 是资源来源(§1.2);任一为绝对地址时 `width`、`height` 必填 |

`resolveIcon()` 区分「未配置」「不显示」与具体图标。以上均为项目约定。

### 1.2 资源来源

内容里引用资源的字段(`icon.image`、`icon.imageDark`、`seo.ogImage`,以及 `data` 里的 `heroImage`、`logo`)取两种值之一(项目约定):

- **仓内相对路径**:段只含字母、数字、`.`、`_`、`-`;不得以 `/` 开头,不得含 `.` 或 `..` 段。
  契约只校验格式;按单元目录还是仓级目录解析、文件是否存在,由校验与编译任务判定。
- **`https` 绝对地址**:域名必须在 `site.assetHosts` 内;不得带账号口令。

### 1.3 各语言正文文件 `<locale>.mdx` 的 frontmatter

| 字段 | 必填 | 规则 |
|---|---|---|
| `title`、`description` | 是 | 非空文本 |
| `sourceDigest` | 译文必填,主稿不得带 | 主稿全文的 sha256(64 位小写十六进制,[RFC 6234](https://www.rfc-editor.org/rfc/rfc6234)) |
| `seoTitle`、`summary`、`imageAlt` | 否 | 非空文本 |
| `l10n` | 否 | 该类型声明的本地化短文本(§2);未声明的键不合法。首版没有类型声明任何键 |

语言文件与正文的关系(`generated` 类型除外;均为项目约定):

- 一个单元**有哪些语言 = 有哪些 `<locale>.mdx` 文件**。主稿文件必须存在,译文文件可缺(缺则该语言不出页)。
- 正文模式 `optional`:文件仍须存在并带完整 frontmatter,frontmatter 之后可以没有正文。该语言照常产生
  `entry_locales` 行,`object_sha256` 为空,页面照常生成。
- 正文模式 `required`:正文为空(或只有空白)即不合法。
- 正文模式 `generated`:仓里没有正文文件,见 §2.1。

### 1.4 仓级输入

| 文件 | 结构 | 规则 |
|---|---|---|
| `taxonomy/<vocabulary>.json` | `{schemaVersion, vocabulary, terms: {<键>: {labels: {<语言>: 文本}}}}` | `vocabulary` 取 `authors` / `categories` / `tags`;`defaultLocale` 的标签必填,语言须在 `site.locales` 内;只有 `authors` 的项可带 `url` |
| `redirects.json` | `{schemaVersion, redirects: [{from, to, status, locale?}]}` | `from` / `to` 为站内路径(§8),不得相同;`status` 取 301 / 308([RFC 9110 §15.4](https://www.rfc-editor.org/rfc/rfc9110#section-15.4));`locale` 缺省表示对全部语言生效;同一语言下 `from` 不重复 |
| `navigation.json` | `{schemaVersion, groups: [{title: {<语言>: 文本}, icon?, pages: [全局引用…]}]}` | 可选文件;`icon` 取值同 §1.1;`title` 的 `defaultLocale` 文本必填 |

未标出处的均为项目约定。信封里的 `authors` / `category` / `tags` 能否在词表中找到、改 slug 是否登记了重定向,
属于跨文件规则,契约只定义数据形状,执行归「校验」任务(尚未实现)。

### 1.5 输入字段到发布字段的映射

| 输入 | 发布位置(§4) | 映射函数 |
|---|---|---|
| `type`、`id`、`slug`、`category` | `entries` 同名列 | `toEntryRow` |
| `publishedAt`、`updatedAt` | `entries.published_at`、`entries.updated_at`(规范化为小数固定九位的写法,见 §8;`publishedAt` 缺省时取 `workflow` 中首次进入 `published` 的时间,同样规范化) | `toEntryRow` |
| `seo.noindex` | `entries.noindex`(0 / 1,供 sitemap 过滤) | `toEntryRow` |
| `authors`、`sources`、`seo.canonical`、`seo.ogImage`、`icon` | `entries.meta`(JSON;`seo.ogImage` 与图片图标里的仓内资源换成定稿后的引用) | `toEntryRow` |
| `data` | `entries.data`(JSON,原样写入) | `toEntryRow` |
| `tags` | `entry_tags` | `toEntryTagRows` |
| `refs` | `links`(`source_locale` 为空串) | `toRefLinkRows` |
| 正文里的引用 | `links`(`source_locale` 为所在语言,`rel` 记为 `mentions`) | 归编译任务 |
| frontmatter `title`、`description`、`summary`、`l10n` | `entry_locales` 同名列 | `toEntryLocaleRow` |
| frontmatter `seoTitle`、`imageAlt` | `entry_locales.seo_title`、`entry_locales.image_alt` | `toEntryLocaleRow` |
| 正文与图标引用到的仓内资源 | R2 + `release_assets` | `finalizeAsset`、`toReleaseAssetRow` |
| `site.json` 的渲染相关子集 | `releases.site` | `toSiteSnapshot` |
| 正文 | `objects` + `entry_locales.object_sha256` | `encodePageObject` |
| 词表、重定向、导航 | `taxonomy_terms`、`redirects`、`nav` | `toTaxonomyTermRows`、`toRedirectRows`、`toNavRows` |
| `stage`、`workflow`、`schemaVersion`、`sourceDigest` | **不发布**(只用于准入与校验) | — |

映射表为项目约定。

## 2. 类型注册表

每个类型登记:来源(`git` / `sync`)、正文模式(`required` / `optional` / `none` / `generated`)、`data` 的 schema、
`l10n` 的 schema、被提升为必填的信封字段、默认图标。URL 模式与是否启用由
`site.json` 决定,不进注册表。注册表本身为项目约定;个别字段的外部依据单独标注。

| 类型 | 来源 | 正文 | 提升必填 | `data` 必填 | `data` 可选 | 默认图标 |
|---|---|---|---|---|---|---|
| `blog.post` | git | required | `authors`、`seo.ogImage` | — | `series`、`heroImage` | `newspaper` |
| `wiki.site` | git | optional | — | `name`、`url`、`code` | `affUrl`、`featured`、`order`、`risk`、`rating{provider, url, score?, reviews?, ratedAt?}`、`marketCode`、`foundedYear`、`sameAs[]`、`logo` | `globe` |
| `wiki.event` | git | required | — | `eventKind`、`startDate` | `endDate`、`datePrecision`、`officialUrl`、`location{name, address}`、`organizer` | `calendar` |
| `wiki.guide` | git | required | — | `guideKind` | `difficulty`、`term` | `book-open` |
| `docs.page` | git | required | — | `kind` | `deprecated`、`projects[]` | `file-text` |
| `docs.api` | git | generated | — | `spec`、`operationId` | `deprecated` | `braces` |
| `item` | sync | none | —(不经本仓校验) | — | — | `package` |

字段取值(未标出处的为项目约定):

- 首版没有类型声明 `l10n` 的键(各类型的 `l10n` 只接受空对象)。
- `blog.post`:`series` 为 slug 格式的系列键;`heroImage` 为资源来源(§1.2)。
- `wiki.site`:`url`、`affUrl`、`rating.url`、`sameAs[]` 只认 `http` / `https`;`code`、`marketCode` 为 slug 格式;
  `order` 为非负整数;`risk` 取 `low` / `medium` / `high`;`rating` 的 `score` 为非负数、`reviews` 为非负整数;
  `foundedYear` 为 1900–2100 的整数;`logo` 为资源来源(§1.2);`sameAs` 的语义同 [schema.org 的 sameAs](https://schema.org/sameAs)。
- `wiki.event`:`eventKind` 为 slug 格式;`startDate` / `endDate` 为 `YYYY-MM-DD`([RFC 3339 的 full-date](https://www.rfc-editor.org/rfc/rfc3339#section-5.6)),
  `endDate` 不得早于 `startDate`;`datePrecision` 取 `day` / `month` / `year`。
- `wiki.guide`:`guideKind` 为 slug 格式;`difficulty` 取 `beginner` / `intermediate` / `advanced`。
- `docs.page`:`kind` 取 `tutorial` / `how-to` / `reference` / `explanation`(四分法见 [Diátaxis](https://diataxis.fr/));
  `projects[]` 为 id 格式。
- `docs.api`:`spec` 是 `site.specs` 里登记的描述键;`operationId` 只含字母、数字、`_`、`.`、`-`。

**提升必填在类型组合后的结构里表达**(`itemObject(type)`),不是事后的校验函数,所以每类型的 JSON Schema 带同样的
`required`。`blog.post` 把作者与分享图提升为必填,是因为文章页的结构化数据与分享卡片依赖它们。

### 2.1 `generated` 类型

仓里没有正文文件,单元只有 `item.json`。`data.spec` 给出 `site.specs` 里的描述键,连同该类型的定位字段
(对 `docs.api` 是 `operationId`)确定来源。**有哪些语言 = 该描述键登记了哪些语言的文件**;各语言的标题与描述取自
对应语言描述文件中该操作的摘要与说明。生成的执行归编译任务(尚未实现);契约只定义定位字段与 `site.specs` 的结构。

### 2.2 全局引用与同步类型

全局引用写作 `<类型>:<键>`,类型必须已登记(项目约定):

- Git 类型的键是 `id`,例如 `wiki.site:example-market`。
- 同步类型的键按其登记的格式。`item` 的键是 `<命名空间>/<名称>`:命名空间为 slug 格式;名称只含
  [RFC 3986 的非保留字符](https://www.rfc-editor.org/rfc/rfc3986#section-2.3),其余字符按百分号编码(大写十六进制)。

同步类型(`item`)只登记类型键与引用键格式,使内链解析与引用边对两类实体走同一套规则;它没有模板、没有 `stage`,
数据与表结构归同步方。

## 3. 正文 AST

受白名单约束;渲染端不编译、不 `eval`。形状沿用既有文档站已在生产中使用的定义,只做三处加法扩展。
兼容基线是 5 个既有页对象样本(`test/fixtures/ast-baseline/`):它们的 `body`、`toc`、`structuredData`
不经改写即通过本契约(测试核对,样本字节的 sha256 等于文件名)。本节规则未标出处的均为项目约定。

### 3.1 节点

根为 `{type: "root", children}`。节点只有四种,未知的 `type` 不合法——因此没有原始 HTML 节点,也没有表达式节点。
所有节点都是严格对象(不接受未列出的字段)。嵌套深度上限 64(根的子节点深度为 1),在递归校验之前先用迭代方式检查。

| 节点 | 形状 |
|---|---|
| `text` | `{type, value}` |
| `element` | `{type, tagName, properties?, children}`,见 §3.2 |
| `codeBlock` | `{type, lang, title?, colors, lines}`,见 §3.3 |
| `component` | `{type, name, props, children}`,见 §3.4 |

### 3.2 元素白名单

| `tagName` | `properties` |
|---|---|
| `p` `strong` `em` `del` `blockquote` `ul` `li` `hr` `br` `table` `thead` `tbody` `tr` `code` | 无(可省略或为空对象) |
| `ol` | `{start?}`(正整数,与基线一样不限于安全整数范围),可省略 |
| `h2`–`h6` | `{id}` 必填;`id` 非空、至多 200 个字符,不含空白、`#`、`%`、`/`、`?`、`\` 与控制字符 |
| `a` | `{href, title?}`;`href` 见下 |
| `img` | `{src, alt, title?, width?, height?}`;`src` 是已定稿的资源引用 `/assets/<sha256>/<文件名>`(§5),既有形式 `/assets/<文件名>` 仍然接受,且与基线一样不设长度上限(只做加法扩展;本契约的编译产物只产出前一种);`alt` 不得为空白;`width` / `height` 为正整数,用于避免布局抖动 |
| `th` `td` | `{align?}`,取 `left` / `right` / `center`,可省略 |

`img`、`hr`、`br` 不得有子节点。

`a.href` 的合法形式:

- `#<标题 id>` 锚点;
- 外链,只认 `https` / `http` / `mailto`,不得带账号口令;
- **已解析的站内路径**:以单个 `/` 开头,不含 `.` 或 `..` 段(含百分号编码形式)。不写死任何语言或路径前缀,
  前缀是否合法由编译任务按 `site.json` 判定;
- **未解析的实体引用** `ref:<类型>:<键>`:渲染期解析,目标缺失时渲染端降级为纯文本。

任何形式都拒绝控制字符、空白、反斜杠及其百分号编码,拒绝协议相对地址(`//…`)。长度上限 4096 个字符
(沿用既有文档站的取值,不收紧)。

### 3.3 代码块

`{type: "codeBlock", lang, title?, colors: [{light, dark}], lines: [[文本, 调色板下标]…]}`:

- `lang`:1–32 个字符,只含小写字母、数字、`+`、`#`、`-`;
- `colors`:至多 64 项,`light` / `dark` 为 `#RRGGBB` 或 `#RRGGBBAA`;
- 调色板下标为 -1 表示无色,其余必须小于 `colors` 的长度。

### 3.4 组件注册表

未登记的组件一律不合法。

| 组件 | `props` | 子节点 |
|---|---|---|
| `Callout` | `{type, title?}`,`type` 取 `info` / `warning` / `tip` / `danger`(`info`、`warning` 为既有取值) | 可以有 |
| `EntityCard` | `{ref}`,全局引用(§2.2);嵌入一个实体的卡片 | 不得有 |

### 3.5 目录、结构化文本与页对象

- `toc`:`[{title, url, depth}]`,`url` 以 `#` 开头,`depth` 为 2–6。
- `structuredData`:`{headings: [{id, content}], contents: [{heading?, content}]}`,供站内检索使用。
- 页对象:`{schemaVersion, type, id, locale, body, toc, structuredData}`。按**规范序列化**(对象键按码位升序、
  无空白的 JSON,`canonicalJson`)计量体积与计算摘要;上限 256 KiB。

AST 不生成 JSON Schema:它是递归结构并带跨字段规则,只供本仓与读取端以 Zod schema 和 TypeScript 类型使用。

## 4. D1 表

Git 内容用「单表多类型 + JSON 列」,不按类型分表。表与列的常量在 `contract/release.ts`(`TABLES`、`INDEXES`)。
表结构为项目约定;所用的 SQLite 特性见 [STRICT 表](https://www.sqlite.org/stricttables.html)、
[WITHOUT ROWID](https://www.sqlite.org/withoutrowid.html)、[JSON 函数](https://www.sqlite.org/json1.html),
D1 的容量限制见[官方限制页](https://developers.cloudflare.com/d1/platform/limits/)(单行与单个字符串至多 2 MB、
每条语句至多 100 个绑定参数;页对象上限 256 KiB、每表列数不超过 11,都在限制之内)。

| 表 | 主键 | 列 |
|---|---|---|
| `releases` | `release_id` | `source`、`channel`、`commit_sha`、`contract_version`、`status`(`writing` / `ready`)、`expected`(JSON)、`assets_verified`(0 / 1)、`site`(JSON 快照)、`created_at` |
| `channel_pointers` | `(source, channel)` | `current_release`、`previous_release`(可空)、`activated_at`。某来源某频道从未激活时**没有这一行** |
| `objects` | `sha256` | `kind`(目前只有 `page`)、`size`、`body`(页对象的规范 JSON)。内容寻址、不可变、跨版本去重 |
| `entries` | `(release_id, type, id)` | `slug`、`category`、`published_at`、`updated_at`(两列都是规范化的 UTC 时间,见 §8)、`noindex`、`meta`(JSON)、`data`(JSON) |
| `entry_locales` | `(release_id, type, id, locale)` | `title`、`description`、`seo_title`、`summary`、`image_alt`、`l10n`(JSON)、`object_sha256`(空 = 无正文) |
| `entry_tags` | `(release_id, tag, type, id)` | — |
| `links` | `(release_id, source_type, source_id, source_locale, target_type, target_key, rel)` | —。`source_locale` 为空串表示语言无关(信封 `refs`) |
| `redirects` | `(release_id, locale, from_path)` | `to_path`、`status`。`locale` 为 `*` 表示对全部语言生效 |
| `release_assets` | `(release_id, sha256, name)` | `mime`、`size`。该版本引用的 R2 资源清单 |
| `taxonomy_terms` | `(release_id, vocabulary, term)` | `data`(JSON:`{labels, url?}`) |
| `nav` | `(release_id, locale)` | `tree`(JSON:分组数组,标题已按语言取好,缺译文时回退到 `defaultLocale`) |

`releases.expected` 的键是各表的表名(该版本应有的行数)加 `objects`(被 `entry_locales` 引用的不同正文对象数);
资源数即 `release_assets` 的行数。`release_id` 是 64 位小写十六进制摘要。

索引:

| 索引 | 列 | 用途 |
|---|---|---|
| `entries_release_type_slug`(唯一) | `(release_id, type, slug)` | 按 slug 取单页;保证同类型内 slug 唯一 |
| `entries_release_type_published` | `(release_id, type, published_at DESC)` | 按类型的时间倒序列表 |
| `entries_release_type_category_published` | `(release_id, type, category, published_at DESC)` | 按分类的列表 |
| `links_release_target` | `(release_id, target_type, target_key, source_type)` | 反向链接 |
| `entry_locales_release_locale_type` | `(release_id, locale, type)` | 按语言取译文 |

`links` 的全部列都在主键里,建为 `WITHOUT ROWID`:二级索引自带其余主键列,反向查询只读索引、不回表,
查询计划稳定地走 `links_release_target`(测试用 `EXPLAIN QUERY PLAN` 核对)。

带 `release_id` 的各表对 `releases` 有外键;`channel_pointers` 的两个版本列也有外键,因此被指针引用的版本不能被删除。
`entry_locales.object_sha256` **不设外键**:正文对象跨版本共享、单独清理,其存在性由就绪条件核对(见 [publishing.md](publishing.md))。

发布写序、就绪、激活、切换与回滚的规则及对应 SQL 见 [publishing.md](publishing.md)。

## 5. R2 路径

路径一律由 `contract/storage.ts` 的函数生成;函数对非法入参抛 `ContractError`,不拼接未经校验的片段(项目约定)。

| 对象 | 键 | 规则 |
|---|---|---|
| 资源 | `assets/<sha256>/<文件名>` | 内容寻址、不可变。`sha256` 是**实际上传字节**的摘要;文件名只含字母、数字、`.`、`_`、`-`,不得是 `.` 或 `..` |
| 版本清单 | `<source>/releases/<releaseId>/manifest.json` | `source` 须符合 `site.json` 的格式;`releaseId` 为 64 位小写十六进制 |

资源 MIME 白名单(按扩展名;类型名见 [IANA 媒体类型登记表](https://www.iana.org/assignments/media-types/media-types.xhtml)):

| 扩展名 | MIME |
|---|---|
| `png` | `image/png` |
| `jpg`、`jpeg` | `image/jpeg` |
| `webp` | `image/webp` |
| `svg` | `image/svg+xml` |
| `ico` | `image/vnd.microsoft.icon` |
| `json` | `application/json` |

正文 AST 与发布行里对资源的引用是 `/` 加上 R2 键,即 `/assets/<sha256>/<文件名>`(`assetRef`)。

**资源定稿**(`finalizeAsset(资源, 处理函数?)`,唯一入口):先做该类型要求的处理(svg 清洗),再对**处理后的字节**
计算摘要,得到最终路径与引用。此后不得再改动资源字节或 AST 中的资源引用,因此页对象的摘要与体积在这之后是确定的。
清洗器的实现归编译任务(尚未实现);契约只规定顺序与摘要口径。

## 6. 体积上限

`checkSize(kind, 输入)` 在**解析之前**调用;输入文件按原始字节计量(UTF-8 编码后的字节数,含空白,
[RFC 3629](https://www.rfc-editor.org/rfc/rfc3629)),上限为「小于等于」。数值为项目约定。

| kind | 对象 | 上限 |
|---|---|---|
| `site` | `site.json` | 64 KiB |
| `item` | `item.json` | 64 KiB |
| `frontmatter` | 一份正文文件的 frontmatter 段 | 16 KiB |
| `taxonomy` | 单个词表文件 | 1 MiB |
| `redirects` | `redirects.json` | 1 MiB |
| `navigation` | `navigation.json` | 256 KiB |
| `page` | 页对象(规范序列化后) | 256 KiB |

## 7. JSON Schema 与只在 Zod 侧校验的规则

`schemas/` 下共 11 份,由 [Zod 的 JSON Schema 生成](https://zod.dev/json-schema)产出,方言为
[JSON Schema 2020-12](https://json-schema.org/draft/2020-12/schema):`site`、每个 Git 类型一份(信封 + 该类型 `data` 与提升必填)、
`frontmatter`、`taxonomy`、`redirects`、`navigation`。生成物入库;`scripts/check-schemas.sh` 重新生成并比较文件集合与内容。

结构性约束(必填、未知字段、枚举、格式正则、数量上下限、各类型的提升必填)都进 JSON Schema,并由测试用独立校验器
核对它与 Zod 对同一批正反例的结论一致。**下列规则 JSON Schema 表达不了,只在 Zod 侧校验**——只用 JSON Schema 的实现
(编辑器、其他语言)必须另行实现或接受更宽的结论:

| 规则 | 位置 |
|---|---|
| 取值集合来自 `site.json`:`workflow[].by` ∈ `actors`;语言 ∈ `locales`;外部资源域名 ∈ `assetHosts`;`docs.api` 的 `spec` ∈ `specs` 的键;`type` 已在 `site.types` 中启用 | 信封、frontmatter、仓级输入 |
| `workflow` 时间不减(按九位小数的完整精度比较);末项 `stage` 等于顶层 `stage` | 信封 |
| 主稿不得带 `sourceDigest`,译文必须带;一个单元必须有主稿文件;`required` 类型正文不得为空 | frontmatter 与语言文件 |
| `l10n` 的键必须是该类型声明的键(JSON Schema 里只约束为短文本字典) | frontmatter |
| 图片图标任一为绝对地址时 `width`、`height` 必填 | 信封、导航 |
| 日历上不存在的日期(如 2 月 30 日);`wiki.event` 的 `endDate` 不得早于 `startDate` | 信封、`data` |
| URL 的安全判定:控制字符与其百分号编码、账号口令、站内路径里的 `.` / `..` 段 | 所有 URL 与站内路径字段 |
| `defaultLocale` ∈ `locales`;`specs` 的语言 ∈ `locales`;`urlPattern` 必须含 `{slug}` 或 `{id}` | `site.json` |
| 词表与导航标题里 `defaultLocale` 的文本必填;重定向不得指向自身、同一语言下 `from` 不重复 | 仓级输入 |

## 8. 基础类型

| 类型 | 规则 | 出处 |
|---|---|---|
| 语言标签 | `语言[-文字][-地区][-变体…]`;语言 2–3 个小写字母,文字首字母大写的 4 个字母,地区 2 个大写字母或 3 位数字 | [BCP 47 / RFC 5646](https://www.rfc-editor.org/rfc/rfc5646) 的常用子集;要求规范大小写为项目约定(同一语言只有一种写法,可直接用作文件名与主键) |
| UTC 时间 | `YYYY-MM-DDTHH:MM:SS[.小数]Z`;只接受大写 `T` 与 `Z`,不接受数字时区偏移;日期必须存在 | [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339);只收 UTC 为项目约定 |
| 规范化的 UTC 时间 | `YYYY-MM-DDTHH:MM:SS.fffffffffZ`:小数部分固定九位(契约接受的最高精度,不足补零,不丢精度)。定宽,所以**按字典序比较就是按时间先后比较**;同一时刻的不同写法规范化后相同。信封输入仍接受上一行的各种写法;`workflow` 的先后比较(`compareUtc`)与写入 `entries.published_at` / `updated_at`(`normalizeUtc`)都用这个表示 | 项目约定 |
| sha256 摘要 | 64 位小写十六进制 | [RFC 6234](https://www.rfc-editor.org/rfc/rfc6234);小写为项目约定 |
| 站内路径 | 以单个 `/` 开头;不含 `.` / `..` 段;不含控制字符、空白、反斜杠 | 路径语法见 [RFC 3986 §3.3](https://www.rfc-editor.org/rfc/rfc3986#section-3.3);限制为项目约定 |
| 域名 | 小写、至少两段、每段 1–63 个字符、总长至多 253 | [RFC 1035 §2.3.4](https://www.rfc-editor.org/rfc/rfc1035#section-2.3.4);小写与至少两段为项目约定 |

文档与样本里的示例域名一律用保留域名([RFC 2606](https://www.rfc-editor.org/rfc/rfc2606)),示例语言只用 `en`、`fr`。

## 9. 版本演进

- 首批使用方接入前不打 tag,允许无迁移地调整契约。
- 接入后:破坏性变更(删改字段、收紧取值、改表结构或路径)升主版本,`CONTRACT_VERSION` 加一,
  并在 `CHANGELOG.md` 写迁移步骤;新增可选字段、新增类型、新增组件属于兼容变更。
- AST 只做加法扩展;既有节点的形状不改(既有渲染器依赖它们)。
- 新增内容类型不需要迁移:在注册表登记、生成对应的 JSON Schema 与模板即可。
