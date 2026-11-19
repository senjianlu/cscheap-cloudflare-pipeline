// 公共信封 item.json 与各语言正文文件 frontmatter 的 schema,以及「一个单元有哪些语言文件」的规则。
// 取值集合(参与者、语言、外部资源域名)来自上下文;不带上下文时只校验格式,用于生成 JSON Schema。
import { z } from 'zod';
import {
  Id,
  LOCALE_PATTERN,
  MAX_URL_LENGTH,
  SLUG_PATTERN,
  SchemaVersion,
  Sha256,
  ShortName,
  Slug,
  TermKey,
  UtcDateTime,
  WebUrl,
  compareUtc,
  isSafeUrl,
} from './primitives.ts';
import {
  type ContractContext,
  type DataOf,
  type GitTypeKey,
  GitTypeKeySchema,
  GlobalRef,
  type PromotedOf,
  TYPE_REGISTRY,
  assetSource,
  isAbsoluteAssetSource,
  uniqueTermKeys,
} from './types.ts';

// ---- 枚举 ----

export const STAGES = ['draft', 'reviewed', 'published', 'held', 'retired'] as const;
export const Stage = z.enum(STAGES);
export type Stage = z.infer<typeof Stage>;

export const REF_RELS = ['about', 'mentions', 'related', 'partOf', 'supersedes'] as const;
export const RefRel = z.enum(REF_RELS);
export type RefRel = z.infer<typeof RefRel>;

// ---- 图标 ----

/** Lucide 图标名:短横线写法,只校验格式,不设受控清单。 */
export const IconName = z.string().min(1).max(64).regex(SLUG_PATTERN, '图标名必须是小写短横线写法');

const IconDimension = z.number().int().min(1).max(4096);

export function iconImage(ctx?: ContractContext) {
  return z
    .strictObject({
      image: assetSource(ctx),
      imageDark: assetSource(ctx).optional(),
      width: IconDimension.optional(),
      height: IconDimension.optional(),
    })
    .superRefine((icon, issue) => {
      const absolute =
        isAbsoluteAssetSource(icon.image) || (icon.imageDark !== undefined && isAbsoluteAssetSource(icon.imageDark));
      if (!absolute) return;
      for (const key of ['width', 'height'] as const) {
        if (icon[key] === undefined) {
          issue.addIssue({ code: 'custom', path: [key], message: '图片为绝对地址时必须给出宽高' });
        }
      }
    });
}

/**
 * 图标取值:`false` = 不显示;字符串 = Lucide 图标名;对象 = 图片。
 * 字段缺省(undefined)= 使用类型默认图标,由字段的可选性表达,不在本联合内。
 */
export function iconValue(ctx?: ContractContext) {
  return z.union([z.literal(false), IconName, iconImage(ctx)]);
}

export type IconValue = z.infer<ReturnType<typeof iconValue>>;

/** 区分「未配置」(用类型默认)、「不显示」与具体图标。 */
export function resolveIcon(
  icon: IconValue | undefined,
  defaultIcon: string,
):
  | { kind: 'none' }
  | { kind: 'name'; name: string; isDefault: boolean }
  | { kind: 'image'; image: Exclude<IconValue, string | false> } {
  if (icon === undefined) return { kind: 'name', name: defaultIcon, isDefault: true };
  if (icon === false) return { kind: 'none' };
  if (typeof icon === 'string') return { kind: 'name', name: icon, isDefault: false };
  return { kind: 'image', image: icon };
}

// ---- 信封的各部分 ----

export function workflowEntry(ctx?: ContractContext) {
  return z.strictObject({
    stage: Stage,
    by: ShortName.refine((by) => !ctx || ctx.actors.includes(by), 'by 不在 site.actors 内'),
    at: UtcDateTime,
    note: z.string().min(1).max(1000).optional(),
  });
}

export const Source = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('url'), url: WebUrl, retrievedAt: UtcDateTime.optional() }),
  z.strictObject({ kind: z.literal('project'), id: Id }),
]);
export type Source = z.infer<typeof Source>;

export const Ref = z.strictObject({ rel: RefRel, target: GlobalRef });
export type Ref = z.infer<typeof Ref>;

/** 规范地址:站内路径,或 https 绝对地址。 */
export const Canonical = z
  .string()
  .max(MAX_URL_LENGTH)
  .regex(/^(?:\/(?!\/)|https:\/\/[^\s/])/, '必须是站内路径或 https 地址')
  .refine(isSafeUrl, '不安全的 URL');

type SeoKey = 'canonical' | 'ogImage';

function seoShape(ctx: ContractContext | undefined) {
  return {
    noindex: z.boolean().optional(),
    canonical: Canonical.optional(),
    ogImage: assetSource(ctx).optional(),
  };
}

/** seo 对象;required 里的键被提升为必填。 */
function seoSchema(ctx: ContractContext | undefined, required: ReadonlySet<SeoKey>): z.ZodType {
  const shape = seoShape(ctx);
  return z.strictObject({
    ...shape,
    canonical: required.has('canonical') ? shape.canonical.unwrap() : shape.canonical,
    ogImage: required.has('ogImage') ? shape.ogImage.unwrap() : shape.ogImage,
  });
}

