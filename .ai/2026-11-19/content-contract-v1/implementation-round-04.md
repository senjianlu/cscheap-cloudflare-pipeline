---
task: content-contract-v1
round: 04
date: 2026-11-19
---

# 实现记录:第 04 轮

## 本轮改动

第 3 轮评审 fail(剩 1 项 major:卫生扫描的文件名豁免过宽)。用户 2026-11-19 做了三项裁决,本轮据此执行:

1. 修复轮上限放宽到 5 轮(plan.md frontmatter 已写 `impl_fix_max_rounds: 5`)。
2. **取消公开仓卫生的机器扫描**:该项不是重要交付,不值得继续投入;公开仓卫生由 AGENTS.md 的「使用方无关」「公开仓卫生」
   规则与评审把关。此裁决取代同日稍早「保留 `scripts/iana-tlds.txt`」的裁决(该文件只为扫描服务)。
3. plan.md 相应收窄:删除改动范围表中的 `scripts/check-hygiene.sh` 一行、实现方案 §8、测试用例 TC-17,并在「非目标」写明取消及依据。

| 文件 | 改动摘要 |
|---|---|
| `scripts/check-hygiene.sh`、`scripts/iana-tlds.txt` | 删除 |
| `package.json` | 删除 `check:hygiene` 脚本 |
| `docs/architecture/usage.md` | 命令表删除卫生扫描一行 |
| `docs/decisions/0002-envelope-and-type-registry.md` | 「由卫生扫描拦截」改为由 AGENTS.md 规则与评审约束、不设机器扫描 |
| `CHANGELOG.md` | Unreleased 条目去掉卫生扫描 |
| `.ai/2026-11-19/content-contract-v1/plan.md` | 按用户裁决收窄(见上第 3 点)与写入轮次上限;其余未动 |

契约代码、迁移、`schemas/`、模板与其余测试未改。第 2、3 轮为配合扫描而改的两处内容(`test/fixtures/cases.ts` 的未登记类型反例名、
`contract.md` 一处写法)保留现状:含义不变,改回没有收益。

## plan 评审 minor 交接

不适用(仅第 1 轮填写)。

## 修复对照

| 评审问题 | 处置 |
|---|---|
| `review-round-03-fail.md` R-01(卫生扫描的文件名豁免过宽,协议相对地址与邮箱域名被跳过) | 用户裁决取消卫生扫描,被评审的脚本及其验收项(原 §8、TC-17)一并移出本任务,问题随之不再适用 |

## 测试结果

删除脚本后,其余 16 条用例按原命令全部重跑,证据标签 `r4`。另跑过 `pnpm test` 全量与 `evidence-check.sh`,均通过。

| 编号 | 档位 | 结果 | 证据 |
|---|---|---|---|
| TC-01 | A | pass | TC-01-r4.log |
| TC-02 | A | pass | TC-02-r4.log |
| TC-03 | A | pass | TC-03-r4.log |
| TC-04 | A | pass | TC-04-r4.log |
| TC-05 | A | pass | TC-05-r4.log |
| TC-06 | A | pass | TC-06-r4.log |
| TC-07 | A | pass | TC-07-r4.log |
| TC-08 | A | pass | TC-08-r4.log |
| TC-09 | A | pass | TC-09-r4.log |
| TC-10 | A | pass | TC-10-r4.log |
| TC-11 | A | pass | TC-11-r4.log |
| TC-12 | A | pass | TC-12-r4.log |
| TC-13 | A | pass | TC-13-r4.log |
| TC-14 | A | pass | TC-14-r4.log |
| TC-15 | A | pass | TC-15-r4.log |
| TC-16 | A | pass | TC-16-r4.log |

TC-17 已随 plan 收窄删除;历史证据 `TC-17*.log` 保留在 `evidence/`,不再对应任何用例。

## 与方案的偏差

| 编号 | 类型 | 内容 | 原因 | 处置 |
|---|---|---|---|---|
| D-04 | 收窄 | 第 3 轮新增的 `scripts/iana-tlds.txt` 已删除 | 只为卫生扫描服务 | 用户 2026-11-19 裁决取消扫描,文件随之删除;原「追加」不再存在 |
| D-05 | 收窄 | 原 plan §8 与 TC-17(公开仓卫生扫描)整体取消,脚本删除 | 用户 2026-11-19 裁决:不是重要交付,靠 AGENTS.md 规则与评审把关 | plan.md 已同步收窄并在「非目标」写明 |

D-01、D-02、D-03 见第 01 轮记录,状态不变。没有机械性更正。

## 停车场

沿用前三轮的条目,其中与卫生扫描有关的条目(第 01 轮第 9、11 条,第 02 轮第 3、4 条,第 03 轮第 1–4 条)随扫描取消而作废。本轮无新增。
