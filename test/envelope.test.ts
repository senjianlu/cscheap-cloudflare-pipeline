// TC-02:信封单测 + 语言文件规则。
import { describe, expect, it } from 'vitest';
import {
  Locale,
  TYPE_REGISTRY,
  UtcDateTime,
  compareUtc,
  firstPublishedAt,
  frontmatterSchema,
  normalizeUtc,
  toEntryLocaleRow,
} from '../contract/index.ts';
import { ENVELOPE_CASES, FRONTMATTER_CASES } from './fixtures/cases.ts';
import {
  DIGEST_A,
  DIGEST_B,
  GIT_TYPES,
  mainFrontmatter,
  translationFrontmatter,
  validItem,
  workflow,
} from './fixtures/samples.ts';
import { contextualSchema, contract, expectAccepted, expectCase, expectRejectedAt } from './helpers.ts';

describe('信封:每个 Git 类型一份合法样本', () => {
  it.each(GIT_TYPES)('%s 通过', (type) => {
    expectAccepted(contract.item, validItem(type));
    expectAccepted(contract.itemOf(type), validItem(type));
  });

  it('注册表里的每个 Git 类型都有样本', () => {
    const registered = Object.entries(TYPE_REGISTRY)
      .filter(([, def]) => def.source === 'git')
      .map(([key]) => key);
    expect([...GIT_TYPES].sort()).toEqual(registered.sort());
  });
});

describe('信封:正反例', () => {
  it.each(ENVELOPE_CASES.map((testCase) => [testCase.name, testCase] as const))('%s', (_, testCase) => {
    expectCase(contextualSchema(testCase.schema), testCase);
  });
});

describe('时间与语言标签', () => {
  it.each(['2026-01-01T00:00:00Z', '2026-12-31T23:59:59.123Z'])('UTC 时间 %s 通过', (value) => {
    expect(UtcDateTime.safeParse(value).success).toBe(true);
  });

  it.each([
    '2026-01-01T08:00:00+08:00',
    '2026-01-01T00:00:00-00:00',
    '2026-01-01T00:00:00',
    '2026-01-01 00:00:00Z',
    '2026-01-01t00:00:00z',
    '2026-13-01T00:00:00Z',
    '2026-02-30T00:00:00Z',
    '2026-01-01',
  ])('非 UTC 或非法时间 %s 被拒', (value) => {
    expect(UtcDateTime.safeParse(value).success).toBe(false);
  });

  it.each(['en', 'fr', 'fr-CA', 'es-419', 'sr-Latn-RS'])('语言标签 %s 通过', (value) => {
    expect(Locale.safeParse(value).success).toBe(true);
  });

  it.each(['EN', 'en_US', 'en-us', 'english', 'e', '', 'en-', 'en--US', '../en'])('非法语言标签 %s 被拒', (value) => {
    expect(Locale.safeParse(value).success).toBe(false);
  });

  it('workflow 时间相等或小数位数不同不算倒退', () => {
    const steps = workflow();
    const item = {
      ...validItem('docs.page'),
      workflow: [
        { ...steps[0], at: '2026-01-01T00:00:00.5Z' },
        { ...steps[1], at: '2026-01-01T00:00:00.50Z' },
        { ...steps[2], at: '2026-01-01T00:00:01Z' },
      ],
    };
    expectAccepted(contract.item, item);
  });

  const withTimes = (...times: string[]) => {
    const steps = workflow();
    return {
      ...validItem('docs.page'),
      workflow: times.map((at, index) => ({ ...steps[Math.min(index, 2)], stage: 'published', at })),
    };
  };

  it.each([
    ['九位小数内的倒退', ['2026-01-01T00:00:00.0009Z', '2026-01-01T00:00:00.0001Z'], 1],
    ['同一毫秒内的倒退(第四位小数)', ['2026-01-01T00:00:00.1235Z', '2026-01-01T00:00:00.1234Z'], 1],
    ['同一毫秒内的倒退(第九位小数)', ['2026-01-01T00:00:00.000000002Z', '2026-01-01T00:00:00.000000001Z'], 1],
    ['不同小数位数之间的倒退', ['2026-01-01T00:00:00.5Z', '2026-01-01T00:00:00.49999Z'], 1],
    ['有小数退回到无小数', ['2026-01-01T00:00:00.000001Z', '2026-01-01T00:00:00Z'], 1],
    [
      '中间一项倒退后再前进',
      ['2026-01-01T00:00:00.0002Z', '2026-01-01T00:00:00.0001Z', '2026-01-01T00:00:00.0003Z'],
      1,
    ],
  ] as const)('workflow %s被拒,错误指向倒退的那一项', (_, times, index) => {
    expectRejectedAt(contract.item, withTimes(...times), ['workflow', index, 'at']);
  });

  it.each([
    [
      '同一时刻的不同写法',
      ['2026-01-01T00:00:00Z', '2026-01-01T00:00:00.0Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000000000Z'],
    ],
    [
      '同一时刻的不同写法(带小数)',
      ['2026-01-01T00:00:00.5Z', '2026-01-01T00:00:00.500Z', '2026-01-01T00:00:00.50000Z'],
    ],
    ['同一毫秒内前进', ['2026-01-01T00:00:00.0001Z', '2026-01-01T00:00:00.0009Z', '2026-01-01T00:00:00.000900001Z']],
    ['无小数到有小数', ['2026-01-01T00:00:00Z', '2026-01-01T00:00:00.000000001Z']],
  ] as const)('workflow %s通过', (_, times) => {
    expectAccepted(contract.item, withTimes(...times));
  });

  it('时间比较与规范化按九位小数的完整精度', () => {
    expect(normalizeUtc('2026-01-01T00:00:00Z')).toBe('2026-01-01T00:00:00.000000000Z');
    expect(normalizeUtc('2026-01-01T00:00:00.5Z')).toBe('2026-01-01T00:00:00.500000000Z');
    expect(normalizeUtc('2026-01-01T00:00:00.123456789Z')).toBe('2026-01-01T00:00:00.123456789Z');
    expect(normalizeUtc('2026-01-01T08:00:00+08:00')).toBeUndefined();
    expect(compareUtc('2026-01-01T00:00:00.0009Z', '2026-01-01T00:00:00.0001Z')).toBe(1);
    expect(compareUtc('2026-01-01T00:00:00.0001Z', '2026-01-01T00:00:00.0009Z')).toBe(-1);
    expect(compareUtc('2026-01-01T00:00:00Z', '2026-01-01T00:00:00.000Z')).toBe(0);
    expect(compareUtc('2026-01-01T00:00:00Z', 'not a time')).toBeUndefined();
  });

  it('publishedAt 缺省时取首次进入 published 的时间', () => {
    expect(firstPublishedAt(workflow() as { stage: string; at: string }[])).toBe('2026-01-03T00:00:00Z');
    expect(firstPublishedAt([{ stage: 'draft', at: '2026-01-01T00:00:00Z' }])).toBeUndefined();
  });
});

