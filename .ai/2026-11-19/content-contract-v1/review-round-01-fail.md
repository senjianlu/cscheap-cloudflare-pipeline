# 评审:第 01 轮

## 问题清单
- [major] R-01 AST 链接长度限制收紧，破坏了方案要求的兼容性。
  - 详情:contract/ast.ts:43：MAX_URL_LENGTH 为 2048，而兼容基线 assets/ast-baseline/existing-ast-contract.ts:13 允许 4096 字符。长度为 3000 的合法 HTTPS 链接原先通过，现在会导致整个正文校验失败，违反 AST 只做加法扩展的要求。请保留基线的链接长度范围，并补充长度边界兼容用例。
- [major] R-02 发布时间未规范化，文本索引不能保证按实际时间排序。
  - 详情:contract/release.ts:379：published_at 原样保存允许不同小数精度的时间，而 migrations/0001_init.sql:52 按 TEXT 倒序建立索引。例如 2026-01-01T00:00:00Z 会排在更晚的 2026-01-01T00:00:00.5Z 前面，导致文章列表顺序错误。请在发布映射中统一为保持精度且可按字典序排序的时间表示，并验证无小数及不同小数位数混合时的查询顺序。
- [major] R-03 workflow 时间比较丢失毫秒以下精度，会放过时间倒退。
  - 详情:contract/primitives.ts:48、contract/envelope.ts:194：时间 schema 接受最多九位小数，但 utcMillis 使用 Date.parse，只保留毫秒。例如相邻记录从 2026-01-01T00:00:00.0009Z 倒退到 2026-01-01T00:00:00.0001Z，会被当成相等而通过。请按接受的完整精度比较时间，并补充同一毫秒内倒退及不同写法表示同一时刻的用例。
- [major] R-04 卫生扫描依赖有限枚举，漏检方案明确要求拦截的域名和语言。
  - 详情:scripts/check-hygiene.sh:40：裸域名只检测列出的顶级域，语言也只检测 LANG_CODES 中的少量代码。因此 contract/ 中的 assetHosts: ['cdn.customer.cloud']、locales: ['fi']，以及模板 JSON 中的 labels: {fi: '…'} 均不会命中，未满足 plan §8。请识别相关配置字段及完整语言标签范围，对 AST 标签等歧义位置精确豁免，并加入上述漏检样本。
- [major] R-05 频道准入查询会把继承属性当作频道配置并抛出异常。
  - 详情:contract/site.ts:188：site.channels 是普通对象，未配置 constructor 频道时，admits('constructor', 'published') 会取到继承的 Object 构造函数，调用不存在的 includes 后抛出 TypeError，而不是返回 false。constructor 本身符合频道名格式。请先用 Object.hasOwn 判断频道是否存在，并覆盖未配置和显式配置该名称的情况。

## 范围核对
无

## 总评
已逐项核对 TC-01 至 TC-17 的命令、测试实现及终态证据，现有结果与实现记录一致，未发现虚报。静态审阅发现五项正确性或健壮性缺陷，因此判定 fail；未发现未声明的范围外改动。全程只读，未运行测试。

VERDICT: fail
