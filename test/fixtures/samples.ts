// 测试共用的样本:一份示例 site.json 与每个 Git 类型的一份合法 item.json。
// 示例只用保留域名与示例语言 en / fr。
import type { GitTypeKey } from '../../contract/index.ts';

export const SITE = {
  source: 'example',
  locales: ['en', 'fr'],
  defaultLocale: 'en',
  channels: { preview: ['reviewed', 'published'], production: ['published'] },
  actors: ['author', 'editor', 'bot'],
  types: {
    'blog.post': { urlPattern: '/{locale}/blog/{slug}' },
    'wiki.site': { urlPattern: '/{locale}/sites/{slug}' },
    'wiki.event': { urlPattern: '/{locale}/events/{slug}' },
    'wiki.guide': { urlPattern: '/{locale}/guides/{slug}' },
    'docs.page': { urlPattern: '/{locale}/docs/{slug}' },
    'docs.api': { urlPattern: '/{locale}/docs/api/{id}' },
  },
  assetHosts: ['cdn.example.com'],
  specs: { 'public-api': { en: 'specs/public-api.en.json', fr: 'specs/public-api.fr.json' } },
} as const;

export const DIGEST_A = 'a'.repeat(64);
export const DIGEST_B = 'b'.repeat(64);
export const DIGEST_C = 'c'.repeat(64);

type Json = Record<string, unknown>;

export function workflow(): Json[] {
  return [
    { stage: 'draft', by: 'author', at: '2026-01-01T00:00:00Z' },
    { stage: 'reviewed', by: 'editor', at: '2026-01-02T08:30:00.5Z', note: 'Reviewed.' },
    { stage: 'published', by: 'editor', at: '2026-01-03T00:00:00Z' },
  ];
}

function base(type: GitTypeKey): Json {
  return { schemaVersion: 1, type, id: 'sample', slug: 'sample', stage: 'published', workflow: workflow() };
}

const DATA: Record<GitTypeKey, () => Json> = {
  'blog.post': () => ({}),
  'wiki.site': () => ({ name: 'Example Market', url: 'https://example.com/', code: 'example-market' }),
  'wiki.event': () => ({ eventKind: 'release', startDate: '2026-01-01' }),
  'wiki.guide': () => ({ guideKind: 'glossary' }),
  'docs.page': () => ({ kind: 'tutorial' }),
  'docs.api': () => ({ spec: 'public-api', operationId: 'listMarkets' }),
};

/** 每个 Git 类型的最小合法 item.json(每次调用返回新对象,可随意改动)。 */
export function validItem(type: GitTypeKey): Json {
  const item = { ...base(type), data: DATA[type]() };
  if (type === 'blog.post') return { ...item, authors: ['alice'], seo: { ogImage: 'og.png' } };
  return item;
}

/** 带上全部可选信封字段的 item.json。 */
export function fullItem(type: GitTypeKey): Json {
  return {
    ...validItem(type),
    publishedAt: '2026-01-03T00:00:00Z',
    updatedAt: '2026-02-01T12:00:00Z',
    authors: ['alice', 'bob'],
    sources: [
      { kind: 'url', url: 'https://example.com/source', retrievedAt: '2026-01-01T00:00:00Z' },
      { kind: 'project', id: 'sample-project' },
    ],
    category: 'news',
    tags: ['guide', 'market'],
    refs: [
      { rel: 'about', target: 'wiki.site:example-market' },
      { rel: 'mentions', target: 'item:skins/Example-Item_1' },
    ],
    icon: { image: 'icon.svg', imageDark: 'icon-dark.svg' },
    seo: { noindex: true, canonical: '/en/blog/sample', ogImage: 'og.png' },
  };
}

export function mainFrontmatter(): Json {
  return { title: 'Sample title', description: 'Sample description.' };
}

export function translationFrontmatter(): Json {
  return { title: 'Titre', description: 'Description.', sourceDigest: DIGEST_A };
}

export const GIT_TYPES: GitTypeKey[] = ['blog.post', 'wiki.site', 'wiki.event', 'wiki.guide', 'docs.page', 'docs.api'];

/** 按路径删除一个键,返回新对象。 */
export function without(value: Json, ...path: string[]): Json {
  const copy = structuredClone(value);
  let cursor: Json = copy;
  for (const key of path.slice(0, -1)) cursor = cursor[key] as Json;
  const last = path.at(-1);
  if (last !== undefined) delete cursor[last];
  return copy;
}

/** 按路径设置一个值,返回新对象。 */
export function withValue(value: Json, path: (string | number)[], next: unknown): Json {
  const copy = structuredClone(value);
  let cursor = copy as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string | number, unknown>;
  const last = path.at(-1);
  if (last !== undefined) cursor[last] = next;
  return copy;
}
