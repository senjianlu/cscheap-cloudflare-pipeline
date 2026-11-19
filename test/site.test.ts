// TC-07:site.json 与 createContract 的单测。
import { describe, expect, it } from 'vitest';
import { ContractError, SiteConfig, SiteSnapshot, buildUrl, createContract } from '../contract/index.ts';
import {
  DIGEST_A,
  SITE,
  mainFrontmatter,
  translationFrontmatter,
  validItem,
  withValue,
  without,
} from './fixtures/samples.ts';
import { expectAccepted, expectRejectedAt } from './helpers.ts';

const site = (): Record<string, unknown> => structuredClone(SITE);

describe('site.json:合法配置', () => {
  it('示例配置通过;assetHosts 与 specs 可缺省', () => {
    expectAccepted(SiteConfig, site());
    const minimal = SiteConfig.parse(without(without(site(), 'assetHosts'), 'specs'));
    expect(minimal.assetHosts).toEqual([]);
    expect(minimal.specs).toBeUndefined();
  });

  it('自定义频道名与准入 stage', () => {
    const custom = createContract({
      ...site(),
      channels: { staging: ['draft', 'reviewed', 'published'], live: ['published'], archive: ['retired'] },
    });
    expect(Object.keys(custom.site.channels)).toEqual(['staging', 'live', 'archive']);
    expect(custom.admits('staging', 'draft')).toBe(true);
    expect(custom.admits('live', 'reviewed')).toBe(false);
    expect(custom.admits('live', 'published')).toBe(true);
    expect(custom.admits('archive', 'retired')).toBe(true);
    expect(custom.admits('preview', 'published')).toBe(false);
    expect(custom.channel.safeParse('live').success).toBe(true);
    expect(custom.channel.safeParse('preview').success).toBe(false);
  });

  it('未配置的频道一律不准入,包括与对象继承属性同名的频道名', () => {
    const contract = createContract(site());
    for (const channel of ['constructor', 'valueof', 'tostring', 'hasownproperty', 'missing']) {
      for (const stage of ['draft', 'reviewed', 'published', 'held', 'retired'] as const) {
        expect(contract.admits(channel, stage), `${channel}/${stage}`).toBe(false);
      }
    }
    for (const channel of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty']) {
      expect(() => contract.admits(channel, 'published')).not.toThrow();
      expect(contract.admits(channel, 'published')).toBe(false);
      expect(contract.channel.safeParse(channel).success).toBe(false);
    }
  });

  it('显式配置名为 constructor 的频道:按配置准入', () => {
    const custom = createContract({
      ...site(),
      channels: { constructor: ['reviewed', 'published'], live: ['published'] },
    });
    expect(Object.keys(custom.site.channels).sort()).toEqual(['constructor', 'live']);
    expect(custom.admits('constructor', 'published')).toBe(true);
    expect(custom.admits('constructor', 'reviewed')).toBe(true);
    expect(custom.admits('constructor', 'draft')).toBe(false);
    expect(custom.admits('live', 'reviewed')).toBe(false);
    expect(custom.channel.safeParse('constructor').success).toBe(true);
  });

  it('只启用部分类型时,未启用的类型被拒', () => {
    const partial = createContract({ ...site(), types: { 'docs.page': { urlPattern: '/docs/{slug}' } } });
    expect(partial.types).toEqual(['docs.page']);
    expectAccepted(partial.item, validItem('docs.page'));
    expectRejectedAt(partial.item, validItem('wiki.guide'), ['type']);
    expect(() => partial.itemOf('wiki.guide')).toThrowError(ContractError);
  });

  it('快照只含渲染相关子集', () => {
    const snapshot = createContract(site()).snapshot();
    expect(Object.keys(snapshot).sort()).toEqual(['assetHosts', 'defaultLocale', 'locales', 'types']);
    expectAccepted(SiteSnapshot, snapshot);
    expect(snapshot.types['blog.post']).toEqual({ urlPattern: '/{locale}/blog/{slug}' });
  });

  it('按 urlPattern 生成站内路径', () => {
    expect(buildUrl('/{locale}/blog/{slug}', { locale: 'fr', slug: 'sample', id: 'sample-id' })).toBe(
      '/fr/blog/sample',
    );
  });
});

