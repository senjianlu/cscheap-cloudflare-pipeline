---
task: content-contract-v1
date: 2026-11-19
rounds: 4
verdict: pass
---

# 任务小结:内容契约 v1 与工程骨架

## 改动
| 文件 | 摘要 |
|---|---|
| `contract/` | 契约十个模块:基础类型、`site.json` 与 `createContract(site)`、公共信封、仓级输入(词表、重定向、导航)、类型注册表、正文 AST、发布侧形状与就绪 / 激活 SQL、R2 路径与资源定稿、体积上限、统一导出 |
| `migrations/0001_init.sql` | 11 张表与索引 |
| `schemas/` | 由 Zod 生成的 11 份 JSON Schema |
| `templates/` | 六个 Git 类型的脚手架单元 |
| `scripts/` | `gen-schemas.ts`、`check-schemas.sh`、`smoke-consumer.sh` |
| `test/` | 13 个测试文件、634 条;含 5 个既有页面样本的兼容基线与差分测试 |
| 工程骨架与 `.github/workflows/ci.yml` | pnpm、TypeScript、ESLint、Prettier、Vitest;CI 跑 lint、类型检查、测试、Schema 漂移检查 |
| `docs/architecture/`、`docs/decisions/0002`、`0003`、`CHANGELOG.md` | 契约全文、概览、发布契约、接入说明;两条决策 |

## 评审历程
| 轮次 | 结论 | 关键问题 |
|---|---|---|
| plan 01 | fail | 11 major:元数据未落库、`site.json` 不完整、缺仓级输入契约、AST 基线不可核验、激活规则未闭合等 |
| plan 02 | fail | 8 major:基线未固定、无正文条目的本地化规则、生成页的描述定位、重复激活、R2 资源就绪、svg 清洗顺序等 |
| plan 03 | pass | 无 |
| 实现 01 | fail | 5 major:链接长度收紧、发布时间文本排序、workflow 时间精度、卫生扫描漏检、频道准入取到继承属性 |
| 实现 02 | fail | 2 major:卫生扫描仍漏检、图片地址新增长度限制 |
| 实现 03 | fail | 1 major:卫生扫描的文件名豁免过宽 |
| 实现 04 | pass | 无(用户裁决取消卫生扫描后) |

## 范围核对
- **追加类偏差**:D-03(CI 多一步卫生扫描)送审前已删;D-04(新增顶级域列表文件)随卫生扫描取消而删除。终态无追加。
- **用户裁决**(2026-11-19):修复轮上限放宽到 5;取消公开仓卫生的机器扫描(原 plan §8 与 TC-17),靠 AGENTS.md 规则与评审把关。
- **plan 评审「范围核对」条目**(五态审核流、`blog.post` 必填作者与分享图、wiki 字段、`docs.api`、首批两个组件、导航树、
  既有页面样本原样入库、支持 ico):用户在确认方案时一并同意。
- **停车场**(去向待用户裁决,建议全部记入后续任务):
  1. `README.md` 状态句与 `AGENTS.md` 目录约定里的「代码尚未生成」已过时。
  2. `data` 里的资源字段(文章封面、网站 logo)发布时如何换成定稿引用。
  3. 各类型需要哪些本地化短文本(`l10n` 键)。
  4. `templates/blog.post` 引用的占位分享图不存在。
  5. 模板目录缺示例 `site.json`。
  6. 相对资源路径按单元目录还是仓级目录解析。
  7. CI 未跑消费侧冒烟。
  8. `engines` 写 `>=22`,但生成脚本需要 Node 22.18 起的类型擦除。
  9. `eventKind`、`guideKind` 是否收紧为枚举或词表。
  10. `releases.created_at`、`channel_pointers.activated_at` 未要求规范化写法。
  11. Zod 4 的 `int()` 限于安全整数,影响 `order`、`foundedYear`、图片宽高等新字段。
- **实现时补定、方案未写明的取值**(已在 `contract.md` 标为「项目约定」):风险等级、难度、日期精度的取值;同步类型的引用键格式;
  `urlPattern` 语法;发布时间写入数据库时统一为九位小数的定宽写法。
- **图片地址保留既有形式** `/assets/<文件名>`:为兑现「AST 只做加法」而保留,契约因此同时接受一种非内容寻址的路径。

## 遗留 minor 及处置
无(最后一轮评审无 minor)。
