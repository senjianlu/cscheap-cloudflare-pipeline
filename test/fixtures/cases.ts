// 契约的正反例。同一批样本既驱动 Zod 单测(TC-02、TC-03、TC-08),也驱动生成的 JSON Schema 的语义检查(TC-09)。
//
// structural = true:约束是结构性的(必填、未知字段、枚举、格式正则),生成的 JSON Schema 必须给出与 Zod 相同的结论。
// structural = false:JSON Schema 表达不了的规则(跨字段、取值集合来自 site.json、日历有效性),只由 Zod 判定。
import { DIGEST_A, SITE, fullItem, validItem, withValue, without, workflow } from './samples.ts';

export interface Case {
  /** 用例名。 */
  readonly name: string;
  /** 对应 schemas/<schema>.schema.json 的基名。 */
  readonly schema: string;
  readonly value: unknown;
  readonly valid: boolean;
  /** 非法样本的错误应指向的字段路径。 */
  readonly path?: readonly (string | number)[];
  readonly structural: boolean;
}

const post = () => validItem('blog.post');

function backwards(): unknown {
  const steps = workflow();
  return withValue(post(), ['workflow'], [steps[0], { ...steps[2] }, { ...steps[1], stage: 'published' }]);
}

// ---- TC-02:信封 ----

export const ENVELOPE_CASES: Case[] = [
  { name: 'blog.post 最小合法样本', schema: 'blog.post', value: post(), valid: true, structural: true },
  { name: 'wiki.site 最小合法样本', schema: 'wiki.site', value: validItem('wiki.site'), valid: true, structural: true },
  {
    name: 'wiki.event 最小合法样本',
    schema: 'wiki.event',
    value: validItem('wiki.event'),
    valid: true,
    structural: true,
  },
  {
    name: 'wiki.guide 最小合法样本',
    schema: 'wiki.guide',
    value: validItem('wiki.guide'),
    valid: true,
    structural: true,
  },
  { name: 'docs.page 最小合法样本', schema: 'docs.page', value: validItem('docs.page'), valid: true, structural: true },
  { name: 'docs.api 最小合法样本', schema: 'docs.api', value: validItem('docs.api'), valid: true, structural: true },
  { name: '带全部可选字段', schema: 'blog.post', value: fullItem('blog.post'), valid: true, structural: true },
  {
    name: '带全部可选字段(wiki.site)',
    schema: 'wiki.site',
    value: fullItem('wiki.site'),
    valid: true,
    structural: true,
  },

  ...(['schemaVersion', 'type', 'id', 'slug', 'stage', 'workflow', 'data'] as const).map((field): Case => ({
    name: `缺必填 ${field}`,
    schema: 'blog.post',
    value: without(post(), field),
    valid: false,
    path: [field],
    structural: true,
  })),
  {
    name: '顶层未知字段',
    schema: 'blog.post',
    value: { ...post(), reviewer: 'alice' },
    valid: false,
    path: [],
    structural: true,
  },
  {
    name: 'seo 内未知字段',
    schema: 'blog.post',
    value: withValue(post(), ['seo', 'keywords'], 'a,b'),
    valid: false,
    path: ['seo'],
    structural: true,
  },
  {
    name: 'workflow 项内未知字段',
    schema: 'blog.post',
    value: withValue(post(), ['workflow', 0, 'reason'], 'x'),
    valid: false,
    path: ['workflow', 0],
    structural: true,
  },
  {
    name: 'workflow 为空',
    schema: 'blog.post',
    value: withValue(post(), ['workflow'], []),
    valid: false,
    path: ['workflow'],
    structural: true,
  },
  {
    name: 'workflow 时间倒退',
    schema: 'blog.post',
    value: backwards(),
    valid: false,
    path: ['workflow', 2, 'at'],
    structural: false,
  },
  {
    name: 'workflow 末项 stage 与顶层不符',
    schema: 'blog.post',
    value: withValue(post(), ['stage'], 'held'),
    valid: false,
    path: ['workflow', 2, 'stage'],
    structural: false,
  },
  {
    name: '非 UTC 时间(带时区偏移)',
    schema: 'blog.post',
    value: withValue(post(), ['workflow', 0, 'at'], '2026-01-01T08:00:00+08:00'),
    valid: false,
    path: ['workflow', 0, 'at'],
    structural: true,
  },
  {
    name: '时间缺少时区',
    schema: 'blog.post',
    value: withValue(post(), ['publishedAt'], '2026-01-03T00:00:00'),
    valid: false,
    path: ['publishedAt'],
    structural: true,
  },
  {
    name: '日历上不存在的日期',
    schema: 'blog.post',
    value: withValue(post(), ['updatedAt'], '2026-02-30T00:00:00Z'),
    valid: false,
    path: ['updatedAt'],
    structural: false,
  },
  {
    name: 'schemaVersion 不等于契约版本',
    schema: 'blog.post',
    value: withValue(post(), ['schemaVersion'], 2),
    valid: false,
    path: ['schemaVersion'],
    structural: true,
  },
  {
    name: '未知 stage',
    schema: 'blog.post',
    value: withValue(post(), ['stage'], 'archived'),
    valid: false,
    path: ['stage'],
    structural: true,
  },
  {
    name: 'slug 含大写',
    schema: 'blog.post',
    value: withValue(post(), ['slug'], 'Sample'),
    valid: false,
    path: ['slug'],
    structural: true,
  },
  {
    name: 'id 含路径分隔符',
    schema: 'blog.post',
    value: withValue(post(), ['id'], '../sample'),
    valid: false,
    path: ['id'],
    structural: true,
  },
  {
    name: 'refs 的 target 不是全局引用',
    schema: 'blog.post',
    value: withValue(post(), ['refs'], [{ rel: 'about', target: 'example-market' }]),
    valid: false,
    path: ['refs', 0, 'target'],
    structural: true,
  },
  {
    name: 'refs 的 rel 不在取值内',
    schema: 'blog.post',
    value: withValue(post(), ['refs'], [{ rel: 'cites', target: 'wiki.site:example-market' }]),
    valid: false,
    path: ['refs', 0, 'rel'],
    structural: true,
  },
  {
    name: 'sources 的 url 协议非法',
    schema: 'blog.post',
    value: withValue(post(), ['sources'], [{ kind: 'url', url: 'ftp://example.com/file' }]),
    valid: false,
    path: ['sources', 0, 'url'],
    structural: true,
  },
  {
    name: 'tags 重复',
    schema: 'blog.post',
    value: withValue(post(), ['tags'], ['guide', 'guide']),
    valid: false,
    path: ['tags'],
    structural: true,
  },
];

