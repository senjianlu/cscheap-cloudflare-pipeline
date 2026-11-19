// 使用方配置 site.json 的 schema,以及由它派生出带语言 / 频道 / 参与者上下文的契约的工厂函数。
// 契约里与语言、频道、参与者有关的取值都从这里来,本仓不写死任何使用方的值。
import { z } from 'zod';
import {
  type FrontmatterRole,
  type Item,
  type ItemOf,
  STAGES,
  Stage,
  frontmatterSchema,
  itemObject,
  localeFilesSchema,
} from './envelope.ts';
import { navigationSchema, redirectsSchema, taxonomySchema } from './inputs.ts';
import { ContractError, Hostname, LOCALE_PATTERN, Locale, RelativePath, ShortName } from './primitives.ts';
import { type ContractContext, GIT_TYPE_KEYS, type GitTypeKey, GitTypeKeySchema, SpecKey } from './types.ts';

/**
 * 某个类型的 URL 模式:以 / 开头,每段是小写字面量或占位符 {locale}、{slug}、{id};
 * 必须含 {slug} 或 {id}(否则同类型的单元无法区分)。
 */
export const URL_PATTERN_PATTERN = /^(\/([a-z0-9]+(-[a-z0-9]+)*|\{(locale|slug|id)\}))+$/;
export const UrlPattern = z
  .string()
  .max(200)
  .regex(URL_PATTERN_PATTERN, 'urlPattern 必须以 / 开头,段为小写字面量或 {locale}、{slug}、{id}')
  .refine((pattern) => pattern.includes('{slug}') || pattern.includes('{id}'), 'urlPattern 必须含 {slug} 或 {id}');

const LocaleKey = z.string().regex(LOCALE_PATTERN);

function unique<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

const TypeSettings = z.strictObject({ urlPattern: UrlPattern });

export const SiteConfig = z
  .strictObject({
    /** 来源标识;用于指针行与 R2 清单路径。 */
    source: ShortName,
    locales: z.array(Locale).min(1).max(64).refine(unique, '不得重复').meta({ uniqueItems: true }),
    /** 主稿语言;必须在 locales 内。 */
    defaultLocale: Locale,
    /** 频道名 → 准入的 stage 列表;至少一个频道。 */
    channels: z
      .record(ShortName, z.array(Stage).min(1).refine(unique, '不得重复').meta({ uniqueItems: true }))
      .refine((channels) => Object.keys(channels).length > 0, '至少配置一个频道')
      .meta({ minProperties: 1 }),
    /** workflow[].by 的合法取值。 */
    actors: z.array(ShortName).min(1).max(64).refine(unique, '不得重复').meta({ uniqueItems: true }),
    /** 启用的类型键 → 设置;键必须是注册表里来源为 git 的类型。 */
    types: z
      .partialRecord(GitTypeKeySchema, TypeSettings)
      .refine((types) => Object.keys(types).length > 0, '至少启用一个类型')
      .meta({ minProperties: 1 }),
    /** 允许被内容以 https 绝对地址引用的外部资源域名。 */
    assetHosts: z.array(Hostname).max(64).refine(unique, '不得重复').meta({ uniqueItems: true }).default([]),
    /** 外部描述文件的登记:描述键 → { 语言: 仓内相对路径 }。 */
    specs: z
      .record(
        SpecKey,
        z
          .record(LocaleKey, RelativePath)
          .refine((files) => Object.keys(files).length > 0, '至少登记一种语言的描述文件')
          .meta({ minProperties: 1 }),
      )
      .optional(),
  })
  .superRefine((site, issue) => {
    if (!site.locales.includes(site.defaultLocale)) {
      issue.addIssue({ code: 'custom', path: ['defaultLocale'], message: 'defaultLocale 必须在 locales 内' });
    }
    for (const [key, files] of Object.entries(site.specs ?? {})) {
      for (const locale of Object.keys(files)) {
        if (!site.locales.includes(locale)) {
          issue.addIssue({ code: 'custom', path: ['specs', key, locale], message: '语言不在 locales 内' });
        }
      }
    }
  });
export type SiteConfig = z.infer<typeof SiteConfig>;

/** 随版本写入 releases.site 的渲染相关子集;渲染端从版本读取,不另行维护一份。 */
export const SiteSnapshot = z.strictObject({
  locales: z.array(Locale).min(1),
  defaultLocale: Locale,
  types: z.partialRecord(GitTypeKeySchema, TypeSettings),
  assetHosts: z.array(Hostname),
});
export type SiteSnapshot = z.infer<typeof SiteSnapshot>;

export function toSiteSnapshot(site: SiteConfig): SiteSnapshot {
  return {
    locales: [...site.locales],
    defaultLocale: site.defaultLocale,
    types: { ...site.types },
    assetHosts: [...site.assetHosts],
  };
}

/** 按 urlPattern 生成站内路径。 */
export function buildUrl(pattern: string, parts: { locale: string; slug: string; id: string }): string {
  return pattern.replace(/\{(locale|slug|id)\}/g, (_, key: 'locale' | 'slug' | 'id') => parts[key]);
}

