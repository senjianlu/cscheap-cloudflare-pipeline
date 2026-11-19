// 类型注册表:每个内容类型的来源、正文模式、专属数据、本地化短文本、被提升为必填的信封字段与默认图标。
// URL 模式与是否启用由使用方的 site.json 决定,不写进注册表。
import { z } from 'zod';
import {
  CalendarDate,
  HttpsUrl,
  ID_BODY,
  Id,
  MAX_URL_LENGTH,
  RELATIVE_PATH_PATTERN,
  Slug,
  TermKey,
  UtcDateTime,
  WebUrl,
  hostOf,
} from './primitives.ts';

/** 由使用方配置派生的取值上下文;缺省(undefined)表示只校验格式,用于生成 JSON Schema。 */
export interface ContractContext {
  readonly locales: readonly string[];
  readonly defaultLocale: string;
  readonly actors: readonly string[];
  readonly assetHosts: readonly string[];
  readonly specKeys: readonly string[];
}

export const BODY_MODES = ['required', 'optional', 'none', 'generated'] as const;
export type BodyMode = (typeof BODY_MODES)[number];

// ---- 资源来源:单元内或仓级资源的相对路径,或域名在 site.assetHosts 内的 https 地址 ----

const ASSET_SOURCE_PATTERN = new RegExp(`^(?:https:\\/\\/[^\\s/].*|${RELATIVE_PATH_PATTERN.source.slice(1, -1)})$`);

export function isAbsoluteAssetSource(value: string): boolean {
  return value.startsWith('https://');
}

export function assetSource(ctx?: ContractContext) {
  return z
    .string()
    .max(MAX_URL_LENGTH)
    .regex(ASSET_SOURCE_PATTERN, '必须是不含 . 或 .. 段的相对路径,或 https 地址')
    .superRefine((value, issue) => {
      if (!isAbsoluteAssetSource(value)) return;
      if (!HttpsUrl.safeParse(value).success) {
        issue.addIssue({ code: 'custom', message: '不安全的 URL' });
        return;
      }
      if (ctx && !ctx.assetHosts.includes(hostOf(value) ?? '')) {
        issue.addIssue({ code: 'custom', message: '外部资源的域名不在 site.assetHosts 内' });
      }
    });
}

// ---- 各类型的 data ----

const ShortText = z.string().min(1).max(200);

export function blogPostData(ctx?: ContractContext) {
  return z.strictObject({
    series: Slug.optional(),
    heroImage: assetSource(ctx).optional(),
  });
}

export function wikiSiteData(ctx?: ContractContext) {
  return z.strictObject({
    name: ShortText,
    url: WebUrl,
    code: Slug,
    affUrl: WebUrl.optional(),
    featured: z.boolean().optional(),
    order: z.number().int().min(0).optional(),
    risk: z.enum(['low', 'medium', 'high']).optional(),
    rating: z
      .strictObject({
        provider: ShortText,
        url: WebUrl,
        score: z.number().min(0).optional(),
        reviews: z.number().int().min(0).optional(),
        ratedAt: UtcDateTime.optional(),
      })
      .optional(),
    marketCode: Slug.optional(),
    foundedYear: z.number().int().min(1900).max(2100).optional(),
    sameAs: z.array(WebUrl).max(32).optional(),
    logo: assetSource(ctx).optional(),
  });
}

export function wikiEventData() {
  return z
    .strictObject({
      eventKind: Slug,
      startDate: CalendarDate,
      endDate: CalendarDate.optional(),
      datePrecision: z.enum(['day', 'month', 'year']).optional(),
      officialUrl: WebUrl.optional(),
      location: z.strictObject({ name: ShortText, address: z.string().min(1).max(500) }).optional(),
      organizer: ShortText.optional(),
    })
    .superRefine((data, issue) => {
      if (data.endDate !== undefined && data.endDate < data.startDate) {
        issue.addIssue({ code: 'custom', path: ['endDate'], message: 'endDate 不得早于 startDate' });
      }
    });
}

export function wikiGuideData() {
  return z.strictObject({
    guideKind: Slug,
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    term: ShortText.optional(),
  });
}

export const DOCS_PAGE_KINDS = ['tutorial', 'how-to', 'reference', 'explanation'] as const;

export function docsPageData() {
  return z.strictObject({
    kind: z.enum(DOCS_PAGE_KINDS),
    deprecated: z.boolean().optional(),
    projects: z.array(Id).max(32).optional(),
  });
}

/** `site.specs` 的描述键。 */
export const SpecKey = Slug;
export const OperationId = z
  .string()
  .max(128)
  .regex(/^[A-Za-z0-9_.-]+$/, 'operationId 只允许字母、数字与 _ . -');

export function docsApiData(ctx?: ContractContext) {
  return z.strictObject({
    spec: SpecKey.refine((key) => !ctx || ctx.specKeys.includes(key), 'spec 不在 site.specs 登记的描述键内'),
    operationId: OperationId,
    deprecated: z.boolean().optional(),
  });
}

// ---- 各类型的本地化短文本(frontmatter 的 l10n) ----

/** 首版没有类型声明本地化短文本的键;声明后在这里换成对应的严格对象。 */
const NoL10n = z.strictObject({});

// ---- 注册表 ----

/** 可被类型提升为必填的信封字段。`seo.<键>` 表示 seo 必填且其中该键必填。 */
export type PromotableField = 'authors' | 'category' | 'tags' | 'seo.ogImage' | 'seo.canonical';

