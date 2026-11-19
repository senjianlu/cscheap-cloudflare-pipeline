# 定位与数据流

## 定位

本仓把 Git 仓库里的结构化内容(MDX 正文 + JSON 元数据)发布到 Cloudflare D1 / R2,提供三样东西:

| 部分 | 状态 | 说明 |
|---|---|---|
| 内容契约 | **已实现(v1)** | 公共信封、类型注册表、正文 AST、D1 表结构、R2 路径、体积上限;见 [contract.md](contract.md) |
| 命令行(校验、编译、发布、回滚、清理) | 尚未实现 | 后续任务;以本契约为准 |
| 可复用 GitHub 工作流 | 尚未实现 | 后续任务 |

本仓不部署任何服务,也不持有任何使用方的取值:仓库名、域名、资源名、语言、频道一律来自使用方的 `site.json`
与工作流输入。

## 角色

```
内容仓(Git)                    本仓                               Cloudflare             渲染端
item.json + <locale>.mdx  ─┐   契约(contract/)                    D1:版本化的各表   ◄──  只读;先取频道指针,
taxonomy / redirects /     ├─► 校验 → 编译为 AST → 写入 → 切指针 ─► R2:内容寻址的资源      其后查询都带 release_id
navigation / site.json    ─┘   (命令行,尚未实现)                    与版本清单
        ▲                           ▲                                                          ▲
        └── JSON Schema(编辑器) ───┴────────── 同一 tag 的契约类型与 Zod schema ───────────────┘
```

- **内容仓**只放内容,按契约组织文件;编辑器用 `schemas/` 下的 JSON Schema 做即时校验。
- **本仓**拥有契约与表结构:D1 迁移在 `migrations/`,读取端不建表。
- **渲染端**以 git 依赖钉同一版本的契约,用其中的类型与 Zod schema 读取 D1;正文是受白名单约束的 AST,
  渲染端不编译、不 `eval`。
- **同步类实体**(如由其他系统同步进来的条目)不在 Git、不经本仓发布,只在类型注册表里登记类型键与引用键格式,
  使内链与引用边对两类实体走同一套规则。

## 契约的组成

| 模块 | 内容 |
|---|---|
| `contract/primitives.ts` | 语言标签、UTC 时间、摘要、slug、id、安全 URL、相对路径、规范序列化、体积上限常量 |
| `contract/site.ts` | `site.json` 的 schema、`createContract(site)`、版本里的配置快照 |
| `contract/types.ts` | 类型注册表、各类型的 `data`、全局引用 |
| `contract/envelope.ts` | 信封 `item.json`、frontmatter、语言文件规则、图标 |
| `contract/inputs.ts` | 词表、重定向、导航 |
| `contract/ast.ts` | 正文 AST、组件注册表、目录、搜索用结构化文本、页对象 |
| `contract/storage.ts` | R2 路径、MIME 白名单、资源定稿 |
| `contract/release.ts` | 表名 / 列名常量、行 schema、输入到行的映射、就绪 / 激活 / 切换的 SQL |
| `contract/limits.ts` | 体积检查入口 |
| `contract/index.ts` | 统一导出与 `CONTRACT_VERSION`;包的唯一对外入口 |

契约只有一份:JSON Schema 由 Zod 生成并由 CI 校验未漂移;迁移里的表、列、索引由测试与契约常量逐项核对;
模板由测试用契约校验;本目录的文档以代码为准。

`contract/` 不依赖 Node 专有模块(摘要用 Web Crypto),可以在渲染端的运行时里直接使用。

## 一次发布的数据流(契约层面)

1. 读 `site.json`,生成带上下文的契约;对每个输入文件先查体积,再解析、校验。
2. 资源定稿:处理(如 svg 清洗)→ 对处理后的字节取摘要 → 得到 R2 键与引用。
3. 把 MDX 编译成 AST(只含登记过的节点与组件),连同目录与结构化文本组成页对象,按规范序列化取摘要。
4. 按 [publishing.md](publishing.md) 的写序写入 R2 与 D1,核对后置为就绪,再用一条带条件的语句切换频道指针。
5. 渲染端每个请求先取指针,其后所有查询显式带 `release_id`。

第 1–3 步的执行(校验、编译)与第 4 步的执行(发布)都是后续任务;本任务交付的是它们共同依据的形状与规则。