function memberOf(values: readonly string[], message: string) {
  return z.string().refine((value) => values.includes(value), message);
}

export interface Contract {
  readonly site: SiteConfig;
  readonly context: ContractContext;
  /** 启用的类型键。 */
  readonly types: readonly GitTypeKey[];
  /** site.locales 内的语言。 */
  readonly locale: z.ZodType<string>;
  /** site.actors 内的参与者。 */
  readonly actor: z.ZodType<string>;
  /** site.channels 里的频道名。 */
  readonly channel: z.ZodType<string>;
  /** 任一启用类型的 item.json。 */
  readonly item: z.ZodType<Item>;
  /** 指定类型的 item.json;类型未启用时抛错。 */
  itemOf<K extends GitTypeKey>(type: K): z.ZodType<ItemOf<K>>;
  /** 某语言下的 frontmatter:defaultLocale 按主稿规则,其余语言按译文规则;语言不在 locales 内时抛错。 */
  frontmatter(type: GitTypeKey, locale: string): ReturnType<typeof frontmatterSchema>;
  /** 一个单元的语言文件集合。 */
  localeFiles(type: GitTypeKey): ReturnType<typeof localeFilesSchema>;
  readonly taxonomy: ReturnType<typeof taxonomySchema>;
  readonly redirects: ReturnType<typeof redirectsSchema>;
  readonly navigation: ReturnType<typeof navigationSchema>;
  /** 某个 stage 是否准入某个频道。 */
  admits(channel: string, stage: Stage): boolean;
  /** 写入 releases.site 的快照。 */
  snapshot(): SiteSnapshot;
}

/**
 * 由使用方配置生成带上下文的契约。配置不合法时抛 ContractError(code = invalid_site),
 * `issues` 属性里是逐条问题。
 */
export function createContract(input: unknown): Contract {
  const parsed = SiteConfig.safeParse(input);
  if (!parsed.success) {
    const error = new ContractError('invalid_site', 'site.json 不符合契约');
    Object.defineProperty(error, 'issues', { value: parsed.error.issues, enumerable: true });
    throw error;
  }
  const site = parsed.data;
  const context: ContractContext = {
    locales: site.locales,
    defaultLocale: site.defaultLocale,
    actors: site.actors,
    assetHosts: site.assetHosts,
    specKeys: Object.keys(site.specs ?? {}),
  };
  const types = GIT_TYPE_KEYS.filter((key) => Object.hasOwn(site.types, key));
  const objects = types.map((key) => itemObject(key, context));
  const first = objects[0];
  if (first === undefined) throw new ContractError('invalid_site', 'site.json 至少启用一个类型');
  // 判别联合的成员是按注册表逐类型组合出来的,静态类型由 ItemOf 给出(测试核对两者一致)。
  const item = z.discriminatedUnion('type', [first, ...objects.slice(1)]) as unknown as z.ZodType<Item>;

  return {
    site,
    context,
    types,
    locale: memberOf(site.locales, '语言不在 site.locales 内'),
    actor: memberOf(site.actors, '参与者不在 site.actors 内'),
    channel: memberOf(Object.keys(site.channels), '频道不在 site.channels 内'),
    item,
    itemOf<K extends GitTypeKey>(type: K) {
      if (!types.includes(type)) throw new ContractError('type_not_enabled', '该类型未在 site.types 中启用');
      return itemObject(type, context) as unknown as z.ZodType<ItemOf<K>>;
    },
    frontmatter(type, locale) {
      if (!site.locales.includes(locale)) throw new ContractError('locale_not_enabled', '语言不在 site.locales 内');
      const role: FrontmatterRole = locale === site.defaultLocale ? 'main' : 'translation';
      return frontmatterSchema({ role, type });
    },
    localeFiles(type) {
      return localeFilesSchema(type, context);
    },
    taxonomy: taxonomySchema(context),
    redirects: redirectsSchema(context),
    navigation: navigationSchema(context),
    admits(channel, stage) {
      // 频道名可以是 constructor 这类与对象继承属性同名的词,必须先确认是自有属性。
      return Object.hasOwn(site.channels, channel) && (site.channels[channel]?.includes(stage) ?? false);
    },
    snapshot() {
      return toSiteSnapshot(site);
    },
  };
}

/**
 * 生成 JSON Schema 的来源:文件基名 → 不带上下文(只校验格式)的 schema。
 * 取值集合(语言、参与者、外部资源域名、描述键)的校验留在 Zod 侧,不进 JSON Schema。
 */
export function jsonSchemaSources(): Record<string, z.ZodType> {
  const sources: Record<string, z.ZodType> = { site: SiteConfig };
  for (const type of GIT_TYPE_KEYS) sources[type] = itemObject(type);
  sources['frontmatter'] = frontmatterSchema();
  sources['taxonomy'] = taxonomySchema();
  sources['redirects'] = redirectsSchema();
  sources['navigation'] = navigationSchema();
  return sources;
}

export { STAGES };
