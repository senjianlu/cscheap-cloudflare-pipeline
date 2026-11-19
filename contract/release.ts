// 发布侧形状:D1 的表名 / 列名常量、各表行的 schema、输入到行的映射,以及就绪、激活、切换、回滚的 SQL。
// migrations/0001_init.sql 必须与这里的常量一致(由测试核对)。写入与切换的执行归发布任务。
import { z } from 'zod';
import { type Frontmatter, type Item, IconName, REF_RELS, firstPublishedAt } from './envelope.ts';
import type { Navigation, Redirects, Taxonomy } from './inputs.ts';
import { VOCABULARIES } from './inputs.ts';
import {
  CONTRACT_VERSION,
  ContractError,
  HttpsUrl,
  Id,
  Locale,
  NormalizedUtcDateTime,
  SHA256_PATTERN,
  Sha256,
  ShortName,
  SitePath,
  Slug,
  TermKey,
  UtcDateTime,
  normalizeUtc,
} from './primitives.ts';
import { SiteSnapshot } from './site.ts';
import { ASSET_FILE_NAME_PATTERN, ASSET_MIMES, AssetRef, type FinalizedAsset } from './storage.ts';
import { GitTypeKeySchema, TYPE_KEYS, isAbsoluteAssetSource, parseGlobalRef } from './types.ts';

// ---- 表与列 ----

export const TABLES = {
  releases: {
    name: 'releases',
    columns: [
      'release_id',
      'source',
      'channel',
      'commit_sha',
      'contract_version',
      'status',
      'expected',
      'assets_verified',
      'site',
      'created_at',
    ],
    primaryKey: ['release_id'],
  },
  channel_pointers: {
    name: 'channel_pointers',
    columns: ['source', 'channel', 'current_release', 'previous_release', 'activated_at'],
    primaryKey: ['source', 'channel'],
  },
  objects: {
    name: 'objects',
    columns: ['sha256', 'kind', 'size', 'body'],
    primaryKey: ['sha256'],
  },
  entries: {
    name: 'entries',
    columns: ['release_id', 'type', 'id', 'slug', 'category', 'published_at', 'updated_at', 'noindex', 'meta', 'data'],
    primaryKey: ['release_id', 'type', 'id'],
  },
  entry_locales: {
    name: 'entry_locales',
    columns: [
      'release_id',
      'type',
      'id',
      'locale',
      'title',
      'description',
      'seo_title',
      'summary',
      'image_alt',
      'l10n',
      'object_sha256',
    ],
    primaryKey: ['release_id', 'type', 'id', 'locale'],
  },
  entry_tags: {
    name: 'entry_tags',
    columns: ['release_id', 'tag', 'type', 'id'],
    primaryKey: ['release_id', 'tag', 'type', 'id'],
  },
  links: {
    name: 'links',
    columns: ['release_id', 'source_type', 'source_id', 'source_locale', 'target_type', 'target_key', 'rel'],
    primaryKey: ['release_id', 'source_type', 'source_id', 'source_locale', 'target_type', 'target_key', 'rel'],
  },
  redirects: {
    name: 'redirects',
    columns: ['release_id', 'locale', 'from_path', 'to_path', 'status'],
    primaryKey: ['release_id', 'locale', 'from_path'],
  },
  release_assets: {
    name: 'release_assets',
    columns: ['release_id', 'sha256', 'name', 'mime', 'size'],
    primaryKey: ['release_id', 'sha256', 'name'],
  },
  taxonomy_terms: {
    name: 'taxonomy_terms',
    columns: ['release_id', 'vocabulary', 'term', 'data'],
    primaryKey: ['release_id', 'vocabulary', 'term'],
  },
  nav: {
    name: 'nav',
    columns: ['release_id', 'locale', 'tree'],
    primaryKey: ['release_id', 'locale'],
  },
} as const;

export type TableName = keyof typeof TABLES;
export const TABLE_NAMES = Object.keys(TABLES) as TableName[];

