// TC-04:正文 AST 白名单的单测。
import { describe, expect, it } from 'vitest';
import {
  type BodyNode,
  COMPONENT_NAMES,
  ELEMENT_TAGS,
  MAX_AST_DEPTH,
  MAX_HREF_LENGTH,
  PageObject,
  Root,
  type RootNode,
  StructuredData,
  Toc,
  assetRef,
  astDepthWithin,
  canonicalJson,
  encodePageObject,
  isSafeHref,
} from '../contract/index.ts';
import { DIGEST_A } from './fixtures/samples.ts';

const text = (value: string): BodyNode => ({ type: 'text', value });
const el = (tagName: string, children: unknown[] = [], properties?: unknown): unknown =>
  properties === undefined
    ? { type: 'element', tagName, children }
    : { type: 'element', tagName, properties, children };
const root = (...children: unknown[]): unknown => ({ type: 'root', children });
const p = (...children: unknown[]) => el('p', children);
const link = (href: string) => el('a', [text('link')], { href });

const accepts = (tree: unknown): void => {
  const result = Root.safeParse(tree);
  expect(result.success ? [] : result.error.issues).toEqual([]);
};
const rejects = (tree: unknown): string[] => {
  const result = Root.safeParse(tree);
  expect(result.success, JSON.stringify(tree).slice(0, 200)).toBe(false);
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

const nested = (levels: number): unknown => {
  let node: unknown = text('leaf');
  for (let index = 0; index < levels - 1; index += 1) node = el('blockquote', [node]);
  return root(node);
};

describe('AST:合法树', () => {
  it('含 EntityCard、ref: 链接、带宽高图片、下标为 -1 的代码块', () => {
    const tree = root(
      el('h2', [text('Heading')], { id: 'heading' }),
      p(text('See '), link('ref:wiki.site:example-market'), text(' and '), link('ref:item:skins/Example-Item_1')),
      { type: 'component', name: 'EntityCard', props: { ref: 'item:skins/Example-Item_1' }, children: [] },
      { type: 'component', name: 'Callout', props: { type: 'tip', title: 'Tip' }, children: [p(text('Body'))] },
      { type: 'component', name: 'Callout', props: { type: 'danger' }, children: [] },
      el('img', [], { src: assetRef(DIGEST_A, 'chart.png'), alt: 'Chart', width: 640, height: 360 }),
      {
        type: 'codeBlock',
        lang: 'ts',
        title: 'example.ts',
        colors: [{ light: '#000000', dark: '#ffffffff' }],
        lines: [
          [
            ['const', 0],
            [' x', -1],
          ],
          [],
        ],
      },
    );
    accepts(tree);
  });

  it('白名单内的每个元素都能通过', () => {
    const tree = root(
      p(el('strong', [text('a')]), el('em', [text('b')]), el('del', [text('c')]), el('code', [text('d')]), el('br')),
      el('blockquote', [p(text('quote'))]),
      el('ul', [el('li', [text('x')])]),
      el('ol', [el('li', [text('y')])], { start: 3 }),
      el('hr'),
      el('table', [
        el('thead', [el('tr', [el('th', [text('h')], { align: 'left' })])]),
        el('tbody', [el('tr', [el('td', [text('d')], {})])]),
      ]),
      ...['h2', 'h3', 'h4', 'h5', 'h6'].map((tag) => el(tag, [text(tag)], { id: `id-${tag}` })),
      p(
        link('#id-h2'),
        link('/fr/blog/sample#part'),
        link('https://example.com/a?b=c'),
        link('mailto:hello@example.com'),
      ),
      el('img', [], { src: assetRef(DIGEST_A, 'logo.svg'), alt: 'Logo', title: 'Logo' }),
    );
    accepts(tree);
    expect([...ELEMENT_TAGS].sort()).toEqual(
      'p strong em del blockquote ul ol li hr br table thead tbody tr th td code a img h2 h3 h4 h5 h6'
        .split(' ')
        .sort(),
    );
  });

  it('img.src 的既有形式没有长度上限:2049、4097、十万个字符的资源路径都通过', () => {
    for (const length of [2041, 4089, 100_000]) {
      const src = `/assets/${'a'.repeat(length)}`;
      expect(src.length).toBeGreaterThan(2048);
      accepts(root(el('img', [], { src, alt: 'Chart' })));
    }
  });

  it('ol.start 沿用基线范围:超出安全整数的整数也通过', () => {
    accepts(root(el('ol', [], { start: 2 ** 53 }), el('ol', [], { start: 1e20 })));
  });

  it('img.src 的既有形式 /assets/<文件名> 仍然通过(只做加法扩展)', () => {
    accepts(root(el('img', [], { src: '/assets/chart.png', alt: 'Chart' })));
    accepts(root(el('img', [], { src: '/assets/logo_v2-dark.svg', alt: 'Logo', title: 'Logo' })));
  });

  it('站内路径不限定语言或路径前缀', () => {
    for (const href of ['/', '/docs', '/en/docs/api/errors', '/any-prefix/x/y?z=1#frag']) {
      expect(isSafeHref(href), href).toBe(true);
    }
  });

  it('链接长度沿用既有上限 4096:3000 字符与恰好 4096 字符的合法链接通过', () => {
    const https = (length: number) => `https://example.com/${'a'.repeat(length - 'https://example.com/'.length)}`;
    const sitePath = (length: number) => `/${'a'.repeat(length - 1)}`;
    expect(MAX_HREF_LENGTH).toBe(4096);
    for (const href of [https(3000), https(4095), https(4096), sitePath(3000), sitePath(4096)]) {
      expect([3000, 4095, 4096]).toContain(href.length);
      accepts(root(p(link(href))));
    }
  });

  it('恰好 64 层嵌套通过', () => {
    expect(astDepthWithin(nested(MAX_AST_DEPTH))).toBe(true);
    accepts(nested(MAX_AST_DEPTH));
  });
});

describe('AST:非法树', () => {
  it('未登记组件', () => {
    expect(COMPONENT_NAMES).toEqual(['Callout', 'EntityCard']);
    rejects(root({ type: 'component', name: 'Tabs', props: {}, children: [] }));
    rejects(root({ type: 'component', name: 'script', props: { src: 'https://example.com/x.js' }, children: [] }));
  });

  it('组件属性不合法', () => {
    rejects(root({ type: 'component', name: 'Callout', props: { type: 'success' }, children: [] }));
    rejects(root({ type: 'component', name: 'Callout', props: { type: 'info', onClick: 'x' }, children: [] }));
    rejects(root({ type: 'component', name: 'EntityCard', props: {}, children: [] }));
    rejects(root({ type: 'component', name: 'EntityCard', props: { ref: 'item:skins/x' }, children: [text('x')] }));
  });

  it.each([
    ['raw', { type: 'raw', value: '<script>alert(1)</script>' }],
    ['html', { type: 'html', value: '<b>x</b>' }],
    ['mdxJsxFlowElement', { type: 'mdxJsxFlowElement', name: 'div', attributes: [], children: [] }],
    ['mdxFlowExpression', { type: 'mdxFlowExpression', value: '1 + 1' }],
    ['mdxjsEsm', { type: 'mdxjsEsm', value: 'import x from "y"' }],
  ])('原始 HTML 或表达式节点 %s', (_, node) => {
    rejects(root(node));
    rejects(root(p(node)));
  });

  it.each(['script', 'iframe', 'div', 'span', 'h1', 'style', 'object'])('白名单外的元素 %s', (tag) => {
    rejects(root(el(tag, [text('x')])));
  });

  it('元素带白名单外的属性', () => {
    rejects(root(el('p', [text('x')], { onclick: 'alert(1)' })));
    rejects(root(el('a', [text('x')], { href: '/a', target: '_blank' })));
    rejects(root({ type: 'element', tagName: 'p', children: [], dangerouslySetInnerHTML: 'x' }));
    rejects(root({ type: 'text', value: 'x', html: '<b>x</b>' }));
  });

  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:x',
    'ftp://example.com/x',
    '//example.com/x',
    'https://user:secret@example.com/',
    '/a\\b',
    '/a b',
    'relative/path',
    '',
  ])('a.href 为 %s', (href) => {
    expect(isSafeHref(href)).toBe(false);
    rejects(root(p(link(href))));
  });

  it.each(['/docs/../admin', '/../x', '/a/./b', '/a/%2e%2e/b', '/a/%2E%2E', '/a/..', '/%2e/x'])(
    'a.href 含路径穿越 %s',
    (href) => {
      expect(isSafeHref(href)).toBe(false);
      rejects(root(p(link(href))));
    },
  );

  it.each([
    'ref:',
    'ref:sample',
    'ref:blog.video:sample',
    'ref:blog.post:',
    'ref:blog.post:Sample',
    'ref:blog.post:../other',
    'ref:item:Example',
    'ref:item:skins/a b',
    'ref: blog.post:sample',
    'REF:blog.post:sample',
  ])('ref: 引用格式错误 %s', (href) => {
    expect(isSafeHref(href)).toBe(false);
    rejects(root(p(link(href))));
  });

  it('链接长度超过 4096(4097 字符)', () => {
    const https = `https://example.com/${'a'.repeat(4097 - 'https://example.com/'.length)}`;
    const sitePath = `/${'a'.repeat(4096)}`;
    expect(https).toHaveLength(4097);
    expect(sitePath).toHaveLength(4097);
    rejects(root(p(link(https))));
    rejects(root(p(link(sitePath))));
  });

  it('无 id 的标题', () => {
    rejects(root(el('h2', [text('Heading')])));
    rejects(root(el('h3', [text('Heading')], {})));
    rejects(root(el('h4', [text('Heading')], { id: '' })));
    rejects(root(el('h2', [text('Heading')], { id: 'has space' })));
  });

  it('img 带子节点、缺 alt 或 src 不是资源引用', () => {
    const src = assetRef(DIGEST_A, 'chart.png');
    rejects(root(el('img', [text('x')], { src, alt: 'Chart' })));
    rejects(root(el('img', [], { src })));
    rejects(root(el('img', [], { src, alt: '  ' })));
    rejects(root(el('img', [], { src: 'https://example.com/chart.png', alt: 'Chart' })));
    rejects(root(el('img', [], { src: '/assets/', alt: 'Chart' })));
    rejects(root(el('img', [], { src: '/assets/..', alt: 'Chart' })));
    rejects(root(el('img', [], { src: '/images/chart.png', alt: 'Chart' })));
    rejects(root(el('img', [], { src: 'assets/chart.png', alt: 'Chart' })));
    rejects(root(el('img', [], { src: `/assets/${DIGEST_A}/../chart.png`, alt: 'Chart' })));
    rejects(root(el('img', [], { src: `/assets/${DIGEST_A}/chart.exe`, alt: 'Chart' })));
    rejects(root(el('img', [], { src, alt: 'Chart', width: 0 })));
    rejects(root(el('hr', [text('x')])));
    rejects(root(el('br', [text('x')])));
  });

  it('嵌套 65 层', () => {
    expect(astDepthWithin(nested(MAX_AST_DEPTH + 1))).toBe(false);
    const issues = rejects(nested(MAX_AST_DEPTH + 1));
    expect(issues.join('\n')).toContain('嵌套深度');
    // 远超上限的输入也只走迭代式的深度检查,不会递归到栈溢出。
    expect(Root.safeParse(nested(50_000)).success).toBe(false);
  });

  it('调色板下标等于 colors 长度', () => {
    const block = (index: number, colors: number) => ({
      type: 'codeBlock',
      lang: 'ts',
      colors: Array.from({ length: colors }, () => ({ light: '#000000', dark: '#ffffff' })),
      lines: [[['x', index]]],
    });
    accepts(root(block(0, 1)));
    accepts(root(block(-1, 0)));
    expect(rejects(root(block(1, 1))).join('\n')).toContain('调色板下标越界');
    rejects(root(block(0, 0)));
    rejects(root(block(-2, 1)));
    rejects(root(block(0.5, 1)));
  });

  it('调色板超过 64 项或色值非法', () => {
    const colors = Array.from({ length: 65 }, () => ({ light: '#000000', dark: '#ffffff' }));
    rejects(root({ type: 'codeBlock', lang: 'ts', colors, lines: [] }));
    rejects(root({ type: 'codeBlock', lang: 'ts', colors: [{ light: 'red', dark: '#ffffff' }], lines: [] }));
    rejects(root({ type: 'codeBlock', lang: 'TS', colors: [], lines: [] }));
  });

  it('根不是 root 或带多余字段', () => {
    expect(Root.safeParse(p(text('x'))).success).toBe(false);
    expect(Root.safeParse({ type: 'root', children: [], data: {} }).success).toBe(false);
    expect(Root.safeParse(null).success).toBe(false);
  });
});

