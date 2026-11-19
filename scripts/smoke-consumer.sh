#!/usr/bin/env bash
# 消费侧冒烟(TC-16 的断言脚本)。exit 0 = 全部断言成立。
#
# 把本仓打成包,装进临时目录里的独立 TypeScript 项目(离线,只用本机 pnpm 仓库里已有的依赖),
# 该项目经包根导入契约的类型与 schema,执行类型检查,并运行一段解析合法 / 非法 item.json 的脚本。
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "== 1. 构建 =="
pnpm run build
test -f dist/index.js
test -f dist/index.d.ts

echo "== 2. 打包 =="
mkdir -p "$tmp/pack"
pnpm pack --pack-destination "$tmp/pack" > "$tmp/pack.log" 2>&1 || { cat "$tmp/pack.log"; exit 1; }
tarball="$(find "$tmp/pack" -name '*.tgz' | head -n 1)"
test -n "$tarball"
echo "包:$(basename "$tarball")"
echo "包内文件(不含测试与脚本):"
tar -tzf "$tarball" | sort | sed 's/^/  /'
if tar -tzf "$tarball" | grep -Eq '^package/(test|scripts|\.ai|node_modules)/'; then
  echo "包里混入了不该分发的目录"
  exit 1
fi

name="$(node -p "require('./package.json').name")"
typescript="$(node -p "require('./package.json').devDependencies.typescript")"

echo "== 3. 独立项目:离线安装 =="
consumer="$tmp/consumer"
mkdir -p "$consumer"
cat > "$consumer/package.json" <<JSON
{
  "name": "contract-consumer-smoke",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": { "$name": "file:$tarball" },
  "devDependencies": { "typescript": "$typescript" }
}
JSON
cat > "$consumer/tsconfig.json" <<'JSON'
{
  "compilerOptions": {
    "target": "es2022",
    "lib": ["es2023", "dom"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "types": [],
    "skipLibCheck": false,
    "noEmit": true
  },
  "files": ["main.ts"]
}
JSON
cat > "$consumer/main.ts" <<TS
// 独立项目:只经包根导入。
import {
  CONTRACT_VERSION,
  type BodyNode,
  type EntryRow,
  type Item,
  type ItemOf,
  type PageObject,
  type SiteConfig,
  Root,
  SiteConfig as SiteConfigSchema,
  TABLES,
  assetKey,
  createContract,
} from '$name';

const site: SiteConfig = SiteConfigSchema.parse({
  source: 'example',
  locales: ['en', 'fr'],
  defaultLocale: 'en',
  channels: { production: ['published'] },
  actors: ['author'],
  types: { 'blog.post': { urlPattern: '/{locale}/blog/{slug}' } },
});
const contract = createContract(site);

const valid = {
  schemaVersion: 1,
  type: 'blog.post',
  id: 'sample',
  slug: 'sample',
  stage: 'published',
  workflow: [{ stage: 'published', by: 'author', at: '2026-01-01T00:00:00Z' }],
  authors: ['alice'],
  seo: { ogImage: 'og.png' },
  data: {},
};
const { authors: _authors, ...invalid } = valid;

// ---- 类型层面的断言(由 tsc 判定) ----
const item: Item = contract.item.parse(valid);
const post: ItemOf<'blog.post'> = contract.itemOf('blog.post').parse(valid);
const requiredAuthors: string[] = post.authors;
const requiredOgImage: string = post.seo.ogImage;
const version: 1 = CONTRACT_VERSION;
const node: BodyNode = { type: 'text', value: 'x' };
const columns: readonly string[] = TABLES.entries.columns;
const row: Pick<EntryRow, 'slug' | 'noindex'> = { slug: 'sample', noindex: 0 };
const page: Pick<PageObject, 'locale'> = { locale: 'en' };
// 导出的不是 any:下面三行若不报类型错误,tsc 会因「未使用的 @ts-expect-error」而失败。
// @ts-expect-error 契约版本是数字字面量,不能赋给字符串
const wrongVersion: string = CONTRACT_VERSION;
// @ts-expect-error 未登记的节点类型
const wrongNode: BodyNode = { type: 'raw', value: '<b>x</b>' };
// @ts-expect-error blog.post 的 authors 是必填,不是可选
const wrongAuthors: undefined = post.authors;

// ---- 运行时断言 ----
const failures: string[] = [];
const check = (name: string, ok: boolean): void => {
  console.log(\`\${ok ? 'ok  ' : 'FAIL'} \${name}\`);
  if (!ok) failures.push(name);
};

check('合法 item.json 通过', contract.item.safeParse(valid).success);
const rejected = contract.item.safeParse(invalid);
check('非法 item.json(缺 authors)被拒', !rejected.success);
check(
  '错误指向 authors',
  !rejected.success && rejected.error.issues.some((issue) => issue.path.join('.') === 'authors'),
);
check('未启用的类型被拒', !contract.item.safeParse({ ...valid, type: 'docs.page', data: { kind: 'tutorial' } }).success);
check('AST 白名单生效', !Root.safeParse({ type: 'root', children: [{ type: 'raw', value: 'x' }] }).success);
check('R2 路径函数可用', assetKey('a'.repeat(64), 'logo.png') === \`assets/\${'a'.repeat(64)}/logo.png\`);
check('导入的值与类型一致', version === 1 && item.type === 'blog.post' && requiredAuthors[0] === 'alice');
check('表常量可用', columns.includes('published_at') && row.noindex === 0 && page.locale === 'en');
void [requiredOgImage, node, wrongVersion, wrongNode, wrongAuthors, _authors];

if (failures.length > 0) throw new Error(\`\${failures.length} 条断言不成立\`);
console.log('运行时断言全部成立');
TS

# --offline:不访问网络;依赖只能来自本机 pnpm 仓库(本仓安装时已下载)。
(cd "$consumer" && pnpm install --offline --ignore-workspace --no-frozen-lockfile > "$tmp/install.log" 2>&1) || {
  cat "$tmp/install.log"
  echo "离线安装失败"
  exit 1
}
echo "已离线安装:$(cd "$consumer" && ls node_modules | tr '\n' ' ')"
test -f "$consumer/node_modules/$name/dist/index.d.ts"
test ! -e "$consumer/node_modules/$name/contract"

echo "== 4. 类型检查(skipLibCheck = false) =="
(cd "$consumer" && ./node_modules/.bin/tsc -p tsconfig.json)
echo "类型检查通过"

echo "== 5. 运行 =="
(cd "$consumer" && node main.ts)

echo "通过:全部断言成立"