/** 带 release_id 的各表(即一个版本拥有的行所在的表)。 */
export const RELEASE_SCOPED_TABLES = [
  'entries',
  'entry_locales',
  'entry_tags',
  'links',
  'redirects',
  'release_assets',
  'taxonomy_terms',
  'nav',
] as const satisfies readonly TableName[];

export interface IndexDef {
  readonly name: string;
  readonly table: TableName;
  readonly unique: boolean;
  readonly columns: readonly { readonly name: string; readonly desc?: true }[];
}

export const INDEXES: readonly IndexDef[] = [
  {
    name: 'entries_release_type_slug',
    table: 'entries',
    unique: true,
    columns: [{ name: 'release_id' }, { name: 'type' }, { name: 'slug' }],
  },
  {
    name: 'entries_release_type_published',
    table: 'entries',
    unique: false,
    columns: [{ name: 'release_id' }, { name: 'type' }, { name: 'published_at', desc: true }],
  },
  {
    name: 'entries_release_type_category_published',
    table: 'entries',
    unique: false,
    columns: [{ name: 'release_id' }, { name: 'type' }, { name: 'category' }, { name: 'published_at', desc: true }],
  },
  {
    name: 'links_release_target',
    table: 'links',
    unique: false,
    columns: [{ name: 'release_id' }, { name: 'target_type' }, { name: 'target_key' }, { name: 'source_type' }],
  },
  {
    name: 'entry_locales_release_locale_type',
    table: 'entry_locales',
    unique: false,
    columns: [{ name: 'release_id' }, { name: 'locale' }, { name: 'type' }],
  },
];

// ---- 取值常量 ----

export const RELEASE_STATUSES = ['writing', 'ready'] as const;
export const OBJECT_KINDS = ['page'] as const;
/** 语言无关的引用边(信封 refs)在 links.source_locale 里的取值。 */
export const LINK_LOCALE_NEUTRAL = '';
/** 对全部语言生效的重定向在 redirects.locale 里的取值。 */
export const REDIRECT_ALL_LOCALES = '*';

// ---- 行 schema ----

const ReleaseId = Sha256;
const Bit = z.union([z.literal(0), z.literal(1)]);
const Count = z.number().int().min(0);

/** 各表应有行数(键为表名),加上被引用的正文对象数 `objects`。资源数即 release_assets 的行数。 */
export const ExpectedCounts = z.strictObject({
  entries: Count,
  entry_locales: Count,
  entry_tags: Count,
  links: Count,
  redirects: Count,
  release_assets: Count,
  taxonomy_terms: Count,
  nav: Count,
  objects: Count,
});
export type ExpectedCounts = z.infer<typeof ExpectedCounts>;

export const ReleaseRow = z.strictObject({
  release_id: ReleaseId,
  source: ShortName,
  channel: ShortName,
  commit_sha: z.string().regex(/^[0-9a-f]{40}([0-9a-f]{24})?$/),
  contract_version: z.literal(CONTRACT_VERSION),
  status: z.enum(RELEASE_STATUSES),
  expected: ExpectedCounts,
  assets_verified: Bit,
  site: SiteSnapshot,
  created_at: UtcDateTime,
});
export type ReleaseRow = z.infer<typeof ReleaseRow>;

export const ChannelPointerRow = z.strictObject({
  source: ShortName,
  channel: ShortName,
  current_release: ReleaseId,
  previous_release: ReleaseId.nullable(),
  activated_at: UtcDateTime,
});
export type ChannelPointerRow = z.infer<typeof ChannelPointerRow>;

export const ObjectRow = z.strictObject({
  sha256: Sha256,
  kind: z.enum(OBJECT_KINDS),
  size: Count,
  /** 页对象的规范序列化文本。 */
  body: z.string(),
});
export type ObjectRow = z.infer<typeof ObjectRow>;

/** 已发布的资源引用:定稿后的 `/assets/…`,或白名单域名的 https 地址。 */
export const PublishedAsset = z.union([AssetRef, HttpsUrl]);

