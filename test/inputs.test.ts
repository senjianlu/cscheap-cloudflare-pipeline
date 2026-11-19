// TC-08:仓级输入(词表、重定向、导航)的单测。
import { describe, expect, it } from 'vitest';
import { REDIRECT_ALL_LOCALES, toNavRows, toRedirectRows, toTaxonomyTermRows } from '../contract/index.ts';
import { INPUT_CASES } from './fixtures/cases.ts';
import { DIGEST_A } from './fixtures/samples.ts';
import { contextualSchema, contract, expectCase, expectRejectedAt } from './helpers.ts';

describe('仓级输入:正反例', () => {
  it.each(INPUT_CASES.map((testCase) => [testCase.name, testCase] as const))('%s', (_, testCase) => {
    expectCase(contextualSchema(testCase.schema), testCase);
  });
});

const find = (name: string) => {
  const found = INPUT_CASES.find((testCase) => testCase.name.startsWith(name));
  if (found === undefined) throw new Error(`缺少用例:${name}`);
  return found.value;
};

describe('仓级输入:附加规则', () => {
  it('重定向不得指向自身,同一语言下 from 不得重复', () => {
    expectRejectedAt(contract.redirects, { schemaVersion: 1, redirects: [{ from: '/a', to: '/a', status: 301 }] }, [
      'redirects',
      0,
      'to',
    ]);
    expectRejectedAt(
      contract.redirects,
      {
        schemaVersion: 1,
        redirects: [
          { from: '/a', to: '/b', status: 301 },
          { from: '/a', to: '/c', status: 308 },
        ],
      },
      ['redirects', 1, 'from'],
    );
  });

  it('导航分组的图标沿用信封图标的规则', () => {
    expectRejectedAt(
      contract.navigation,
      { schemaVersion: 1, groups: [{ title: { en: 'Group' }, icon: true, pages: [] }] },
      ['groups', 0, 'icon'],
    );
    expectRejectedAt(contract.navigation, { schemaVersion: 1, groups: [{ title: { fr: 'Groupe' }, pages: [] }] }, [
      'groups',
      0,
      'title',
      'en',
    ]);
  });
});

describe('仓级输入 → 发布行', () => {
  it('词表项映射为 taxonomy_terms 行', () => {
    const rows = toTaxonomyTermRows(DIGEST_A, contract.taxonomy.parse(find('词表:authors')));
    expect(rows).toEqual([
      {
        release_id: DIGEST_A,
        vocabulary: 'authors',
        term: 'alice',
        data: { labels: { en: 'Alice', fr: 'Alice' }, url: 'https://example.com/alice' },
      },
      { release_id: DIGEST_A, vocabulary: 'authors', term: 'bob', data: { labels: { en: 'Bob' } } },
    ]);
  });

  it('locale 缺省的重定向对全部语言生效', () => {
    const rows = toRedirectRows(DIGEST_A, contract.redirects.parse(find('重定向:合法')));
    expect(rows.map((row) => row.locale)).toEqual(['en', REDIRECT_ALL_LOCALES]);
    expect(rows[0]).toMatchObject({ from_path: '/en/blog/old-sample', to_path: '/en/blog/sample', status: 301 });
  });

  it('导航按语言各出一行,标题缺译文时回退到 defaultLocale', () => {
    const navigation = contract.navigation.parse(find('导航:分组带四种图标形态'));
    const rows = toNavRows(DIGEST_A, navigation, contract.site, (source) => `/assets/${DIGEST_A}/${source}`);
    expect(rows.map((row) => row.locale)).toEqual(['en', 'fr']);
    expect(rows[1]?.tree.map((group) => group.title)).toEqual([
      'Par défaut',
      'Hidden icon',
      'Named icon',
      'Image icon',
    ]);
    expect(rows[0]?.tree.map((group) => group.icon)).toEqual([
      undefined,
      false,
      'book-open',
      {
        image: 'https://cdn.example.com/nav.png',
        imageDark: `/assets/${DIGEST_A}/nav-dark.png`,
        width: 24,
        height: 24,
      },
    ]);
  });
});