// ---- TC-03:类型 ----

export const TYPE_CASES: Case[] = [
  {
    name: 'blog.post 缺 authors',
    schema: 'blog.post',
    value: without(post(), 'authors'),
    valid: false,
    path: ['authors'],
    structural: true,
  },
  {
    name: 'blog.post 的 authors 为空数组',
    schema: 'blog.post',
    value: withValue(post(), ['authors'], []),
    valid: false,
    path: ['authors'],
    structural: true,
  },
  {
    name: 'blog.post 缺 seo',
    schema: 'blog.post',
    value: without(post(), 'seo'),
    valid: false,
    path: ['seo'],
    structural: true,
  },
  {
    name: 'blog.post 缺 seo.ogImage',
    schema: 'blog.post',
    value: withValue(post(), ['seo'], { noindex: false }),
    valid: false,
    path: ['seo', 'ogImage'],
    structural: true,
  },
  {
    name: 'blog.post 带 authors 与 seo.ogImage',
    schema: 'blog.post',
    value: withValue(post(), ['data'], { series: 'market-basics', heroImage: 'hero.webp' }),
    valid: true,
    structural: true,
  },
  {
    name: '其他类型不要求 authors 与 seo',
    schema: 'wiki.guide',
    value: validItem('wiki.guide'),
    valid: true,
    structural: true,
  },
  {
    name: 'wiki.event 缺 startDate',
    schema: 'wiki.event',
    value: without(validItem('wiki.event'), 'data', 'startDate'),
    valid: false,
    path: ['data', 'startDate'],
    structural: true,
  },
  {
    name: 'wiki.event 带 startDate 与可选字段',
    schema: 'wiki.event',
    value: withValue(validItem('wiki.event'), ['data'], {
      eventKind: 'tournament',
      startDate: '2026-03-01',
      endDate: '2026-03-08',
      datePrecision: 'day',
      officialUrl: 'https://example.org/event',
      location: { name: 'Example Arena', address: '1 Example Street' },
      organizer: 'Example Org',
    }),
    valid: true,
    structural: true,
  },
  {
    name: 'wiki.event 的 endDate 早于 startDate',
    schema: 'wiki.event',
    value: withValue(validItem('wiki.event'), ['data', 'endDate'], '2025-12-31'),
    valid: false,
    path: ['data', 'endDate'],
    structural: false,
  },
  {
    name: 'wiki.site 的 url 为 javascript:',
    schema: 'wiki.site',
    value: withValue(validItem('wiki.site'), ['data', 'url'], 'javascript:alert(1)'),
    valid: false,
    path: ['data', 'url'],
    structural: true,
  },
  {
    name: 'wiki.site 的 url 为 https',
    schema: 'wiki.site',
    value: withValue(validItem('wiki.site'), ['data'], {
      name: 'Example Market',
      url: 'https://example.com/',
      code: 'example-market',
      affUrl: 'https://example.com/?ref=sample',
      featured: true,
      order: 3,
      risk: 'low',
      rating: {
        provider: 'Example Reviews',
        url: 'https://example.org/reviews/example-market',
        score: 4.5,
        reviews: 120,
        ratedAt: '2026-01-01T00:00:00Z',
      },
      marketCode: 'example',
      foundedYear: 2015,
      sameAs: ['https://example.org/example-market'],
      logo: 'logo.png',
    }),
    valid: true,
    structural: true,
  },
  {
    name: 'wiki.site 缺 code',
    schema: 'wiki.site',
    value: without(validItem('wiki.site'), 'data', 'code'),
    valid: false,
    path: ['data', 'code'],
    structural: true,
  },
  {
    name: 'wiki.site 的 data 含未知字段',
    schema: 'wiki.site',
    value: withValue(validItem('wiki.site'), ['data', 'trustScore'], 9),
    valid: false,
    path: ['data'],
    structural: true,
  },
  {
    name: '未注册的 type',
    schema: 'blog.post',
    value: withValue(post(), ['type'], 'blog.unregistered'),
    valid: false,
    path: ['type'],
    structural: true,
  },
  {
    name: '同步类型不能作为 item.json 的 type',
    schema: 'blog.post',
    value: withValue(post(), ['type'], 'item'),
    valid: false,
    path: ['type'],
    structural: true,
  },
  {
    name: 'docs.page 的 kind 不在取值内',
    schema: 'docs.page',
    value: withValue(validItem('docs.page'), ['data', 'kind'], 'faq'),
    valid: false,
    path: ['data', 'kind'],
    structural: true,
  },
  {
    name: 'docs.api 的 spec 指向 site.specs 中存在的键',
    schema: 'docs.api',
    value: withValue(validItem('docs.api'), ['data', 'deprecated'], true),
    valid: true,
    structural: true,
  },
  {
    name: 'docs.api 缺 spec',
    schema: 'docs.api',
    value: without(validItem('docs.api'), 'data', 'spec'),
    valid: false,
    path: ['data', 'spec'],
    structural: true,
  },
  {
    name: 'docs.api 缺 operationId',
    schema: 'docs.api',
    value: without(validItem('docs.api'), 'data', 'operationId'),
    valid: false,
    path: ['data', 'operationId'],
    structural: true,
  },
  {
    name: 'docs.api 的 spec 不在 site.specs',
    schema: 'docs.api',
    value: withValue(validItem('docs.api'), ['data', 'spec'], 'partner-api'),
    valid: false,
    path: ['data', 'spec'],
    structural: false,
  },
  {
    name: 'site.specs 的描述路径含 ..',
    schema: 'site',
    value: withValue({ ...SITE }, ['specs'], { 'public-api': { en: 'specs/../secrets.json' } }),
    valid: false,
    path: ['specs', 'public-api', 'en'],
    structural: true,
  },
  {
    name: 'site.specs 的描述路径为绝对路径',
    schema: 'site',
    value: withValue({ ...SITE }, ['specs'], { 'public-api': { en: '/etc/public-api.json' } }),
    valid: false,
    path: ['specs', 'public-api', 'en'],
    structural: true,
  },
  { name: 'site.specs 的描述路径为仓内相对路径', schema: 'site', value: { ...SITE }, valid: true, structural: true },
];