export const PublishedIcon = z.union([
  z.literal(false),
  IconName,
  z.strictObject({
    image: PublishedAsset,
    imageDark: PublishedAsset.optional(),
    width: z.number().int().min(1).optional(),
    height: z.number().int().min(1).optional(),
  }),
]);

const PublishedSource = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('url'), url: z.string(), retrievedAt: UtcDateTime.optional() }),
  z.strictObject({ kind: z.literal('project'), id: Id }),
]);

/** entries.meta:语言无关、但不需要单独成列的信封字段。 */
export const EntryMeta = z.strictObject({
  authors: z.array(TermKey).optional(),
  sources: z.array(PublishedSource).optional(),
  canonical: z.string().optional(),
  ogImage: PublishedAsset.optional(),
  icon: PublishedIcon.optional(),
});
export type EntryMeta = z.infer<typeof EntryMeta>;

export const EntryRow = z.strictObject({
  release_id: ReleaseId,
  type: GitTypeKeySchema,
  id: Id,
  slug: Slug,
  category: TermKey.nullable(),
  /** 规范化后的 UTC 时间(小数固定九位),保证按文本排序即按时间排序。 */
  published_at: NormalizedUtcDateTime.nullable(),
  updated_at: NormalizedUtcDateTime.nullable(),
  noindex: Bit,
  meta: EntryMeta,
  data: z.record(z.string(), z.unknown()),
});
export type EntryRow = z.infer<typeof EntryRow>;

export const EntryLocaleRow = z.strictObject({
  release_id: ReleaseId,
  type: GitTypeKeySchema,
  id: Id,
  locale: Locale,
  title: z.string(),
  description: z.string(),
  seo_title: z.string().nullable(),
  summary: z.string().nullable(),
  image_alt: z.string().nullable(),
  l10n: z.record(z.string(), z.string()).nullable(),
  /** 空 = 该语言没有正文。 */
  object_sha256: Sha256.nullable(),
});
export type EntryLocaleRow = z.infer<typeof EntryLocaleRow>;

export const EntryTagRow = z.strictObject({ release_id: ReleaseId, tag: TermKey, type: GitTypeKeySchema, id: Id });
export type EntryTagRow = z.infer<typeof EntryTagRow>;

export const LinkRow = z.strictObject({
  release_id: ReleaseId,
  source_type: GitTypeKeySchema,
  source_id: Id,
  /** 正文里的引用写所在语言;信封 refs 写 LINK_LOCALE_NEUTRAL。 */
  source_locale: z.union([z.literal(LINK_LOCALE_NEUTRAL), Locale]),
  target_type: z.enum(TYPE_KEYS as [string, ...string[]]),
  target_key: z.string().min(1),
  /** 信封 refs 用其声明的 rel;正文里的引用一律记为 mentions。 */
  rel: z.enum(REF_RELS),
});
export type LinkRow = z.infer<typeof LinkRow>;

export const RedirectRow = z.strictObject({
  release_id: ReleaseId,
  locale: z.union([z.literal(REDIRECT_ALL_LOCALES), Locale]),
  from_path: SitePath,
  to_path: SitePath,
  status: z.union([z.literal(301), z.literal(308)]),
});
export type RedirectRow = z.infer<typeof RedirectRow>;

export const ReleaseAssetRow = z.strictObject({
  release_id: ReleaseId,
  sha256: Sha256,
  name: z.string().regex(ASSET_FILE_NAME_PATTERN),
  mime: z.enum(ASSET_MIMES as [string, ...string[]]),
  size: Count,
});
export type ReleaseAssetRow = z.infer<typeof ReleaseAssetRow>;

export const TaxonomyTermRow = z.strictObject({
  release_id: ReleaseId,
  vocabulary: z.enum(VOCABULARIES),
  term: TermKey,
  data: z.strictObject({ labels: z.record(z.string(), z.string()), url: z.string().optional() }),
});
export type TaxonomyTermRow = z.infer<typeof TaxonomyTermRow>;

