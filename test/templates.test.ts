// TC-11:templates/ 下的每个脚手架单元都通过契约校验,且与类型注册表不漂移。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  GIT_TYPE_KEYS,
  type GitTypeKey,
  SYNC_TYPE_KEYS,
  TYPE_REGISTRY,
  checkSize,
  jsonSchemaSources,
} from '../contract/index.ts';
import { SITE } from './fixtures/samples.ts';
import { contract } from './helpers.ts';

const templatesDir = fileURLToPath(new URL('../templates/', import.meta.url));
const EXAMPLE_LOCALE = 'en';

/**
 * 拆出 frontmatter 与正文。模板的 frontmatter 只用「键: JSON 字符串」这一种写法,
 * 这里按这个子集解析;遇到别的写法直接报错(完整的 YAML 解析属于「校验」任务)。
 */
function splitMdx(raw: string): { frontmatterText: string; frontmatter: Record<string, unknown>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (match === null) throw new Error('模板正文缺少 frontmatter');
  const frontmatterText = match[1] ?? '';
  const frontmatter: Record<string, unknown> = {};
  for (const line of frontmatterText.split('\n')) {
    const pair = /^([A-Za-z][A-Za-z0-9]*): (".*")$/.exec(line);
    if (pair === null) throw new Error(`模板 frontmatter 只支持「键: "字符串"」:${line}`);
    frontmatter[pair[1] ?? ''] = JSON.parse(pair[2] ?? '""') as unknown;
  }
  return { frontmatterText, frontmatter, body: match[2] ?? '' };
}

const files = (type: string): string[] => readdirSync(`${templatesDir}${type}`).sort();
const read = (type: string, name: string): string => readFileSync(`${templatesDir}${type}/${name}`, 'utf8');

describe('模板与注册表一一对应', () => {
  it('每个 source: git 的类型都有模板,且没有多余的目录', () => {
    const directories = readdirSync(templatesDir).filter((name) => statSync(`${templatesDir}${name}`).isDirectory());
    expect(directories.sort()).toEqual([...GIT_TYPE_KEYS].sort());
    expect(readdirSync(templatesDir).sort()).toEqual(directories.sort());
  });

  it('同步类型没有模板', () => {
    for (const type of SYNC_TYPE_KEYS) expect(readdirSync(templatesDir)).not.toContain(type);
  });
});

describe.each(GIT_TYPE_KEYS)('templates/%s', (type: GitTypeKey) => {
  const mode = TYPE_REGISTRY[type].body;

  it('item.json 通过契约(带示例站点上下文与只校验格式两种)', () => {
    const raw = read(type, 'item.json');
    expect(checkSize('item', raw).ok).toBe(true);
    const value: unknown = JSON.parse(raw);
    const parsed = contract.item.safeParse(value);
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
    expect(parsed.data?.type).toBe(type);
    expect(jsonSchemaSources()[type]?.safeParse(value).success).toBe(true);
    // 占位值来自示例站点配置:参与者在 actors 内。
    expect(parsed.data?.workflow.every((entry) => (SITE.actors as readonly string[]).includes(entry.by))).toBe(true);
  });

  if (mode === 'generated') {
    it('generated 类型的模板只有 item.json', () => {
      expect(files(type)).toEqual(['item.json']);
      expect(contract.localeFiles(type).safeParse({}).success).toBe(true);
    });
    return;
  }

  it('只含 item.json 与一份示例语言的主稿', () => {
    expect(files(type)).toEqual([`${EXAMPLE_LOCALE}.mdx`, 'item.json']);
  });

  it('主稿的 frontmatter 与语言文件规则通过契约', () => {
    const { frontmatterText, frontmatter, body } = splitMdx(read(type, `${EXAMPLE_LOCALE}.mdx`));
    expect(checkSize('frontmatter', frontmatterText).ok).toBe(true);
    const direct = contract.frontmatter(type, EXAMPLE_LOCALE).safeParse(frontmatter);
    expect(direct.success ? [] : direct.error.issues).toEqual([]);
    const fileSet = contract.localeFiles(type).safeParse({ [EXAMPLE_LOCALE]: { frontmatter, body } });
    expect(fileSet.success ? [] : fileSet.error.issues).toEqual([]);
    expect(body.trim().length).toBeGreaterThan(0);
  });
});