// ---- TC-08:仓级输入 ----

const authors = () => ({
  schemaVersion: 1,
  vocabulary: 'authors',
  terms: {
    alice: { labels: { en: 'Alice', fr: 'Alice' }, url: 'https://example.com/alice' },
    bob: { labels: { en: 'Bob' } },
  },
});

const tags = () => ({
  schemaVersion: 1,
  vocabulary: 'tags',
  terms: { guide: { labels: { en: 'Guide', fr: 'Guide' } }, market: { labels: { en: 'Market' } } },
});

const redirects = () => ({
  schemaVersion: 1,
  redirects: [
    { from: '/en/blog/old-sample', to: '/en/blog/sample', status: 301, locale: 'en' },
    { from: '/legacy', to: '/en/blog/sample', status: 308 },
  ],
});

const navigation = () => ({
  schemaVersion: 1,
  groups: [
    { title: { en: 'Default icon', fr: 'Par défaut' }, pages: ['docs.page:sample'] },
    { title: { en: 'Hidden icon' }, icon: false, pages: ['docs.page:sample', 'docs.api:list-markets'] },
    { title: { en: 'Named icon' }, icon: 'book-open', pages: [] },
    {
      title: { en: 'Image icon' },
      icon: { image: 'https://cdn.example.com/nav.png', imageDark: 'nav-dark.png', width: 24, height: 24 },
      pages: ['wiki.site:example-market'],
    },
  ],
});