export const NavGroup = z.strictObject({
  title: z.string(),
  icon: PublishedIcon.optional(),
  pages: z.array(z.string()),
});

export const NavRow = z.strictObject({ release_id: ReleaseId, locale: Locale, tree: z.array(NavGroup) });
export type NavRow = z.infer<typeof NavRow>;

// ---- 输入 → 行(实现方案 §1.2 的映射) ----

/** 把输入里的资源来源(相对路径或 https 地址)换成发布后的引用。相对路径必须经资源定稿得到引用。 */
export type AssetResolver = (source: string) => string;

function resolveAssetSource(source: string, resolve: AssetResolver | undefined): string {
  if (isAbsoluteAssetSource(source)) return source;
  if (resolve === undefined) {
    throw new ContractError('asset_unresolved', '仓内资源必须先经资源定稿,再写入发布行');
  }
  return resolve(source);
}

function publishIcon(icon: Item['icon'], resolve: AssetResolver | undefined): EntryMeta['icon'] {
  if (icon === undefined || icon === false || typeof icon === 'string') return icon;
  return {
    image: resolveAssetSource(icon.image, resolve),
    ...(icon.imageDark === undefined ? {} : { imageDark: resolveAssetSource(icon.imageDark, resolve) }),
    ...(icon.width === undefined ? {} : { width: icon.width }),
    ...(icon.height === undefined ? {} : { height: icon.height }),
  };
}

function dropUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

/** 输入里的时间 → 发布列:规范化为定宽写法;缺省记为 NULL。 */
function publishTime(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = normalizeUtc(value);
  if (normalized === undefined) throw new ContractError('invalid_time', '时间不是合法的 UTC 写法');
  return normalized;
}

/**
 * item.json → entries 行。`stage`、`workflow`、`schemaVersion` 不发布。
 * 信封里的资源来源(图标、seo.ogImage)换成定稿后的引用;`data` 原样写入。
 */
export function toEntryRow(releaseId: string, item: Item, resolve?: AssetResolver): EntryRow {
  const meta: EntryMeta = dropUndefined({
    authors: item.authors,
    sources: item.sources,
    canonical: item.seo?.canonical,
    ogImage: item.seo?.ogImage === undefined ? undefined : resolveAssetSource(item.seo.ogImage, resolve),
    icon: publishIcon(item.icon, resolve),
  });
  return {
    release_id: releaseId,
    type: item.type,
    id: item.id,
    slug: item.slug,
    category: item.category ?? null,
    published_at: publishTime(item.publishedAt ?? firstPublishedAt(item.workflow)),
    updated_at: publishTime(item.updatedAt),
    noindex: item.seo?.noindex === true ? 1 : 0,
    meta,
    data: { ...item.data },
  };
}

/** 一份语言文件的 frontmatter → entry_locales 行。`objectSha256` 为 null 表示该语言没有正文。`sourceDigest` 不发布。 */
export function toEntryLocaleRow(
  releaseId: string,
  item: Pick<Item, 'type' | 'id'>,
  locale: string,
  frontmatter: Frontmatter,
  objectSha256: string | null,
): EntryLocaleRow {
  return {
    release_id: releaseId,
    type: item.type,
    id: item.id,
    locale,
    title: frontmatter.title,
    description: frontmatter.description,
    seo_title: frontmatter.seoTitle ?? null,
    summary: frontmatter.summary ?? null,
    image_alt: frontmatter.imageAlt ?? null,
    l10n: frontmatter.l10n ?? null,
    object_sha256: objectSha256,
  };
}

export function toEntryTagRows(releaseId: string, item: Pick<Item, 'type' | 'id' | 'tags'>): EntryTagRow[] {
  return (item.tags ?? []).map((tag) => ({ release_id: releaseId, tag, type: item.type, id: item.id }));
}

