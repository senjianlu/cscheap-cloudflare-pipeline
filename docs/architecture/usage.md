# 接入方式

> **状态**:本文只写**引用方式**与 `site.json`。校验、编译、发布的命令行与可复用 GitHub 工作流尚未实现,
> 工作流输入与所需密钥的名称待发布任务确定后补入本文。首批使用方接入前不打 tag。

## 引用契约

契约以 git 依赖的方式引用,钉到某个 tag 或提交;内容仓与渲染端钉**同一个**版本。包只有一个对外入口(包根),
导出 Zod schema、TypeScript 类型、表与路径常量。安装时由 `prepare` 脚本完成构建(ESM + 类型声明),不发布 npm 包。

```jsonc
// package.json(片段)。<仓库地址> 与 <tag> 由使用方填写。
{
  "dependencies": {
    "<本仓的包名>": "git+<仓库地址>#<tag>"
  }
}
```

```ts
import { createContract, type Item, type PageObject } from '<本仓的包名>';

const contract = createContract(siteJson); // siteJson 是解析后的 site.json
const item: Item = contract.item.parse(itemJson);
```

要求:Node 22 及以上;ESM。`contract/` 不依赖 Node 专有模块,可在渲染端的运行时里直接使用。

## 内容仓的文件

| 文件 | 说明 | JSON Schema |
|---|---|---|
| `site.json` | 使用方配置,见下 | `schemas/site.schema.json` |
| `<单元目录>/item.json` | 信封 + 类型专属数据 | `schemas/<类型>.schema.json` |
| `<单元目录>/<locale>.mdx` | 各语言正文;frontmatter 见契约 §1.3 | `schemas/frontmatter.schema.json` |
| `taxonomy/<vocabulary>.json` | 受控词表(`authors` / `categories` / `tags`) | `schemas/taxonomy.schema.json` |
| `redirects.json` | 重定向 | `schemas/redirects.schema.json` |
| `navigation.json` | 导航(可选) | `schemas/navigation.schema.json` |

单元目录在仓内的摆放方式(路径与 slug 的对应关系)由「校验」任务定义,尚未确定。

每个 Git 类型在 [`templates/`](../../templates/) 下有一个脚手架单元,占位值可直接通过契约校验;
正文由描述文件生成的类型(`docs.api`)的模板只有 `item.json`。

JSON Schema 只覆盖结构;取值集合来自 `site.json` 的规则与跨字段规则只在 Zod 侧校验,清单见
[contract.md §7](contract.md)。

## `site.json`

字段与规则见 [contract.md §0](contract.md)。示例(域名与语言均为示例值):

```json
{
  "source": "example",
  "locales": ["en", "fr"],
  "defaultLocale": "en",
  "channels": {
    "preview": ["reviewed", "published"],
    "production": ["published"]
  },
  "actors": ["author", "editor"],
  "types": {
    "blog.post": { "urlPattern": "/{locale}/blog/{slug}" },
    "docs.api": { "urlPattern": "/{locale}/docs/api/{id}" }
  },
  "assetHosts": ["cdn.example.com"],
  "specs": {
    "public-api": { "en": "specs/public-api.en.json", "fr": "specs/public-api.fr.json" }
  }
}
```

- 频道的名称与数量由使用方定;某个 `stage` 是否进某个频道只看这里。
- `defaultLocale` 的正文文件是主稿;其余语言是译文,缺译文的语言不出页。
- 只有列在 `types` 里的类型可以出现在 `item.json` 的 `type` 中。

## 读取端

- 表结构由本仓的 `migrations/` 拥有,读取端不建表。
- 每个请求先按 `(source, channel)` 取频道指针,其后所有查询显式带 `release_id`。
- 渲染所需的配置(语言、`urlPattern`、外部资源域名)从该版本的 `releases.site` 读取。
- 正文在 `objects.body`,是页对象的规范 JSON;用 `PageObject` 解析后按 AST 渲染。遇到 `ref:<类型>:<键>` 链接
  与 `EntityCard` 时在渲染期解析实体,目标缺失则降级为纯文本。

## 本仓的检查命令

| 命令 | 作用 |
|---|---|
| `pnpm run check:static` | lint 与类型检查 |
| `pnpm test` | 单元测试与本地 D1 上的集成测试 |
| `pnpm run gen:schemas` | 从 `contract/` 重新生成 `schemas/` |
| `pnpm run check:schemas` | 核对 `schemas/` 与重新生成的结果无差异 |
| `pnpm run smoke:consumer` | 把本仓打包装进独立项目,离线完成类型检查与运行 |
