# 项目说明

cscheap-cloudflare-pipeline:把 Git 仓库里的结构化内容(MDX 正文 + JSON 元数据)发布到 Cloudflare D1 / R2 的
内容管线。它提供三样东西:**内容契约**(公共信封、类型注册表与各类型 schema、正文 AST、D1 表结构、R2 路径)、
**命令行**(校验 → 把 MDX 编译为 AST → 按版本写入 D1 / R2 → 切换频道指针 → 回滚 / 清理)、以及供内容仓直接调用的
**可复用 GitHub 工作流**。内容仓钉版本使用本仓;渲染端(读取 D1 的站点)钉同一版本的契约类型。
本仓是公开仓:不得出现任何账号 ID、资源 ID、令牌、内部地址或使用方的私有内容。
现状与契约见 docs/architecture/,取舍见 docs/decisions/。

本文件面向进入本仓库的任何 AI 编码工具(AGENTS.md 开放标准),只描述
项目事实与通用约束,不为任何工具指派角色。

## 技术栈

版本号以 pnpm-lock.yaml 实际解析结果为准;表格只在大版本升级时更新,括号内的注记是选型决策
(取舍见 docs/decisions/0001)。

### Node 命令行与契约库

| 类别 | 技术 | 版本 |
|---|---|---|
| 运行时 | Node.js(只在 CI 与本地运行,不部署为 Worker;`.nvmrc` 钉版本) | 22.x |
| 语言 | TypeScript(strict + noUncheckedIndexedAccess;ESM) | 5.x |
| 契约 | Zod 为唯一事实源,由它生成 JSON Schema 文件供内容仓编辑器与校验使用 | 4.x |
| MDX 编译 | @mdx-js/mdx + unified / remark / rehype(只在构建期编译,产出受白名单约束的 AST);代码高亮 Shiki(编译期双主题) | 3.x |
| 存储写入 | Cloudflare REST API(D1 查询接口、R2 的 S3 兼容接口),原生 fetch,不引 SDK(按需引入记 decisions) | — |
| D1 表结构 | SQL 迁移放 `migrations/`,由本仓拥有;读取端不建表 | — |
| 本地与测试用存储 | wrangler / miniflare 的本地 D1 与 R2 | 4.x |
| 测试 | Vitest;写入路径对本地 D1 做集成测试,出站 fetch 与时钟经依赖注入 | 5.x |
| Lint / 格式化 | ESLint flat + typescript-eslint(类型感知的 Promise 规则)/ Prettier | 9.x / 3.x |
| 包管理 | pnpm | 11.x |
| 分发 | git tag(SemVer);内容仓经可复用工作流按 tag 引用,读取端以 git 依赖钉同一 tag 取契约类型 | — |

工程约定:

- **契约只有一份**:信封、类型 schema、AST 节点、表结构、R2 路径都从 `contract/` 导出;命令行、迁移、
  生成的 JSON Schema 与文档不得各写一套
- **发布是整版原子的**:先幂等写入内容寻址的正文与带新版本号的各表行,回读核对,最后用一条带条件的语句切换
  频道指针;任一步失败都不得留下「指针指向不完整版本」的状态。回滚只改指针
- **写入幂等、可重入**:同一提交重复发布结果相同;中断后重跑不产生重复行或孤儿指针
- **AST 是白名单**:编译产物只含契约登记的节点与组件;遇到未登记的语法或组件,构建失败而不是放行
- **不信任内容**:正文、frontmatter、文件名都按不可信输入处理(路径穿越、超大文件、非法 URL 协议)
- **使用方无关**:仓库名、域名、资源名、语言列表、频道一律来自使用方配置(`site.json` 与工作流输入),
  本仓代码与文档里不写死任何使用方的值
- **密钥**:只从环境变量读取,不落日志;日志只含原因码、计数与耗时
- 出站 fetch 与时钟经依赖注入,单元测试不访问真网

对外契约文档:

1. `docs/architecture/` 至少四篇:overview(定位与数据流)、contract(信封、类型注册表、AST、D1 表、R2 路径、
   版本演进)、publishing(写序、原子切换、回滚、清理、失败语义)、usage(内容仓与读取端如何接入、
   工作流输入与所需密钥的**名称**)