interface GitTypeDef {
  readonly source: 'git';
  readonly body: Exclude<BodyMode, 'none'>;
  readonly promote: readonly PromotableField[];
  readonly defaultIcon: string;
  readonly data: (ctx?: ContractContext) => z.ZodType;
  readonly l10n: z.ZodType;
}

interface SyncTypeDef {
  readonly source: 'sync';
  readonly body: 'none';
  readonly defaultIcon: string;
  /** 引用键的正则主体(不含首尾锚点)。全局引用写作 `<类型>:<引用键>`。 */
  readonly refKey: string;
}

export const TYPE_REGISTRY = {
  'blog.post': {
    source: 'git',
    body: 'required',
    promote: ['authors', 'seo.ogImage'],
    defaultIcon: 'newspaper',
    data: blogPostData,
    l10n: NoL10n,
  },
  'wiki.site': {
    source: 'git',
    body: 'optional',
    promote: [],
    defaultIcon: 'globe',
    data: wikiSiteData,
    l10n: NoL10n,
  },
  'wiki.event': {
    source: 'git',
    body: 'required',
    promote: [],
    defaultIcon: 'calendar',
    data: wikiEventData,
    l10n: NoL10n,
  },
  'wiki.guide': {
    source: 'git',
    body: 'required',
    promote: [],
    defaultIcon: 'book-open',
    data: wikiGuideData,
    l10n: NoL10n,
  },
  'docs.page': {
    source: 'git',
    body: 'required',
    promote: [],
    defaultIcon: 'file-text',
    data: docsPageData,
    l10n: NoL10n,
  },
  'docs.api': {
    source: 'git',
    body: 'generated',
    promote: [],
    defaultIcon: 'braces',
    data: docsApiData,
    l10n: NoL10n,
  },
  item: {
    source: 'sync',
    body: 'none',
    defaultIcon: 'package',
    // <命名空间>/<名称>:名称只含 URL 非保留字符,其余字符须百分号编码(大写十六进制)。
    refKey: '[a-z0-9]+(?:-[a-z0-9]+)*\\/(?:[A-Za-z0-9._~-]|%[0-9A-F]{2}){1,256}',
  },
} as const satisfies Record<string, GitTypeDef | SyncTypeDef>;

export type TypeKey = keyof typeof TYPE_REGISTRY;
export type GitTypeKey = {
  [K in TypeKey]: (typeof TYPE_REGISTRY)[K] extends { source: 'git' } ? K : never;
}[TypeKey];
export type SyncTypeKey = Exclude<TypeKey, GitTypeKey>;

export const TYPE_KEYS = Object.keys(TYPE_REGISTRY) as TypeKey[];

export function isGitType(key: string): key is GitTypeKey {
  return Object.hasOwn(TYPE_REGISTRY, key) && TYPE_REGISTRY[key as TypeKey].source === 'git';
}

export const GIT_TYPE_KEYS = TYPE_KEYS.filter(isGitType);
export const SYNC_TYPE_KEYS = TYPE_KEYS.filter((key): key is SyncTypeKey => !isGitType(key));

export const GitTypeKeySchema = z.enum(GIT_TYPE_KEYS as [GitTypeKey, ...GitTypeKey[]]);

export type GitTypeEntry<K extends GitTypeKey> = Extract<(typeof TYPE_REGISTRY)[K], { source: 'git' }>;
export type DataOf<K extends GitTypeKey> = z.infer<ReturnType<GitTypeEntry<K>['data']>>;
export type L10nOf<K extends GitTypeKey> = z.infer<GitTypeEntry<K>['l10n']>;
export type PromotedOf<K extends GitTypeKey> = GitTypeEntry<K>['promote'][number];

/** 取类型的正文模式。 */
export function bodyModeOf(key: TypeKey): BodyMode {
  return TYPE_REGISTRY[key].body;
}

// ---- 全局引用 `<类型>:<键>` ----

/** 类型键只含小写字母、数字与点;写进正则前只需转义点。 */
function escapeTypeKey(key: string): string {
  return key.replace(/\./g, '\\.');
}

function refKeyBody(key: TypeKey): string {
  const def: GitTypeDef | SyncTypeDef = TYPE_REGISTRY[key];
  return def.source === 'sync' ? def.refKey : ID_BODY;
}

/** 全局引用的正则主体(不含首尾锚点),由注册表生成:Git 类型的键是 id,同步类型的键按其登记的格式。 */
export const GLOBAL_REF_BODY = `(?:${TYPE_KEYS.map((key) => `${escapeTypeKey(key)}:${refKeyBody(key)}`).join('|')})`;
export const GLOBAL_REF_PATTERN = new RegExp(`^${GLOBAL_REF_BODY}$`);

export const GlobalRef = z.string().max(400).regex(GLOBAL_REF_PATTERN, '全局引用必须写作 <已登记的类型>:<键>');
export type GlobalRef = z.infer<typeof GlobalRef>;

/** 拆分全局引用;格式不合法时返回 undefined。 */
export function parseGlobalRef(ref: string): { type: TypeKey; key: string } | undefined {
  if (!GLOBAL_REF_PATTERN.test(ref)) return undefined;
  const type = TYPE_KEYS.filter((key) => ref.startsWith(`${key}:`)).sort((a, b) => b.length - a.length)[0];
  if (type === undefined) return undefined;
  return { type, key: ref.slice(type.length + 1) };
}

/** 词表键数组:非空项、不重复。 */
export function uniqueTermKeys(max: number) {
  return z
    .array(TermKey)
    .max(max)
    .refine((keys) => new Set(keys).size === keys.length, '不得重复')
    .meta({ uniqueItems: true });
}
