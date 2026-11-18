# 0001:定位为「契约库 + Node 命令行 + 可复用工作流」,裁剪模板的 Next / 后端 / Scrapy / Worker 栈

- 日期:2026-11-18
- 背景:多个内容仓要走同一套「校验 → 编译 → 写入 Cloudflare」的流程,渲染端要读同一份数据契约。契约与
  发布代码若各仓各抄一份,必然漂移。本仓由 ai-workflow-template 1.4.0 创建,技术栈节仍是模板占位。
- 决定:
  - 本仓是公开仓,只放与具体使用方无关的东西:契约(Zod 为源,生成 JSON Schema)、命令行、D1 迁移、
    可复用 GitHub 工作流。使用方的仓库名、域名、资源名、语言、频道全部来自配置。
  - 技术栈:Node 22 + TypeScript(ESM、strict)+ Zod + @mdx-js/mdx(unified)+ Shiki;经 Cloudflare
    REST API 用原生 fetch 写 D1 / R2;Vitest;ESLint flat + Prettier;pnpm 11。
  - 分发用 git tag(SemVer),不发 npm:内容仓按 tag 调用可复用工作流,读取端以 git 依赖钉同一 tag。
    否掉「发布 npm 包」(多一套发布凭据与流程,现阶段没有外部使用方);否掉「各仓拷贝 + 摘要锁定」
    (每次契约变更要人工同步多处)。
  - 正文产物是受白名单约束的 AST,不是 HTML,也不在读取端编译:Workers 运行时禁止 `eval`,而渲染端要用
    自己的组件渲染同一份内容。
  - 模板裁剪:AGENTS.md 技术栈与目录约定改写为本仓实际形态;`.ai-workflow/review-standards.md` 技术栈
    关注点改为契约、发布正确性、D1 / R2、内容安全、公开仓卫生;删除 `.claude/skills/rawf-stack-scrapy`;
    模板决策 t 系列作为模板历史保留,本仓不采用 t0007(Scrapy 栈)与 t0013(Worker 标准栈)。
  - 工作流定制本身不走 rawf(骨架性质);首个实现任务起走 rawf。
- 影响:升级模板时 AGENTS.md / README.md 属「需人工合并」类,按本决策保留裁剪结果;任何写死使用方取值的
  改动视为缺陷。
