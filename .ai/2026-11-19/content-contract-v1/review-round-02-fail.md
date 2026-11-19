# 评审:第 02 轮

## 问题清单
- [major] R-01 上一轮 R-04 仅部分修复，卫生扫描仍漏检方案要求拦截的域名和语言。
  - 详情:scripts/check-hygiene.sh:44、49、100：裸域名仍依赖有限顶级域枚举，字段提取未覆盖 site.specs 的语言键。静态追踪可见，contract/ 中的 const HOST = 'cdn.customer.museum'，以及 test/fixtures/ 中的 specs: {api: {fi: 'specs/api.json'}} 均不会命中，仍违反 plan §8。请补齐域名识别及 specs 语言键检查，并加入这些反例；现有 27 个自检样本通过不能证明该缺陷已消除。实现记录将其列入停车场，并未改变本轮验收要求。
- [major] R-02 图片地址新增长度限制，仍违反 AST 只做加法扩展的兼容要求。
  - 详情:contract/ast.ts:159：ImageSrc 对既有 /assets/<文件名> 形式统一施加 2048 字符上限，而 .ai/2026-11-19/content-contract-v1/assets/ast-baseline/existing-ast-contract.ts:14 的 AssetPath 没有该限制。例如 '/assets/' + 'a'.repeat(2041) 在基线中合法，现在会使正文校验失败。请保留旧形式原有的接受范围，并补充超过 2048 字符的兼容断言；五个基线样本不含 img，TC-05 通过无法覆盖此处回归。

## 范围核对
无

## 总评
上一轮 R-01、R-02、R-03、R-05 已修复，R-04 尚未完整解决，另发现图片地址的兼容性缺陷。已逐项核对 TC-01 至 TC-17 的命令、测试实现和本轮证据，结果与实现记录一致，未发现虚报或未声明的范围外改动。全程只读，未运行测试；因仍有两项 major，判定 fail。

VERDICT: fail
