// 内容仓的仓级输入:受控词表、重定向、导航。
// 本文件只定义这三种文件各自的结构;信封里的引用能否在词表中找到、改 slug 是否登记了重定向
// 属于跨文件规则,由「校验」任务执行。
import { z } from 'zod';
import { iconValue } from './envelope.ts';
import { LOCALE_PATTERN, SchemaVersion, SitePath, TermKey, WebUrl } from './primitives.ts';
import { type ContractContext, GlobalRef } from './types.ts';

export const VOCABULARIES = ['authors', 'categories', 'tags'] as const;
export type Vocabulary = (typeof VOCABULARIES)[number];

/**
 * 各语言文本:`{ <语言>: 文本 }`。带上下文时语言必须在 site.locales 内,且 defaultLocale 的文本必填;
 * 不带上下文时只要求至少一项。
 */
export function localizedText(ctx: ContractContext | undefined, maxLength: number) {
  return z
    .record(z.string().regex(LOCALE_PATTERN), z.string().min(1).max(maxLength))
    .superRefine((labels, issue) => {
      const locales = Object.keys(labels);
      if (locales.length === 0) {
        issue.addIssue({ code: 'custom', message: '至少给出一种语言的文本' });
        return;
      }
      if (!ctx) return;
      for (const locale of locales) {
        if (!ctx.locales.includes(locale)) {
          issue.addIssue({ code: 'custom', path: [locale], message: '语言不在 site.locales 内' });
        }
      }
      if (!Object.hasOwn(labels, ctx.defaultLocale)) {
        issue.addIssue({ code: 'custom', path: [ctx.defaultLocale], message: '缺少 defaultLocale 的文本' });
      }
    })
    .meta({ minProperties: 1 });
}

export const MAX_TERMS = 5000;
export const MAX_REDIRECTS = 5000;
export const MAX_NAV_GROUPS = 64;
export const MAX_NAV_PAGES = 500;

function terms<T extends z.ZodType>(term: T) {
  return z
    .record(TermKey, term)
    .refine((value) => Object.keys(value).length <= MAX_TERMS, '词表项过多')
    .meta({ maxProperties: MAX_TERMS });
}

/** `taxonomy/<vocabulary>.json`。`authors` 的项可带 `url`,其余词表的项只有各语言标签。 */
export function taxonomySchema(ctx?: ContractContext) {
  const labels = localizedText(ctx, 120);
  const plainTerm = z.strictObject({ labels });
  const authorTerm = z.strictObject({ labels, url: WebUrl.optional() });
  return z.discriminatedUnion('vocabulary', [
    z.strictObject({ schemaVersion: SchemaVersion, vocabulary: z.literal('authors'), terms: terms(authorTerm) }),
    z.strictObject({ schemaVersion: SchemaVersion, vocabulary: z.literal('categories'), terms: terms(plainTerm) }),
    z.strictObject({ schemaVersion: SchemaVersion, vocabulary: z.literal('tags'), terms: terms(plainTerm) }),
  ]);
}
export type Taxonomy = z.infer<ReturnType<typeof taxonomySchema>>;

export const REDIRECT_STATUSES = [301, 308] as const;

/** `redirects.json`。`locale` 缺省表示对全部语言生效。 */
export function redirectsSchema(ctx?: ContractContext) {
  const redirect = z.strictObject({
    from: SitePath,
    to: SitePath,
    status: z.union([z.literal(301), z.literal(308)]),
    locale: z
      .string()
      .regex(LOCALE_PATTERN)
      .refine((locale) => !ctx || ctx.locales.includes(locale), '语言不在 site.locales 内')
      .optional(),
  });
  return z.strictObject({
    schemaVersion: SchemaVersion,
    redirects: z
      .array(redirect)
      .max(MAX_REDIRECTS)
      .superRefine((redirects, issue) => {
        const seen = new Set<string>();
        redirects.forEach((entry, index) => {
          if (entry.from === entry.to) {
            issue.addIssue({ code: 'custom', path: [index, 'to'], message: '重定向不得指向自身' });
          }
          const key = `${entry.locale ?? '*'}\u0000${entry.from}`;
          if (seen.has(key)) {
            issue.addIssue({ code: 'custom', path: [index, 'from'], message: '同一语言下的 from 不得重复' });
          }
          seen.add(key);
        });
      }),
  });
}
export type Redirects = z.infer<ReturnType<typeof redirectsSchema>>;

/** `navigation.json`(可选文件)。分组图标的取值同信封的 `icon`。 */
export function navigationSchema(ctx?: ContractContext) {
  const group = z.strictObject({
    title: localizedText(ctx, 120),
    icon: iconValue(ctx).optional(),
    pages: z.array(GlobalRef).max(MAX_NAV_PAGES),
  });
  return z.strictObject({
    schemaVersion: SchemaVersion,
    groups: z.array(group).max(MAX_NAV_GROUPS),
  });
}
export type Navigation = z.infer<ReturnType<typeof navigationSchema>>;