2. 生成的 JSON Schema 随 tag 发布,是内容仓编辑器与其他语言实现的机器契约
3. 破坏性变更必须升主版本,并在 CHANGELOG 写迁移步骤

### 部署

- 本仓不部署任何服务。GitHub Actions(.github/workflows/):本仓 CI(lint、类型检查、测试)与
  供使用方 `workflow_call` 的可复用发布 / 回滚工作流

## 目录约定

单一可分发单元,取扁平根布局。下表是规划中的承重目录(代码尚未生成);系统形态见 docs/architecture/README.md。

仓库根:

| 目录 | 放什么 |
|---|---|
| `contract/` | 契约的唯一事实源:信封、类型注册表与各类型 schema、AST 节点、表与路径常量 |
| `validate/` | 内容单元校验:结构、跨字段规则、引用可解析、资源白名单 |
| `compile/` | MDX → AST、目录、搜索用文本、引用边 |
| `publish/` | 版本写入、指针切换、回滚、清理;D1 与 R2 的 REST 客户端 |
| `cli.ts`、`config.ts` | 命令行入口与使用方配置的读取 |
| `migrations/` | D1 表结构迁移(SQL) |
| `schemas/` | 由 `contract/` 生成的 JSON Schema(生成物入库,CI 校验未漂移) |
| `templates/` | 各内容类型的脚手架单元 |
| `test/` | vitest;内容样本放 `test/fixtures/` |
| `docs/`、`.ai/` | 持久真相 / 过程痕迹(分工见 docs/README.md;`.ai/` 每个任务目录含 `evidence/` 证据与 `assets/` 资源子目录) |
| `scripts/` | 仓库级辅助脚本(如生成 JSON Schema) |
| `.github/workflows/`、`.agents/skills/` | 本仓 CI 与可复用工作流 / 项目内建 skill |

原则:

- 平铺,不建 `src/`;一个职责一个目录,横切单文件模块放根上
- 新顶级目录先记 docs/decisions/ 再开

## 通用硬规则(对任何 AI 工具生效)

- 永不主动 git commit / git push,必须用户明确确认
- `.ai/` 下是开发过程产物(方案/实现记录/评审记录),历史轮次文件只增不改
- `docs/` 下是持久设计真相(架构/决策),任务改变二者时须在收尾前回写,
  与代码同一提交(分工详见 docs/README.md)
- 开发必须走 rawf 工作流(由 Claude Code 驱动,细则见 CLAUDE.md),
  不得绕过其闸门与产物约定;预计触及文件 > 10 的改动,须在方案确认闸之前
  先经 plan 阶段 Codex 评审(plan-review,默认最多 5 轮,用户明确指定
  轮数时以其为准);≤ 10 不强制。
  细则见 CLAUDE.md
- 代码评审的角色约束、标准与严重度定义见 .ai-workflow/review-standards.md

## Git 提交规范

遵循 Conventional Commits,由 `.githooks/commit-msg` 钩子本地强制。
启用(克隆后执行一次):

```bash
git config core.hooksPath .githooks
git config commit.template .gitmessage
```

- header:`<type>(<scope>): <subject>`;scope 可选(小写短词,按项目
  约定);subject 祈使句、≤72 字符、不以句号结尾
- type 取 feat | fix | docs | refactor | perf | test | build | ci |
  chore | style | revert
- 正文(如有)说明动机与影响;不兼容变更用 `BREAKING CHANGE:` footer
  或 type 后加 `!`
- footer 约定:rawf 任务附 `Rawf: <yyyy-mm-dd>/<task-slug>`;引用权威
  文档用 `Refs:`;结对代理保留 `Co-Authored-By:`
- 一次提交一个主题;代码与其决策痕迹(.ai/ 任务目录)同一提交

## Skill 基线

Agent skills 分两类管理:

- **项目内建**:随仓库提交在 `.agents/skills/`,由 `skills-lock.json`
  按内容哈希锁定(skills.sh CLI 安装/更新),对进入本仓库的任何 AI
  工具生效。当前:(无)
- **每机自装**:装在本机全局(如 `~/.claude/skills/`),不入库;新
  机器先按清单安装再开工。当前:(无)