describe('frontmatter:主稿与译文', () => {
  const main = contract.frontmatter('wiki.site', 'en');
  const translation = contract.frontmatter('wiki.site', 'fr');

  it.each(
    FRONTMATTER_CASES.filter((testCase) => !testCase.valid).map((testCase) => [testCase.name, testCase] as const),
  )('%s', (_, testCase) => {
    expectCase(main, testCase);
    expectCase(translation, testCase);
  });

  it('主稿不带 sourceDigest 通过,译文带 sourceDigest 通过', () => {
    expectAccepted(main, mainFrontmatter());
    expectAccepted(translation, translationFrontmatter());
  });

  it('译文缺 sourceDigest 被拒,错误指向 sourceDigest', () => {
    expectRejectedAt(translation, mainFrontmatter(), ['sourceDigest']);
  });

  it('主稿带 sourceDigest 被拒,错误指向 sourceDigest', () => {
    expectRejectedAt(main, { ...mainFrontmatter(), sourceDigest: DIGEST_A }, ['sourceDigest']);
  });

  it('l10n 按类型声明的结构校验:首版没有类型声明键,任何键都被拒', () => {
    for (const type of GIT_TYPES) {
      if (type === 'docs.api') continue;
      const schema = contract.frontmatter(type, 'en');
      expectAccepted(schema, { ...mainFrontmatter(), l10n: {} });
      expectRejectedAt(schema, { ...mainFrontmatter(), l10n: { tagline: 'x' } }, ['l10n']);
    }
    // 不指定类型(生成 JSON Schema 用)时只约束为短文本字典。
    expectAccepted(frontmatterSchema(), { ...mainFrontmatter(), l10n: { tagline: 'Short text.' } });
    expectRejectedAt(frontmatterSchema(), { ...mainFrontmatter(), l10n: { tagline: 1 } }, ['l10n', 'tagline']);
    expectRejectedAt(frontmatterSchema(), { ...mainFrontmatter(), l10n: { 'bad key': 'x' } }, ['l10n', 'bad key']);
  });

  it('不带角色时 sourceDigest 可有可无(生成 JSON Schema 用)', () => {
    expectAccepted(frontmatterSchema(), mainFrontmatter());
    expectAccepted(frontmatterSchema(), translationFrontmatter());
  });
});

