// TC-09:生成的 JSON Schema 的语义检查。
// 用独立的 JSON Schema 校验器(Ajv,draft 2020-12)校验 TC-02、TC-03、TC-08 的结构性正反例,
// 要求它对每个样本的接受 / 拒绝结论与 Zod 一致。
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { GIT_TYPE_KEYS, TYPE_REGISTRY, jsonSchemaSources } from '../contract/index.ts';
import { ALL_CASES, type Case, ENVELOPE_CASES, INPUT_CASES, TYPE_CASES } from './fixtures/cases.ts';
import { contextualSchema } from './helpers.ts';

const schemaDir = fileURLToPath(new URL('../schemas/', import.meta.url));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const sources = jsonSchemaSources();

interface JsonSchema {
  required?: string[];
  properties?: Record<string, JsonSchema>;
  [key: string]: unknown;
}

const load = (name: string): JsonSchema =>
  JSON.parse(readFileSync(`${schemaDir}${name}.schema.json`, 'utf8')) as JsonSchema;

const validators = new Map(Object.keys(sources).map((name) => [name, ajv.compile(load(name))]));

function jsonSchemaAccepts(testCase: Case): boolean {
  const validate = validators.get(testCase.schema);
  if (validate === undefined) throw new Error(`没有生成 ${testCase.schema} 的 JSON Schema`);
  return validate(testCase.value);
}

const structural = ALL_CASES.filter((testCase) => testCase.structural);
const zodOnly = ALL_CASES.filter((testCase) => !testCase.structural);

describe('生成物与来源一一对应', () => {
  it('schemas/ 下的文件集合等于来源集合', () => {
    expect(readdirSync(schemaDir).sort()).toEqual(
      Object.keys(sources)
        .map((name) => `${name}.schema.json`)
        .sort(),
    );
    expect(Object.keys(sources).sort()).toEqual(
      ['site', 'frontmatter', 'taxonomy', 'redirects', 'navigation', ...GIT_TYPE_KEYS].sort(),
    );
  });

  it('每份 Schema 都能被独立校验器以严格模式编译', () => {
    expect(validators.size).toBe(11);
  });
});

describe('结构性样本:JSON Schema 与 Zod 结论一致', () => {
  it('样本覆盖 TC-02、TC-03、TC-08 的结构性正反例', () => {
    for (const group of [ENVELOPE_CASES, TYPE_CASES, INPUT_CASES]) {
      expect(group.some((testCase) => testCase.structural && testCase.valid)).toBe(true);
      expect(group.some((testCase) => testCase.structural && !testCase.valid)).toBe(true);
    }
    for (const name of ['blog.post 缺 authors', 'blog.post 缺 seo', 'blog.post 缺 seo.ogImage']) {
      expect(structural.map((testCase) => testCase.name)).toContain(name);
    }
  });

  it.each(structural.map((testCase) => [testCase.name, testCase] as const))('%s', (_, testCase) => {
    const formatOnly = sources[testCase.schema];
    if (formatOnly === undefined) throw new Error(`未知来源:${testCase.schema}`);
    const byJsonSchema = jsonSchemaAccepts(testCase);
    const byZodFormatOnly = formatOnly.safeParse(testCase.value).success;
    const byZodWithSite = contextualSchema(testCase.schema).safeParse(testCase.value).success;
    expect({ byJsonSchema, byZodFormatOnly, byZodWithSite }).toEqual({
      byJsonSchema: testCase.valid,
      byZodFormatOnly: testCase.valid,
      byZodWithSite: testCase.valid,
    });
  });
});

describe('提升必填进了每类型的 JSON Schema', () => {
  it.each(GIT_TYPE_KEYS)('%s:required 与注册表的 promote 一致', (type) => {
    const schema = load(type);
    const promote: readonly string[] = TYPE_REGISTRY[type].promote;
    const top = promote.filter((field) => !field.startsWith('seo.'));
    const seo = promote.filter((field) => field.startsWith('seo.')).map((field) => field.slice(4));
    const always = ['schemaVersion', 'type', 'id', 'slug', 'stage', 'workflow', 'data'];
    expect([...(schema.required ?? [])].sort()).toEqual([...always, ...top, ...(seo.length > 0 ? ['seo'] : [])].sort());
    expect([...(schema.properties?.['seo']?.required ?? [])].sort()).toEqual(seo.sort());
  });

  it('blog.post 的 Schema 拒绝缺 authors、缺 seo、缺 seo.ogImage,其他类型不拒绝', () => {
    const post = ALL_CASES.find((testCase) => testCase.name === 'blog.post 最小合法样本');
    const guide = ALL_CASES.find((testCase) => testCase.name === 'wiki.guide 最小合法样本');
    if (post === undefined || guide === undefined) throw new Error('缺少基础样本');
    const value = post.value as Record<string, unknown>;
    const strip = (key: string) => Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
    const validate = validators.get('blog.post');
    expect(validate?.(value)).toBe(true);
    expect(validate?.(strip('authors'))).toBe(false);
    expect(validate?.(strip('seo'))).toBe(false);
    expect(validate?.({ ...value, seo: {} })).toBe(false);
    expect(validators.get('wiki.guide')?.(guide.value)).toBe(true);
  });
});

describe('JSON Schema 表达不了的规则只由 Zod 判定', () => {
  // 这些规则列在 docs/architecture/contract.md 的「只在 Zod 侧校验的规则」里。
  it.each(zodOnly.map((testCase) => [testCase.name, testCase] as const))('%s:Zod 拒绝', (_, testCase) => {
    expect(testCase.valid).toBe(false);
    expect(contextualSchema(testCase.schema).safeParse(testCase.value).success).toBe(false);
  });
});