/** 信封 refs → links 行(语言无关)。 */
export function toRefLinkRows(releaseId: string, item: Pick<Item, 'type' | 'id' | 'refs'>): LinkRow[] {
  return (item.refs ?? []).map((ref) => {
    const target = parseGlobalRef(ref.target);
    if (target === undefined) throw new ContractError('invalid_ref', '引用目标不是合法的全局引用');
    return {
      release_id: releaseId,
      source_type: item.type,
      source_id: item.id,
      source_locale: LINK_LOCALE_NEUTRAL,
      target_type: target.type,
      target_key: target.key,
      rel: ref.rel,
    };
  });
}

export function toRedirectRows(releaseId: string, redirects: Redirects): RedirectRow[] {
  return redirects.redirects.map((entry) => ({
    release_id: releaseId,
    locale: entry.locale ?? REDIRECT_ALL_LOCALES,
    from_path: entry.from,
    to_path: entry.to,
    status: entry.status,
  }));
}

export function toTaxonomyTermRows(releaseId: string, taxonomy: Taxonomy): TaxonomyTermRow[] {
  const row = (term: string, labels: Record<string, string>, url?: string): TaxonomyTermRow => ({
    release_id: releaseId,
    vocabulary: taxonomy.vocabulary,
    term,
    data: url === undefined ? { labels } : { labels, url },
  });
  if (taxonomy.vocabulary === 'authors') {
    return Object.entries(taxonomy.terms).map(([term, value]) => row(term, value.labels, value.url));
  }
  return Object.entries(taxonomy.terms).map(([term, value]) => row(term, value.labels));
}

/** navigation.json → 每种语言一行;分组标题缺该语言译文时回退到 defaultLocale。 */
export function toNavRows(
  releaseId: string,
  navigation: Navigation,
  site: { locales: readonly string[]; defaultLocale: string },
  resolve?: AssetResolver,
): NavRow[] {
  return site.locales.map((locale) => ({
    release_id: releaseId,
    locale,
    tree: navigation.groups.map((group) =>
      dropUndefined({
        title: group.title[locale] ?? group.title[site.defaultLocale] ?? '',
        icon: publishIcon(group.icon, resolve),
        pages: group.pages,
      }),
    ),
  }));
}

export function toReleaseAssetRow(releaseId: string, asset: FinalizedAsset): ReleaseAssetRow {
  return { release_id: releaseId, sha256: asset.sha256, name: asset.name, mime: asset.mime, size: asset.size };
}

// ---- SQL ----

/** 某表的整行插入语句;占位符按 TABLES 里的列顺序编号(?1 起)。 */
export function insertSql(table: TableName): string {
  const { name, columns } = TABLES[table];
  return `INSERT INTO ${name} (${columns.join(', ')}) VALUES (${columns.map((_, index) => `?${index + 1}`).join(', ')})`;
}

