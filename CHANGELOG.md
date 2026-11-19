# Changelog

本文件记录 cscheap-cloudflare-pipeline 的版本历史,体例遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),
版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。使用方按 tag 钉版本:破坏性的契约或写入变更升主版本。

## [Unreleased]

### Added

- 采用 ai-workflow-template 1.4.0,并按「Node 命令行 + 契约库」栈定制:AGENTS.md 技术栈与目录约定、
  评审关注点、架构总览与项目决策 0001。
- 内容契约 v1(`contract/`,`CONTRACT_VERSION = 1`):使用方配置 `site.json` 与 `createContract(site)`、公共信封
  `item.json`、frontmatter 与语言文件规则、类型注册表(`blog.post`、`wiki.site`、`wiki.event`、`wiki.guide`、
  `docs.page`、`docs.api`,同步类型 `item`)、仓级输入(词表、重定向、导航)、正文 AST 与组件注册表
  (`Callout`、`EntityCard`)、R2 路径与资源定稿、体积上限。
- D1 迁移 `migrations/0001_init.sql`(版本、频道指针、内容寻址正文、条目、译文、标签、引用边、重定向、资源清单、
  词表、导航),以及就绪、首次激活、切换、回滚的 SQL(`contract/release.ts`,已在本地 D1 上验证)。
- 由 Zod 生成的 JSON Schema(`schemas/`,11 份)与各 Git 类型的脚手架模板(`templates/`)。
- 工程骨架与本仓 CI:lint、类型检查、测试、JSON Schema 漂移检查;消费侧冒烟脚本。
- 文档:`docs/architecture/` 的 overview、contract、publishing、usage;项目决策 0002、0003。

尚未实现:校验命令行、MDX 编译、发布 / 回滚 / 清理、可复用工作流。首批使用方接入前不打 tag。