describe('目录、结构化文本与页对象', () => {
  const page = (): PageObject => ({
    schemaVersion: 1,
    type: 'docs.page',
    id: 'sample',
    locale: 'en',
    body: root(el('h2', [text('Heading')], { id: 'heading' }), p(text('Body'))) as RootNode,
    toc: [{ title: 'Heading', url: '#heading', depth: 2 }],
    structuredData: {
      headings: [{ id: 'heading', content: 'Heading' }],
      contents: [{ heading: 'heading', content: 'Body' }],
    },
  });

  it('合法页对象通过,规范序列化的键有序且无空白', () => {
    expect(PageObject.safeParse(page()).success).toBe(true);
    const encoded = encodePageObject(page());
    expect(encoded).toBe(canonicalJson(page()));
    expect(encoded.startsWith('{"body":{"children":[')).toBe(true);
    expect(encoded).not.toMatch(/\n/);
  });

  it('目录与结构化文本的非法形状被拒', () => {
    expect(Toc.safeParse([{ title: 'x', url: 'heading', depth: 2 }]).success).toBe(false);
    expect(Toc.safeParse([{ title: 'x', url: '#heading', depth: 1 }]).success).toBe(false);
    expect(Toc.safeParse([{ title: 'x', url: '#heading', depth: 7 }]).success).toBe(false);
    expect(StructuredData.safeParse({ headings: [], contents: [{ heading: 'a b', content: 'x' }] }).success).toBe(
      false,
    );
    expect(StructuredData.safeParse({ headings: [] }).success).toBe(false);
  });

  it('页对象带未知字段、未知类型或非法正文时被拒', () => {
    expect(PageObject.safeParse({ ...page(), title: 'x' }).success).toBe(false);
    expect(PageObject.safeParse({ ...page(), type: 'item' }).success).toBe(false);
    expect(PageObject.safeParse({ ...page(), schemaVersion: 3 }).success).toBe(false);
    expect(() => encodePageObject({ ...page(), body: root({ type: 'raw', value: 'x' }) })).toThrowError(
      /页对象不符合契约/,
    );
  });
});