export const MAX_WORKFLOW_ENTRIES = 500;

/** 信封里与类型无关的字段;此处全部按「未提升」的可选性给出。 */
function commonShape(ctx: ContractContext | undefined) {
  return {
    schemaVersion: SchemaVersion,
    id: Id,
    slug: Slug,
    stage: Stage,
    workflow: z.array(workflowEntry(ctx)).min(1).max(MAX_WORKFLOW_ENTRIES),
    publishedAt: UtcDateTime.optional(),
    updatedAt: UtcDateTime.optional(),
    authors: uniqueTermKeys(16).min(1).optional(),
    sources: z.array(Source).max(64).optional(),
    category: TermKey.optional(),
    tags: uniqueTermKeys(64).optional(),
    refs: z.array(Ref).max(256).optional(),
    icon: iconValue(ctx).optional(),
    seo: z.strictObject(seoShape(ctx)).optional(),
  };
}

/**
 * 组合出某个类型的信封形状。提升必填在这里直接改变字段的可选性(而不是事后校验),
 * 所以由它生成的 JSON Schema 带同样的 required。
 */
function envelopeShape(type: GitTypeKey, ctx: ContractContext | undefined): Record<string, z.ZodType> {
  const def = TYPE_REGISTRY[type];
  const promoted: ReadonlySet<string> = new Set(def.promote);
  const seoRequired = new Set<SeoKey>();
  if (promoted.has('seo.canonical')) seoRequired.add('canonical');
  if (promoted.has('seo.ogImage')) seoRequired.add('ogImage');
  const common = commonShape(ctx);

  return {
    ...common,
    type: z.literal(type),
    authors: promoted.has('authors') ? common.authors.unwrap() : common.authors,
    category: promoted.has('category') ? common.category.unwrap() : common.category,
    tags: promoted.has('tags') ? common.tags.unwrap() : common.tags,
    seo: seoRequired.size > 0 ? seoSchema(ctx, seoRequired) : common.seo,
    data: def.data(ctx),
  };
}

interface WorkflowShape {
  stage: string;
  workflow: readonly { stage: string; at: string }[];
}

/** JSON Schema 表达不了的跨字段规则:workflow 时间不减,末项 stage 等于顶层 stage。 */
function checkWorkflow(item: WorkflowShape, issue: z.RefinementCtx): void {
  // 按完整精度比较(时间最多九位小数,不能先转成毫秒)。格式不合法的项由字段自身的校验报告,这里跳过。
  let latest: string | undefined;
  item.workflow.forEach((entry, index) => {
    if (compareUtc(entry.at, entry.at) === undefined) return;
    if (latest !== undefined && (compareUtc(entry.at, latest) ?? 0) < 0) {
      issue.addIssue({ code: 'custom', path: ['workflow', index, 'at'], message: 'workflow 的时间不得早于前一项' });
      return;
    }
    latest = entry.at;
  });
  const last = item.workflow.at(-1);
  if (last !== undefined && last.stage !== item.stage) {
    issue.addIssue({
      code: 'custom',
      path: ['workflow', item.workflow.length - 1, 'stage'],
      message: 'workflow 末项的 stage 必须等于顶层 stage',
    });
  }
}

/** 某个类型的 item.json 对象 schema(含 workflow 的跨字段规则),供组合成判别联合与生成 JSON Schema。 */
export function itemObject(type: GitTypeKey, ctx?: ContractContext) {
  return z.strictObject(envelopeShape(type, ctx)).superRefine((item, issue) => {
    const { stage, workflow } = item as { stage?: unknown; workflow?: unknown };
    if (typeof stage === 'string' && Array.isArray(workflow)) {
      checkWorkflow({ stage, workflow: workflow as WorkflowShape['workflow'] }, issue);
    }
  });
}

// ---- 静态类型 ----

/** 未提升任何字段、类型与 data 未定的信封;用于推导静态类型。 */
export const BaseEnvelopeSchema = z.strictObject({
  ...commonShape(undefined),
  type: GitTypeKeySchema,
  data: z.unknown(),
});
type BaseEnvelope = z.infer<typeof BaseEnvelopeSchema>;
export type Seo = NonNullable<BaseEnvelope['seo']>;
export type WorkflowEntry = BaseEnvelope['workflow'][number];

type TopPromoted<P> = Exclude<P, `seo.${string}`> & keyof BaseEnvelope;
type SeoPromoted<P> = P extends `seo.${infer Key}` ? Key & keyof Seo : never;