describe('语言文件规则', () => {
  const body = 'Body text.\n';

  it('optional 类型的主稿只有 frontmatter:合法,映射为 object_sha256 为空的译文行', () => {
    const files = { en: { frontmatter: mainFrontmatter(), body: '' } };
    const parsed = contract.localeFiles('wiki.site').safeParse(files);
    expect(parsed.success).toBe(true);
    const frontmatter = contract.frontmatter('wiki.site', 'en').parse(files.en.frontmatter);
    const row = toEntryLocaleRow(DIGEST_B, { type: 'wiki.site', id: 'sample' }, 'en', frontmatter, null);
    expect(row).toMatchObject({
      release_id: DIGEST_B,
      type: 'wiki.site',
      id: 'sample',
      locale: 'en',
      title: 'Sample title',
      description: 'Sample description.',
      object_sha256: null,
    });
  });

  it('optional 类型的正文只有空白也算空,仍然合法', () => {
    expectAccepted(contract.localeFiles('wiki.site'), { en: { frontmatter: mainFrontmatter(), body: ' \n\n' } });
  });

  it('只有主稿、没有译文:合法,只产生一行', () => {
    const files = { en: { frontmatter: mainFrontmatter(), body } };
    const parsed = contract.localeFiles('blog.post').parse(files);
    const rows = Object.entries(parsed).map(([locale, file]) =>
      toEntryLocaleRow(
        DIGEST_B,
        { type: 'blog.post', id: 'sample' },
        locale,
        contract.frontmatter('blog.post', locale).parse(file.frontmatter),
        DIGEST_A,
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ locale: 'en', object_sha256: DIGEST_A });
  });

  it('主稿加译文:合法,两行', () => {
    const files = {
      en: { frontmatter: mainFrontmatter(), body },
      fr: { frontmatter: translationFrontmatter(), body },
    };
    expect(Object.keys(contract.localeFiles('blog.post').parse(files))).toEqual(['en', 'fr']);
  });

  it('缺主稿:非法,错误指向 defaultLocale', () => {
    expectRejectedAt(contract.localeFiles('blog.post'), { fr: { frontmatter: translationFrontmatter(), body } }, [
      'en',
    ]);
    expectRejectedAt(contract.localeFiles('wiki.site'), {}, ['en']);
  });

  it('required 类型正文为空:非法,错误指向该语言的 body', () => {
    expectRejectedAt(contract.localeFiles('blog.post'), { en: { frontmatter: mainFrontmatter(), body: '' } }, [
      'en',
      'body',
    ]);
    expectRejectedAt(
      contract.localeFiles('docs.page'),
      { en: { frontmatter: mainFrontmatter(), body }, fr: { frontmatter: translationFrontmatter(), body: '  \n' } },
      ['fr', 'body'],
    );
  });

  it('译文文件缺 sourceDigest、主稿文件带 sourceDigest:非法,错误指向对应字段', () => {
    expectRejectedAt(
      contract.localeFiles('blog.post'),
      { en: { frontmatter: mainFrontmatter(), body }, fr: { frontmatter: mainFrontmatter(), body } },
      ['fr', 'frontmatter', 'sourceDigest'],
    );
    expectRejectedAt(contract.localeFiles('blog.post'), { en: { frontmatter: translationFrontmatter(), body } }, [
      'en',
      'frontmatter',
      'sourceDigest',
    ]);
  });

  it('语言不在 site.locales 或语言标签非法:非法', () => {
    expectRejectedAt(
      contract.localeFiles('blog.post'),
      { en: { frontmatter: mainFrontmatter(), body }, xx: { frontmatter: translationFrontmatter(), body } },
      ['xx'],
    );
    expectRejectedAt(
      contract.localeFiles('blog.post'),
      { en: { frontmatter: mainFrontmatter(), body }, EN_us: { frontmatter: translationFrontmatter(), body } },
      ['EN_us'],
    );
  });

  it('generated 类型不得带正文文件', () => {
    expectAccepted(contract.localeFiles('docs.api'), {});
    expectRejectedAt(contract.localeFiles('docs.api'), { en: { frontmatter: mainFrontmatter(), body } }, ['en']);
  });
});
