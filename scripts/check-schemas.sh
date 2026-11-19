#!/usr/bin/env bash
# JSON Schema 漂移检查(TC-10 的断言脚本)。exit 0 = schemas/ 与重新生成的结果无差异,且比较逻辑自检通过。
#
# 做法:从 contract/ 重新生成到临时目录,与 schemas/ 比较「文件集合与内容」。不依赖 git 状态,
# 所以未跟踪或漏交的文件也能发现。自检用三种人为漂移(删一个文件、多一个文件、改一处内容)
# 验证比较逻辑确实能发现差异。
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root" || exit 2

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# compare <入库目录> <重新生成的目录>:无差异返回 0;有差异打印差异并返回 1。
compare() {
  diff -r -- "$1" "$2"
}

generated="$tmp/generated"
if ! node scripts/gen-schemas.ts "$generated" > "$tmp/gen.log" 2>&1; then
  cat "$tmp/gen.log"
  echo "生成 JSON Schema 失败"
  exit 2
fi
count="$(find "$generated" -type f | wc -l)"
if [ "$count" -eq 0 ]; then
  echo "生成结果为空"
  exit 2
fi

status=0

echo "== 漂移检查:schemas/ 对比重新生成的 $count 个文件 =="
if compare "$root/schemas" "$generated"; then
  echo "无漂移"
else
  echo "发现漂移:请运行 pnpm run gen:schemas 并提交 schemas/"
  status=1
fi

echo "== 自检:三种人为漂移必须被发现 =="
# 自检以重新生成的结果为基准,与仓库当前状态无关。
victim="$(find "$generated" -type f | sort | head -n 1)"
victim_name="$(basename "$victim")"

self_case() {
  local name="$1" dir="$tmp/case-$1"
  cp -r "$generated" "$dir"
  case "$name" in
    identical) ;;
    missing) rm "$dir/$victim_name" ;;
    extra) echo '{}' > "$dir/unexpected.schema.json" ;;
    changed) sed -i '0,/"type": "object"/s//"type": "array"/' "$dir/$victim_name" ;;
  esac
  if compare "$dir" "$generated" > "$tmp/case-$name.log" 2>&1; then
    return 0
  fi
  return 1
}

if self_case identical; then
  echo "自检:完全相同 → 无差异"
else
  echo "自检失败:完全相同的目录被判为有差异"
  status=1
fi
for name in missing extra changed; do
  if self_case "$name"; then
    echo "自检失败:人为漂移 $name 未被发现"
    status=1
  else
    echo "自检:人为漂移 $name($(head -n 1 "$tmp/case-$name.log" | sed "s#$tmp/##g"))→ 已发现"
  fi
done

if [ "$status" -eq 0 ]; then
  echo "通过:无漂移且自检通过"
else
  echo "未通过"
fi
exit "$status"
