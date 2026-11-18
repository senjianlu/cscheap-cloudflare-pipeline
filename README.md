# cscheap-cloudflare-pipeline

把 Git 仓库里的结构化内容(MDX 正文 + JSON 元数据)发布到 Cloudflare D1 / R2 的内容管线。

- **内容契约**:公共信封、类型注册表与各类型 schema、正文 AST、D1 表结构、R2 路径
- **命令行**:校验 → MDX 编译为 AST → 按版本写入 D1 / R2 → 原子切换频道指针;支持回滚与清理
- **可复用 GitHub 工作流**:内容仓按 tag 引用即可获得同一套发布流程

内容仓只放内容,渲染端只读 D1 / R2;两边都钉本仓同一个版本。

**状态(2026-11-18)**:只有 AI 工作流与文档骨架,契约与代码尚未实现。

- 项目事实与约束:[AGENTS.md](AGENTS.md)
- 架构:[docs/architecture/](docs/architecture/README.md);决策:[docs/decisions/](docs/decisions/README.md)

## 开发流程

开发走 rawf 工作流(Claude Code 开发、Codex 交叉评审,细则见 [CLAUDE.md](CLAUDE.md)):

/rawf-plan → 【人工确认方案】→ /rawf-implement → /rawf-review → /rawf-report → 【人工确认提交】

克隆后执行一次:

```bash
git config core.hooksPath .githooks
git config commit.template .gitmessage
```

依赖:

- Node 22(见 `.nvmrc`)、pnpm 11
- Claude Code(开发)与 OpenAI Codex CLI(评审;需已 `codex login`,版本须支持
  `codex exec --output-schema` 与 `--json`)
- jq(hooks 与评审结论解析用)
- Linux 另需 util-linux(flock、setsid)与 procps(pgrep):评审脚本的锁与看门狗依赖它们,缺失时报错退出
