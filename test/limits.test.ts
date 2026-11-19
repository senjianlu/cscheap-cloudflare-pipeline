// TC-13:体积上限的边界单测。按原始字节(UTF-8)计量,上限为「小于等于」。
import { describe, expect, it } from 'vitest';
import {
  ContractError,
  type PageObject,
  SIZE_KINDS,
  SIZE_LIMITS,
  type SizeKind,
  assertSize,
  checkSize,
  serializePageObject,
  utf8ByteLength,
} from '../contract/index.ts';

const KIB = 1024;
const EXPECTED: Record<SizeKind, number> = {
  site: 64 * KIB,
  item: 64 * KIB,
  frontmatter: 16 * KIB,
  taxonomy: 1024 * KIB,
  redirects: 1024 * KIB,
  navigation: 256 * KIB,
  page: 256 * KIB,
};

const KINDS = Object.keys(EXPECTED) as SizeKind[];

/** 构造一份恰好 size 字节的原始 JSON 文本:合法 JSON,用字符串字段填充。 */
function jsonOfSize(size: number): string {
  const frame = JSON.stringify({ pad: '' });
  return JSON.stringify({ pad: 'x'.repeat(size - frame.length) });
}

/** 构造一份以空白撑大到 size 字节的原始 JSON 文本:解析后的内容很小。 */
function paddedJson(size: number): string {
  const body = JSON.stringify({ schemaVersion: 1 });
  return `${body.slice(0, -1)}${' '.repeat(size - body.length)}}`;
}

describe('体积上限的取值', () => {
  it('每个 kind 的上限与方案一致', () => {
    expect(SIZE_LIMITS).toEqual(EXPECTED);
    expect([...SIZE_KINDS].sort()).toEqual([...KINDS].sort());
  });
});

describe.each(KINDS)('%s', (kind) => {
  const limit = EXPECTED[kind];

  it('上限内通过', () => {
    const text = jsonOfSize(limit - 1);
    expect(utf8ByteLength(text)).toBe(limit - 1);
    expect(checkSize(kind, text)).toEqual({ ok: true, kind, size: limit - 1, limit });
    expect(checkSize(kind, new TextEncoder().encode(text)).ok).toBe(true);
    expect(checkSize(kind, 0).ok).toBe(true);
  });

  it('恰等于上限通过', () => {
    const text = jsonOfSize(limit);
    expect(utf8ByteLength(text)).toBe(limit);
    expect(checkSize(kind, text)).toEqual({ ok: true, kind, size: limit, limit });
    expect(checkSize(kind, new TextEncoder().encode(text)).ok).toBe(true);
    expect(() => assertSize(kind, text)).not.toThrow();
  });

  it('超 1 字节被拒', () => {
    const text = jsonOfSize(limit + 1);
    expect(utf8ByteLength(text)).toBe(limit + 1);
    expect(checkSize(kind, text)).toEqual({ ok: false, kind, size: limit + 1, limit });
    expect(checkSize(kind, new TextEncoder().encode(text)).ok).toBe(false);
    expect(checkSize(kind, limit + 1).ok).toBe(false);
    try {
      assertSize(kind, text);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ContractError);
      expect((error as ContractError).code).toBe('too_large');
    }
  });

  it('多字节字符:字符数未超、字节数超,按字节判定被拒', () => {
    // 每个字符 3 字节;字符数只有上限的一半左右,字节数却超过上限。
    const characters = Math.floor(limit / 2);
    const text = JSON.stringify({ pad: '字'.repeat(characters) });
    expect(text.length).toBeLessThanOrEqual(limit);
    expect(utf8ByteLength(text)).toBeGreaterThan(limit);
    expect(checkSize(kind, text).ok).toBe(false);
    // 同样字符数的单字节文本在上限内。
    expect(checkSize(kind, JSON.stringify({ pad: 'x'.repeat(characters) })).ok).toBe(true);
  });

  it('多字节字符:恰等于上限通过,再多一个字节被拒', () => {
    const frame = utf8ByteLength(JSON.stringify({ pad: '' }));
    const multibyte = Math.floor((limit - frame) / 3);
    const filler = limit - frame - multibyte * 3;
    const exact = JSON.stringify({ pad: '字'.repeat(multibyte) + 'x'.repeat(filler) });
    expect(utf8ByteLength(exact)).toBe(limit);
    expect(checkSize(kind, exact).ok).toBe(true);
    expect(checkSize(kind, `${exact} `).ok).toBe(false);
  });

  it('以空白撑大的原始文件被拒(解析后的内容很小)', () => {
    const text = paddedJson(limit + 1);
    expect(utf8ByteLength(text)).toBe(limit + 1);
    expect(utf8ByteLength(JSON.stringify(JSON.parse(text)))).toBeLessThan(64);
    expect(checkSize(kind, text).ok).toBe(false);
    expect(checkSize(kind, paddedJson(limit)).ok).toBe(true);
  });
});

describe('页对象按规范序列化后的字节数计量', () => {
  const page = (paragraph: string): PageObject => ({
    schemaVersion: 1,
    type: 'docs.page',
    id: 'sample',
    locale: 'en',
    body: {
      type: 'root',
      children: [{ type: 'element', tagName: 'p', children: [{ type: 'text', value: paragraph }] }],
    },
    toc: [],
    structuredData: { headings: [], contents: [] },
  });
  const frame = utf8ByteLength(serializePageObject(page('')));
  const limit = SIZE_LIMITS.page;

  it('恰等于上限通过,超 1 字节被拒', () => {
    const exact = serializePageObject(page('x'.repeat(limit - frame)));
    expect(utf8ByteLength(exact)).toBe(limit);
    expect(checkSize('page', exact).ok).toBe(true);
    const over = serializePageObject(page('x'.repeat(limit - frame + 1)));
    expect(checkSize('page', over)).toEqual({ ok: false, kind: 'page', size: limit + 1, limit });
  });

  it('多字节正文按字节判定', () => {
    const characters = Math.ceil((limit - frame) / 3) + 1;
    const serialized = serializePageObject(page('字'.repeat(characters)));
    expect(serialized.length).toBeLessThan(limit);
    expect(checkSize('page', serialized).ok).toBe(false);
  });
});

describe('非法入参', () => {
  it('未知类别与非法字节数抛错', () => {
    expect(() => checkSize('unknown' as SizeKind, 1)).toThrowError(ContractError);
    expect(() => checkSize('item', -1)).toThrowError(ContractError);
    expect(() => checkSize('item', 1.5)).toThrowError(ContractError);
  });
});