/** 行对象 → 绑定参数(顺序同 insertSql);对象与数组序列化为 JSON 文本,undefined 记为 NULL。 */
export function rowParams(table: TableName, row: Record<string, unknown>): (string | number | null)[] {
  return TABLES[table].columns.map((column) => {
    const value = row[column];
    if (value === undefined || value === null) return null;
    if (typeof value === 'string' || typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return JSON.stringify(value);
  });
}

/** objects 是内容寻址且不可变的:同一摘要已存在则跳过。参数顺序同 insertSql('objects')。 */
export const INSERT_OBJECT_SQL = `${insertSql('objects')} ON CONFLICT (sha256) DO NOTHING`;

/**
 * 资源核对完成(实现方案 §4 第 2 步末尾)。参数:?1 release_id。
 * 只在版本仍为 writing 时生效;这是版本行仅有的两次更新之一。
 */
export const MARK_ASSETS_VERIFIED_SQL = `UPDATE releases SET assets_verified = 1
WHERE release_id = ?1 AND status = 'writing' AND assets_verified = 0`;

const countMatches = RELEASE_SCOPED_TABLES.map(
  (table) =>
    `  AND json_extract(expected, '$.${table}') = (SELECT COUNT(*) FROM ${TABLES[table].name} WHERE release_id = ?1)`,
).join('\n');

/**
 * 就绪(§4 第 3 步)。参数:?1 release_id。同时满足三项才把 status 改为 ready:
 * 各表该版本的实际行数与 expected 相符(含被引用的正文对象数);entry_locales 引用的每个
 * object_sha256 在 objects 中存在;assets_verified = 1。影响 1 行 = 已就绪;0 行 = 条件不满足或已就绪。
 */
export const MARK_READY_SQL = `UPDATE releases SET status = 'ready'
WHERE release_id = ?1
  AND status = 'writing'
  AND assets_verified = 1
${countMatches}
  AND json_extract(expected, '$.objects') = (
    SELECT COUNT(DISTINCT object_sha256) FROM entry_locales
    WHERE release_id = ?1 AND object_sha256 IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM entry_locales AS el
    WHERE el.release_id = ?1
      AND el.object_sha256 IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM objects AS o WHERE o.sha256 = el.object_sha256)
  )`;

/** 读取指针(§4 第 6、8 步)。参数:?1 source,?2 channel。 */
export const READ_POINTER_SQL = `SELECT source, channel, current_release, previous_release, activated_at
FROM channel_pointers WHERE source = ?1 AND channel = ?2`;

/**
 * 首次激活(§4 第 4 步):带条件的插入。参数:?1 目标 release_id,?2 source,?3 channel,?4 激活时间。
 * 仅当目标版本存在、为 ready、来源与频道与指针一致,且指针行仍不存在时插入;previous_release 为空。
 */
export const ACTIVATE_FIRST_SQL = `INSERT INTO channel_pointers (source, channel, current_release, previous_release, activated_at)
SELECT r.source, r.channel, r.release_id, NULL, ?4
FROM releases AS r
WHERE r.release_id = ?1
  AND r.source = ?2
  AND r.channel = ?3
  AND r.status = 'ready'
  AND NOT EXISTS (SELECT 1 FROM channel_pointers AS p WHERE p.source = ?2 AND p.channel = ?3)
ON CONFLICT (source, channel) DO NOTHING`;

/**
 * 切换与回滚(§4 第 5、7 步):同一条带条件的更新。
 * 参数:?1 目标 release_id,?2 source,?3 channel,?4 写入前读到的 current_release,?5 激活时间。
 * 除首次激活对目标版本的三个条件外,还要求 current_release 等于 ?4 且不等于目标;
 * 成立则 previous_release 取旧的 current_release。
 */
export const SWITCH_POINTER_SQL = `UPDATE channel_pointers
SET previous_release = current_release, current_release = ?1, activated_at = ?5
WHERE source = ?2
  AND channel = ?3
  AND current_release = ?4
  AND current_release <> ?1
  AND EXISTS (
    SELECT 1 FROM releases AS r
    WHERE r.release_id = ?1 AND r.source = ?2 AND r.channel = ?3 AND r.status = 'ready'
  )`;

/** 回滚与切换是同一条语句,目标取某个仍为 ready 且同来源同频道的版本。 */
export const ROLLBACK_POINTER_SQL = SWITCH_POINTER_SQL;

export type ActivationOutcome = 'activated' | 'already-current' | 'rejected';

/**
 * 结果判定(§4 第 6 步):语句影响的行数 + 回读到的指针。
 * - 影响 1 行且指针已指向目标 = 已切换;
 * - 影响 0 行且 current_release 已是目标 = 已是当前版本(幂等成功,指针三列不变);
 * - 其余 = 冲突或目标不合格,指针不变。
 */
export function judgeActivation(input: {
  changes: number;
  target: string;
  pointer: Pick<ChannelPointerRow, 'current_release'> | null | undefined;
}): ActivationOutcome {
  if (!SHA256_PATTERN.test(input.target)) return 'rejected';
  const isCurrent = input.pointer?.current_release === input.target;
  if (input.changes === 1 && isCurrent) return 'activated';
  if (input.changes === 0 && isCurrent) return 'already-current';
  return 'rejected';
}