describe('site.json:非法配置', () => {
  it.each([
    ['defaultLocale 不在 locales', withValue(site(), ['defaultLocale'], 'es'), ['defaultLocale']],
    ['频道为空', withValue(site(), ['channels'], {}), ['channels']],
    ['频道的 stage 列表为空', withValue(site(), ['channels'], { preview: [] }), ['channels', 'preview']],
    ['频道含未知 stage', withValue(site(), ['channels'], { preview: ['approved'] }), ['channels', 'preview', 0]],
    ['频道名非法', withValue(site(), ['channels'], { 'Pre View': ['published'] }), ['channels', 'Pre View']],
    ['types 含未注册类型', withValue(site(), ['types', 'blog.video'], { urlPattern: '/v/{slug}' }), ['types']],
    ['types 含 sync 类型', withValue(site(), ['types', 'item'], { urlPattern: '/items/{id}' }), ['types']],
    ['types 为空', withValue(site(), ['types'], {}), ['types']],
    [
      'urlPattern 不含 slug 或 id',
      withValue(site(), ['types', 'blog.post', 'urlPattern'], '/blog'),
      ['types', 'blog.post', 'urlPattern'],
    ],
    [
      'urlPattern 含未知占位符',
      withValue(site(), ['types', 'blog.post', 'urlPattern'], '/{lang}/{slug}'),
      ['types', 'blog.post', 'urlPattern'],
    ],
    ['assetHosts 含 URL', withValue(site(), ['assetHosts'], ['https://cdn.example.com']), ['assetHosts', 0]],
    ['assetHosts 含路径', withValue(site(), ['assetHosts'], ['cdn.example.com/img']), ['assetHosts', 0]],
    ['assetHosts 含单段主机名', withValue(site(), ['assetHosts'], ['localhost']), ['assetHosts', 0]],
    ['assetHosts 含通配符', withValue(site(), ['assetHosts'], ['*.example.com']), ['assetHosts', 0]],
    [
      'specs 的路径为绝对路径',
      withValue(site(), ['specs'], { 'public-api': { en: '/abs/api.json' } }),
      ['specs', 'public-api', 'en'],
    ],
    [
      'specs 的路径含 ..',
      withValue(site(), ['specs'], { 'public-api': { en: 'a/../../api.json' } }),
      ['specs', 'public-api', 'en'],
    ],
    [
      'specs 的语言不在 locales',
      withValue(site(), ['specs'], { 'public-api': { es: 'specs/api.json' } }),
      ['specs', 'public-api', 'es'],
    ],
    ['locales 为空', withValue(site(), ['locales'], []), ['locales']],
    ['locales 重复', withValue(site(), ['locales'], ['en', 'en']), ['locales']],
    ['locales 含非法标签', withValue(site(), ['locales'], ['en', 'EN_us']), ['locales', 1]],
    ['actors 为空', withValue(site(), ['actors'], []), ['actors']],
    ['source 含大写', withValue(site(), ['source'], 'Example'), ['source']],
    ['未知顶层字段', { ...site(), theme: 'dark' }, []],
  ] as const)('%s 被拒', (_, value, path) => {
    expectRejectedAt(SiteConfig, value, path);
    expect(() => createContract(value)).toThrowError(ContractError);
  });

  it('createContract 抛出的错误带原因码与逐条问题', () => {
    try {
      createContract(withValue(site(), ['channels'], {}));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ContractError);
      expect((error as ContractError).code).toBe('invalid_site');
      expect((error as ContractError & { issues: unknown[] }).issues.length).toBeGreaterThan(0);
    }
  });
});

describe('createContract(site):取值来自配置', () => {
  const contract = createContract(site());

  it('by 不在 actors 被拒;在 actors 内通过', () => {
    expectRejectedAt(contract.item, withValue(validItem('docs.page'), ['workflow', 0, 'by'], 'stranger'), [
      'workflow',
      0,
      'by',
    ]);
    expectAccepted(contract.item, withValue(validItem('docs.page'), ['workflow', 0, 'by'], 'bot'));
    expect(contract.actor.safeParse('stranger').success).toBe(false);
    const other = createContract({ ...site(), actors: ['stranger'] });
    expectAccepted(other.item, {
      ...validItem('docs.page'),
      workflow: [{ stage: 'published', by: 'stranger', at: '2026-01-01T00:00:00Z' }],
    });
  });

  it('语言不在 locales 被拒', () => {
    expect(contract.locale.safeParse('en').success).toBe(true);
    expect(contract.locale.safeParse('es').success).toBe(false);
    expect(() => contract.frontmatter('docs.page', 'es')).toThrowError(ContractError);
    expectRejectedAt(
      contract.localeFiles('docs.page'),
      { en: { frontmatter: mainFrontmatter(), body: 'x' }, es: { frontmatter: translationFrontmatter(), body: 'x' } },
      ['es'],
    );
  });

  it('同一份正文在 defaultLocale 下按主稿规则、在其他语言下按译文规则校验', () => {
    const plain = mainFrontmatter();
    const withDigest = { ...mainFrontmatter(), sourceDigest: DIGEST_A };

    expectAccepted(contract.frontmatter('docs.page', 'en'), plain);
    expectRejectedAt(contract.frontmatter('docs.page', 'fr'), plain, ['sourceDigest']);
    expectRejectedAt(contract.frontmatter('docs.page', 'en'), withDigest, ['sourceDigest']);
    expectAccepted(contract.frontmatter('docs.page', 'fr'), withDigest);

    // 换一份 defaultLocale 不同的配置,同一份 frontmatter 的结论随之对调。
    const swapped = createContract({ ...site(), defaultLocale: 'fr' });
    expectAccepted(swapped.frontmatter('docs.page', 'fr'), plain);
    expectRejectedAt(swapped.frontmatter('docs.page', 'en'), plain, ['sourceDigest']);
    expectAccepted(swapped.frontmatter('docs.page', 'en'), withDigest);
  });

  it('docs.api 的 spec 取值来自 site.specs', () => {
    expectAccepted(contract.item, validItem('docs.api'));
    const noSpecs = createContract(without(site(), 'specs'));
    expectRejectedAt(noSpecs.item, validItem('docs.api'), ['data', 'spec']);
  });
});