export const INPUT_CASES: Case[] = [
  { name: '词表:authors(项可带 url)', schema: 'taxonomy', value: authors(), valid: true, structural: true },
  { name: '词表:tags', schema: 'taxonomy', value: tags(), valid: true, structural: true },
  {
    name: '词表:缺 defaultLocale 的标签',
    schema: 'taxonomy',
    value: withValue(tags(), ['terms', 'market', 'labels'], { fr: 'Marché' }),
    valid: false,
    path: ['terms', 'market', 'labels', 'en'],
    structural: false,
  },
  {
    name: '词表:标签为空对象',
    schema: 'taxonomy',
    value: withValue(tags(), ['terms', 'market', 'labels'], {}),
    valid: false,
    path: ['terms', 'market', 'labels'],
    structural: true,
  },
  {
    name: '词表:未知 vocabulary',
    schema: 'taxonomy',
    value: withValue(tags(), ['vocabulary'], 'series'),
    valid: false,
    path: ['vocabulary'],
    structural: true,
  },
  {
    name: '词表:非 authors 的项不得带 url',
    schema: 'taxonomy',
    value: withValue(tags(), ['terms', 'guide', 'url'], 'https://example.com/guide'),
    valid: false,
    path: ['terms', 'guide'],
    structural: true,
  },
  {
    name: '词表:标签的语言标签不合法',
    schema: 'taxonomy',
    value: withValue(tags(), ['terms', 'guide', 'labels'], { en: 'Guide', EN_us: 'Guide' }),
    valid: false,
    path: ['terms', 'guide', 'labels', 'EN_us'],
    structural: true,
  },
  { name: '重定向:合法', schema: 'redirects', value: redirects(), valid: true, structural: true },
  {
    name: '重定向:非法状态码',
    schema: 'redirects',
    value: withValue(redirects(), ['redirects', 0, 'status'], 302),
    valid: false,
    path: ['redirects', 0, 'status'],
    structural: true,
  },
  {
    name: '重定向:from 不是站内路径',
    schema: 'redirects',
    value: withValue(redirects(), ['redirects', 0, 'from'], 'https://example.com/old'),
    valid: false,
    path: ['redirects', 0, 'from'],
    structural: true,
  },
  {
    name: '重定向:to 为协议相对地址',
    schema: 'redirects',
    value: withValue(redirects(), ['redirects', 1, 'to'], '//example.org/x'),
    valid: false,
    path: ['redirects', 1, 'to'],
    structural: true,
  },
  {
    name: '重定向:from 含路径穿越',
    schema: 'redirects',
    value: withValue(redirects(), ['redirects', 0, 'from'], '/en/../admin'),
    valid: false,
    path: ['redirects', 0, 'from'],
    structural: false,
  },
  {
    name: '重定向:语言不在 site.locales',
    schema: 'redirects',
    value: withValue(redirects(), ['redirects', 0, 'locale'], 'xx'),
    valid: false,
    path: ['redirects', 0, 'locale'],
    structural: false,
  },
  { name: '导航:分组带四种图标形态', schema: 'navigation', value: navigation(), valid: true, structural: true },
  {
    name: '导航:pages 不是全局引用格式',
    schema: 'navigation',
    value: withValue(navigation(), ['groups', 0, 'pages'], ['docs/sample']),
    valid: false,
    path: ['groups', 0, 'pages', 0],
    structural: true,
  },
  {
    name: '导航:pages 的类型未登记',
    schema: 'navigation',
    value: withValue(navigation(), ['groups', 0, 'pages'], ['docs.unregistered:sample']),
    valid: false,
    path: ['groups', 0, 'pages', 0],
    structural: true,
  },
  {
    name: '导航:缺 title',
    schema: 'navigation',
    value: without(navigation(), 'groups', '0', 'title'),
    valid: false,
    path: ['groups', 0, 'title'],
    structural: true,
  },
];