/** 某个类型的 item.json 的静态类型;提升必填的字段在类型里也是必填。 */
export type ItemOf<K extends GitTypeKey> = Omit<BaseEnvelope, 'type' | 'data' | 'seo' | TopPromoted<PromotedOf<K>>> &
  Required<Pick<BaseEnvelope, TopPromoted<PromotedOf<K>>>> & { type: K; data: DataOf<K> } & ([
    SeoPromoted<PromotedOf<K>>,
  ] extends [never]
    ? { seo?: Seo }
    : { seo: Omit<Seo, SeoPromoted<PromotedOf<K>>> & Required<Pick<Seo, SeoPromoted<PromotedOf<K>>>> });

export type Item = { [K in GitTypeKey]: ItemOf<K> }[GitTypeKey];

/** 首次进入 published 的时间;从未进入则为 undefined。 */
export function firstPublishedAt(workflow: readonly { stage: string; at: string }[]): string | undefined {
  return workflow.find((entry) => entry.stage === 'published')?.at;
}

// ---- frontmatter ----

export type FrontmatterRole = 'main' | 'translation';

const GenericL10n = z.record(z.string().regex(/^[a-z][A-Za-z0-9]*$/), z.string().min(1).max(500));

/**
 * 一份正文文件的 frontmatter。
 * - role 缺省:只校验结构(生成 JSON Schema 用),sourceDigest 可有可无;
 * - main:主稿,不得带 sourceDigest;translation:译文,必须带 sourceDigest(主稿全文的 sha256)。
 * - type 给定时 l10n 按该类型声明的结构校验,否则按「短文本字典」校验。
 */
export function frontmatterSchema(options: { role?: FrontmatterRole; type?: GitTypeKey } = {}) {
  const { role, type } = options;
  return z
    .strictObject({
      title: z.string().min(1).max(200),
      description: z.string().min(1).max(500),
      sourceDigest: Sha256.optional(),
      seoTitle: z.string().min(1).max(200).optional(),
      summary: z.string().min(1).max(1000).optional(),
      imageAlt: z.string().min(1).max(500).optional(),
      l10n: GenericL10n.optional(),
    })
    .superRefine((frontmatter, issue) => {
      if (role === 'main' && frontmatter.sourceDigest !== undefined) {
        issue.addIssue({ code: 'custom', path: ['sourceDigest'], message: '主稿不得带 sourceDigest' });
      }
      if (role === 'translation' && frontmatter.sourceDigest === undefined) {
        issue.addIssue({ code: 'custom', path: ['sourceDigest'], message: '译文必须带 sourceDigest' });
      }
      if (type !== undefined && frontmatter.l10n !== undefined) {
        const declared = TYPE_REGISTRY[type].l10n.safeParse(frontmatter.l10n);
        if (!declared.success) {
          for (const inner of declared.error.issues) {
            issue.addIssue({ code: 'custom', path: ['l10n', ...inner.path], message: inner.message });
          }
        }
      }
    });
}

export type Frontmatter = z.infer<ReturnType<typeof frontmatterSchema>>;

// ---- 语言文件 ----

const LocaleFile = z.strictObject({ frontmatter: z.unknown(), body: z.string() });

/**
 * 一个单元的语言文件集合:`{ <语言>: { frontmatter, body } }`,body 是 frontmatter 之后的正文原文。
 *
 * - 有哪些语言 = 有哪些文件;主稿(defaultLocale)文件必须存在,译文可缺;
 * - 正文模式 optional:文件须存在并带完整 frontmatter,正文可为空;required:正文为空即不合法;
 * - 正文模式 generated:仓里没有正文文件,集合必须为空。
 */
export function localeFilesSchema(type: GitTypeKey, ctx: ContractContext) {
  const mode = TYPE_REGISTRY[type].body;
  return z.record(z.string().regex(LOCALE_PATTERN), LocaleFile).superRefine((files, issue) => {
    const locales = Object.keys(files);
    if (mode === 'generated') {
      for (const locale of locales) {
        issue.addIssue({ code: 'custom', path: [locale], message: '正文由描述文件生成的类型不得带正文文件' });
      }
      return;
    }
    if (!Object.hasOwn(files, ctx.defaultLocale)) {
      issue.addIssue({ code: 'custom', path: [ctx.defaultLocale], message: '缺少主稿(defaultLocale 的正文文件)' });
    }
    for (const locale of locales) {
      const file = files[locale];
      if (file === undefined) continue;
      if (!ctx.locales.includes(locale)) {
        issue.addIssue({ code: 'custom', path: [locale], message: '语言不在 site.locales 内' });
        continue;
      }
      const role: FrontmatterRole = locale === ctx.defaultLocale ? 'main' : 'translation';
      const parsed = frontmatterSchema({ role, type }).safeParse(file.frontmatter);
      if (!parsed.success) {
        for (const inner of parsed.error.issues) {
          issue.addIssue({ code: 'custom', path: [locale, 'frontmatter', ...inner.path], message: inner.message });
        }
      }
      if (mode === 'required' && file.body.trim() === '') {
        issue.addIssue({ code: 'custom', path: [locale, 'body'], message: '该类型的正文不得为空' });
      }
    }
  });
}

/** 正文是否为空(只有空白也算空)。 */
export function isEmptyBody(body: string): boolean {
  return body.trim() === '';
}
