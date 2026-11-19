// 从 Zod 契约生成 JSON Schema。用法:node scripts/gen-schemas.ts [输出目录],缺省写入 schemas/。
// 生成物入库;CI 用 scripts/check-schemas.sh 重新生成并要求文件集合与内容都无差异。
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { CONTRACT_VERSION, jsonSchemaSources } from '../contract/index.ts';

const SUFFIX = '.schema.json';

const TITLES: Record<string, string> = {
  site: 'site.json(使用方配置)',
  frontmatter: '正文文件 <locale>.mdx 的 frontmatter',
  taxonomy: 'taxonomy/<vocabulary>.json(受控词表)',
  redirects: 'redirects.json(重定向)',
  navigation: 'navigation.json(导航)',
};

/** 文件基名 → JSON Schema 文本。自定义校验函数表达的规则不进 JSON Schema(见 docs/architecture/contract.md)。 */
export function generateSchemas(): Map<string, string> {
  const files = new Map<string, string>();
  for (const [name, schema] of Object.entries(jsonSchemaSources())) {
    const generated = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input', unrepresentable: 'throw' });
    const { $schema, ...rest } = generated;
    const document = {
      $schema,
      title: TITLES[name] ?? `item.json(${name})`,
      description: `内容契约 v${CONTRACT_VERSION}。由 contract/ 经 scripts/gen-schemas.ts 生成,请勿手改。`,
      ...rest,
    };
    files.set(`${name}${SUFFIX}`, `${JSON.stringify(document, null, 2)}\n`);
  }
  return files;
}

function main(): void {
  const outDir = resolve(process.argv[2] ?? 'schemas');
  mkdirSync(outDir, { recursive: true });
  const files = generateSchemas();
  // 输出目录里不再对应任何来源的旧生成物一并删除,保证文件集合与契约一致。
  for (const existing of readdirSync(outDir)) {
    if (existing.endsWith(SUFFIX) && !files.has(existing)) rmSync(join(outDir, existing));
  }
  for (const [name, text] of files) writeFileSync(join(outDir, name), text);
  console.log(`已生成 ${files.size} 个 JSON Schema 到 ${outDir}`);
}

if (import.meta.main) main();