// ---- frontmatter 的结构性样本(TC-09 一并核对) ----

export const FRONTMATTER_CASES: Case[] = [
  {
    name: 'frontmatter:只有必填',
    schema: 'frontmatter',
    value: { title: 'Sample title', description: 'Sample description.' },
    valid: true,
    structural: true,
  },
  {
    name: 'frontmatter:带全部可选字段',
    schema: 'frontmatter',
    value: {
      title: 'Titre',
      description: 'Description.',
      sourceDigest: DIGEST_A,
      seoTitle: 'Titre SEO',
      summary: 'Résumé.',
      imageAlt: 'Texte alternatif',
      l10n: {},
    },
    valid: true,
    structural: true,
  },
  {
    name: 'frontmatter:缺 title',
    schema: 'frontmatter',
    value: { description: 'Sample description.' },
    valid: false,
    path: ['title'],
    structural: true,
  },
  {
    name: 'frontmatter:缺 description',
    schema: 'frontmatter',
    value: { title: 'Sample title' },
    valid: false,
    path: ['description'],
    structural: true,
  },
  {
    name: 'frontmatter:未知字段',
    schema: 'frontmatter',
    value: { title: 'Sample title', description: 'Sample description.', draft: true },
    valid: false,
    path: [],
    structural: true,
  },
  {
    name: 'frontmatter:sourceDigest 不是 sha256',
    schema: 'frontmatter',
    value: { title: 'Titre', description: 'Description.', sourceDigest: 'abc' },
    valid: false,
    path: ['sourceDigest'],
    structural: true,
  },
];

export const ALL_CASES: Case[] = [...ENVELOPE_CASES, ...TYPE_CASES, ...INPUT_CASES, ...FRONTMATTER_CASES];
