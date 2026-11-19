// TC-03:类型注册表与各类型 data 的单测。
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  GIT_TYPE_KEYS,
  GLOBAL_REF_PATTERN,
  GlobalRef,
  type Item,
  type ItemOf,
  SYNC_TYPE_KEYS,
  TYPE_REGISTRY,
  bodyModeOf,
  parseGlobalRef,
} from '../contract/index.ts';
import { TYPE_CASES } from './fixtures/cases.ts';
import { validItem, withValue } from './fixtures/samples.ts';
import { contextualSchema, contract, expectAccepted, expectCase, expectRejectedAt } from './helpers.ts';

describe('类型:正反例', () => {
  it.each(TYPE_CASES.map((testCase) => [testCase.name, testCase] as const))('%s', (_, testCase) => {
    expectCase(contextualSchema(testCase.schema), testCase);
  });
});

describe('注册表', () => {
  it('登记了方案列出的类型、来源与正文模式', () => {
    const summary = Object.fromEntries(
      Object.entries(TYPE_REGISTRY).map(([key, def]) => [key, `${def.source}/${def.body}`]),
    );
    expect(summary).toEqual({
      'blog.post': 'git/required',
      'wiki.site': 'git/optional',
      'wiki.event': 'git/required',
      'wiki.guide': 'git/required',
      'docs.page': 'git/required',
      'docs.api': 'git/generated',
      item: 'sync/none',
    });
    expect(GIT_TYPE_KEYS).toHaveLength(6);
    expect(SYNC_TYPE_KEYS).toEqual(['item']);
    expect(bodyModeOf('docs.api')).toBe('generated');
  });

  it('只有 blog.post 提升了必填字段', () => {
    expect(TYPE_REGISTRY['blog.post'].promote).toEqual(['authors', 'seo.ogImage']);
    for (const key of GIT_TYPE_KEYS.filter((type) => type !== 'blog.post')) {
      expect(TYPE_REGISTRY[key].promote).toEqual([]);
    }
  });

  it('未启用的类型不能取 schema,也不被联合接受', () => {
    expect(() => contract.itemOf('item' as never)).toThrowError(/未在 site.types 中启用/);
  });
});

describe('静态类型与 schema 一致(由 tsc 判定)', () => {
  it('提升必填的字段在类型里也是必填', () => {
    expectTypeOf<ItemOf<'blog.post'>['authors']>().toEqualTypeOf<string[]>();
    expectTypeOf<ItemOf<'blog.post'>['seo']['ogImage']>().toEqualTypeOf<string>();
    expectTypeOf<ItemOf<'blog.post'>['seo']['canonical']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<ItemOf<'wiki.guide'>['authors']>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<NonNullable<ItemOf<'wiki.guide'>['seo']>['ogImage']>().toEqualTypeOf<string | undefined>();
  });

  it('data 的类型随类型键变化', () => {
    expectTypeOf<ItemOf<'wiki.site'>['data']['url']>().toEqualTypeOf<string>();
    expectTypeOf<ItemOf<'docs.page'>['data']['kind']>().toEqualTypeOf<
      'tutorial' | 'how-to' | 'reference' | 'explanation'
    >();
    expectTypeOf<ItemOf<'docs.api'>['data']['operationId']>().toEqualTypeOf<string>();
    expectTypeOf<Item['type']>().toEqualTypeOf<
      'blog.post' | 'wiki.site' | 'wiki.event' | 'wiki.guide' | 'docs.page' | 'docs.api'
    >();
  });

  it('解析结果在运行时与静态类型相符', () => {
    const post = contract.itemOf('blog.post').parse(validItem('blog.post'));
    expect(post.authors).toEqual(['alice']);
    expect(post.seo.ogImage).toBe('og.png');
    const guide = contract.itemOf('wiki.guide').parse(validItem('wiki.guide'));
    expect(guide.authors).toBeUndefined();
    expect(guide.data.guideKind).toBe('glossary');
  });
});

describe('各类型字段的同字段正反值', () => {
  it.each([
    ['https://example.com/', true],
    ['http://example.com/path?q=1', true],
    ['javascript:alert(1)', false],
    ['data:text/html,x', false],
    ['//example.com/', false],
    ['https://user:secret@example.com/', false],
    ['/relative', false],
  ])('wiki.site 的 url %s → %s', (url, ok) => {
    const item = withValue(validItem('wiki.site'), ['data', 'url'], url);
    if (ok) expectAccepted(contract.item, item);
    else expectRejectedAt(contract.item, item, ['data', 'url']);
  });

  it.each([
    ['2026-01-01', true],
    ['2026-02-29', false],
    ['2026-1-1', false],
    ['2026-01-01T00:00:00Z', false],
  ])('wiki.event 的 startDate %s → %s', (date, ok) => {
    const item = withValue(validItem('wiki.event'), ['data', 'startDate'], date);
    if (ok) expectAccepted(contract.item, item);
    else expectRejectedAt(contract.item, item, ['data', 'startDate']);
  });

  it('blog.post 的 heroImage:相对路径与白名单域名通过,穿越与非白名单域名被拒', () => {
    const withHero = (value: string) => withValue(validItem('blog.post'), ['data', 'heroImage'], value);
    expectAccepted(contract.item, withHero('images/hero.webp'));
    expectAccepted(contract.item, withHero('https://cdn.example.com/hero.webp'));
    expectRejectedAt(contract.item, withHero('../hero.webp'), ['data', 'heroImage']);
    expectRejectedAt(contract.item, withHero('https://other.example.org/hero.webp'), ['data', 'heroImage']);
  });
});

describe('全局引用', () => {
  it.each([
    'blog.post:sample',
    'wiki.site:example-market',
    'docs.api:list_markets.v2',
    'item:skins/Example-Item_1',
    'item:skins/Example%20Item%7C1',
  ])('%s 合法', (ref) => {
    expect(GlobalRef.safeParse(ref).success).toBe(true);
    expect(parseGlobalRef(ref)).toBeDefined();
  });

  it.each([
    'sample',
    'blog.video:sample',
    'blog.post:',
    'blog.post:Sample',
    'blog.post:../x',
    'item:Example',
    'item:skins/',
    'item:skins/a b',
    'item:skins/a%2',
    ' blog.post:sample',
  ])('%s 非法', (ref) => {
    expect(GLOBAL_REF_PATTERN.test(ref)).toBe(false);
    expect(parseGlobalRef(ref)).toBeUndefined();
  });

  it('拆分出类型与键', () => {
    expect(parseGlobalRef('item:skins/Example-Item_1')).toEqual({ type: 'item', key: 'skins/Example-Item_1' });
    expect(parseGlobalRef('docs.page:sample')).toEqual({ type: 'docs.page', key: 'sample' });
  });
});
