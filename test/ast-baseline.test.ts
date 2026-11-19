// TC-05:既有文档站的页对象样本不经改写即通过新契约。
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Root, StructuredData, Toc } from '../contract/index.ts';

const fixtureDir = fileURLToPath(new URL('./fixtures/ast-baseline/', import.meta.url));
const assetDir = fileURLToPath(new URL('../.ai/2026-11-19/content-contract-v1/assets/ast-baseline/', import.meta.url));

// 来自任务目录 assets/ast-baseline/manifest.json 的样本清单。
const SAMPLES = [
  'aa3340c4c9a8dc6dae3f5456012084f8c9ce72058500b7b0e8d90f6a40cc9c40',
  '873641f85d7803c15583a8ebb3e390f90fd1ac8d116c3a66ba4ba3039d2abc23',
  '58866f6a17c0f1e8e53070dca0282ef71348df3b036db3d2ebf68242308722ca',
  'ed6e22cd743f80839f078aada1a57207bfaddf5e2c4060cc62585c07949c84cc',
  '60c95543c52f7701f0661cd256812c15c0856abbd9f61ef38376fb1b05a6a7ae',
];

interface Sample {
  body: unknown;
  toc: unknown;
  structuredData: unknown;
}

function collect(node: unknown, seen: Set<string>): void {
  if (node === null || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if (record['type'] === 'element' && typeof record['tagName'] === 'string') seen.add(record['tagName']);
  if (record['type'] === 'codeBlock') seen.add('codeBlock');
  if (record['type'] === 'component') {
    const props = record['props'] as Record<string, unknown> | undefined;
    seen.add(`${String(record['name'])}:${String(props?.['type'])}`);
  }
  if (Array.isArray(record['children'])) for (const child of record['children']) collect(child, seen);
}

describe('AST 兼容基线', () => {
  it('样本目录里恰好是清单列出的 5 个文件', () => {
    expect(readdirSync(fixtureDir).sort()).toEqual(SAMPLES.map((name) => `${name}.json`).sort());
  });

  it.each(SAMPLES)('%s:字节的 sha256 等于文件名,且与任务目录里的原件一致', (name) => {
    const bytes = readFileSync(`${fixtureDir}${name}.json`);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(name);
    expect(bytes.equals(readFileSync(`${assetDir}${name}.json`))).toBe(true);
  });

  it.each(SAMPLES)('%s:body、toc、structuredData 不经改写通过新契约', (name) => {
    const sample = JSON.parse(readFileSync(`${fixtureDir}${name}.json`, 'utf8')) as Sample;
    const body = Root.safeParse(sample.body);
    expect(body.success ? [] : body.error.issues).toEqual([]);
    const toc = Toc.safeParse(sample.toc);
    expect(toc.success ? [] : toc.error.issues).toEqual([]);
    const structuredData = StructuredData.safeParse(sample.structuredData);
    expect(structuredData.success ? [] : structuredData.error.issues).toEqual([]);
    // 校验不改写输入:解析结果与原始 JSON 逐字段相同。
    expect(body.data).toEqual(sample.body);
    expect(toc.data).toEqual(sample.toc);
    expect(structuredData.data).toEqual(sample.structuredData);
  });

  it('样本覆盖清单声明的节点', () => {
    const seen = new Set<string>();
    for (const name of SAMPLES) {
      const sample = JSON.parse(readFileSync(`${fixtureDir}${name}.json`, 'utf8')) as Sample;
      collect(sample.body, seen);
    }
    const expected = [
      'p',
      'strong',
      'code',
      'a',
      'blockquote',
      'ul',
      'ol',
      'li',
      'h2',
      'h3',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'codeBlock',
      'Callout:info',
      'Callout:warning',
    ];
    for (const node of expected) expect(seen.has(node), node).toBe(true);
  });
});

// ---- 与基线定义的逐条对照(差分):基线接受的树,新契约必须接受 ----

interface Parser {
  safeParse(value: unknown): { success: boolean };
}
interface BaselineContract {
  Root: Parser;
  Toc: Parser;
  StructuredData: Parser;
}

// 基线定义摘录不参与本仓的类型检查,这里按路径动态加载,只用它的三个 schema。
const baselinePath = `${assetDir}existing-ast-contract.ts`;
const loadBaseline = async (): Promise<BaselineContract> =>
  (await import(/* @vite-ignore */ baselinePath)) as BaselineContract;

const txt = (value: string) => ({ type: 'text', value });
const elem = (tagName: string, children: unknown[] = [], properties?: unknown) =>
  properties === undefined
    ? { type: 'element', tagName, children }
    : { type: 'element', tagName, properties, children };
const tree = (...children: unknown[]) => ({ type: 'root', children });
const para = (...children: unknown[]) => elem('p', children);
const anchor = (href: string, title?: string) =>
  elem('a', [txt('x')], title === undefined ? { href } : { href, title });
const image = (properties: Record<string, unknown>) => elem('img', [], properties);
const block = (overrides: Record<string, unknown> = {}) => ({
  type: 'codeBlock',
  lang: 'ts',
  colors: [{ light: '#000000', dark: '#ffffff' }],
  lines: [[['x', 0]]],
  ...overrides,
});
const callout = (props: Record<string, unknown>, children: unknown[] = []) => ({
  type: 'component',
  name: 'Callout',
  props,
  children,
});
const deep = (levels: number) => {
  let node: unknown = txt('leaf');
  for (let index = 0; index < levels - 1; index += 1) node = elem('blockquote', [node]);
  return tree(node);
};
const long = (length: number, prefix = '') => prefix + 'a'.repeat(length - prefix.length);
const PLAIN = [
  'p',
  'strong',
  'em',
  'del',
  'blockquote',
  'ul',
  'li',
  'hr',
  'br',
  'table',
  'thead',
  'tbody',
  'tr',
  'code',
];

/** 基线各项约束的边界样本:每一条都是基线接受的既有形式。 */
const BODIES: [string, unknown][] = [
  ['空的根', tree()],
  ['一万个子节点', tree(...Array.from({ length: 10_000 }, () => txt('x')))],
  ['恰好 64 层嵌套', deep(64)],
  ['文本:空串、超长、含控制字符', tree(txt(''), txt(long(300_000)), txt('a\u0000b\n\t'))],
  ...PLAIN.map((tag): [string, unknown] => [
    `普通元素 ${tag}:不带 properties`,
    tree(elem(tag, tag === 'hr' || tag === 'br' ? [] : [txt('x')])),
  ]),
  ...PLAIN.map((tag): [string, unknown] => [`普通元素 ${tag}:properties 为空对象`, tree(elem(tag, [], {}))]),
  ['properties 显式为 undefined', tree({ type: 'element', tagName: 'p', properties: undefined, children: [] })],
  ['ol:不带 properties、空对象、start = 1', tree(elem('ol'), elem('ol', [], {}), elem('ol', [], { start: 1 }))],
  [
    'ol:start 为很大的整数',
    tree(
      elem('ol', [], { start: 2 ** 53 }),
      elem('ol', [], { start: 1e20 }),
      elem('ol', [], { start: Number.MAX_VALUE }),
    ),
  ],
  ...['h2', 'h3', 'h4', 'h5', 'h6'].map((tag): [string, unknown] => [
    `标题 ${tag}:id 为 1 个与 200 个字符`,
    tree(elem(tag, [], { id: 'a' }), elem(tag, [txt('t')], { id: long(200) })),
  ]),
  [
    '标题 id:标点与非 ASCII 字符',
    tree(elem('h2', [], { id: 'a.b:c-d_e~!$&()*+,;=@' }), elem('h2', [], { id: '用量-заголовок' })),
  ],
  ['链接:锚点(id 200 个字符)', tree(para(anchor('#a'), anchor(`#${long(200)}`)))],
  [
    '链接:外链 http / https / mailto',
    tree(
      para(anchor('http://example.com/'), anchor('https://example.com/a?b=c#d'), anchor('mailto:hello@example.com')),
    ),
  ],
  ['链接:恰好 4096 个字符的外链', tree(para(anchor(long(4096, 'https://example.com/'))))],
  [
    '链接:既有的站内路径形式',
    tree(para(anchor('/en/docs'), anchor('/en/docs/a-b/c1'), anchor('/en/docs/api/errors#rate-limit'))),
  ],
  ['链接:资源路径', tree(para(anchor('/assets/file.pdf'), anchor(`/assets/${long(4096 - 8)}`)))],
  ['链接:title 可省略、可为空、可超长', tree(para(anchor('#a', ''), anchor('#a', long(100_000))))],
  ['图片:最短的既有资源路径', tree(image({ src: '/assets/a', alt: 'x' }))],
  [
    '图片:带 title',
    tree(
      image({ src: '/assets/chart.png', alt: 'Chart', title: '' }),
      image({ src: '/assets/chart.png', alt: 'Chart', title: long(50_000) }),
    ),
  ],
  ['图片:资源路径 2049 个字符(超过 2048)', tree(image({ src: `/assets/${long(2041)}`, alt: 'x' }))],
  [
    '图片:资源路径 4097 个与十万个字符',
    tree(image({ src: `/assets/${long(4089)}`, alt: 'x' }), image({ src: `/assets/${long(100_000)}`, alt: 'x' })),
  ],
  [
    '图片:文件名含点、下划线、短横线、以点开头',
    tree(
      image({ src: '/assets/a.b_c-d.PNG', alt: 'x' }),
      image({ src: '/assets/.hidden', alt: 'x' }),
      image({ src: '/assets/...', alt: 'x' }),
    ),
  ],
  ['图片:alt 超长', tree(image({ src: '/assets/a.png', alt: long(100_000) }))],
  [
    '表格单元格:不带 properties、空对象、三种对齐',
    tree(
      elem('th'),
      elem('td', [], {}),
      ...['left', 'right', 'center'].flatMap((align) => [elem('th', [], { align }), elem('td', [], { align })]),
    ),
  ],
  [
    '代码块:lang 为 1 个与 32 个字符、含 + # -',
    tree(
      block({ lang: 'c' }),
      block({ lang: long(32) }),
      block({ lang: 'c++' }),
      block({ lang: 'c#' }),
      block({ lang: 'objective-c' }),
    ),
  ],
  ['代码块:title 可省略、可为空、可超长', tree(block({ title: '' }), block({ title: long(100_000) }))],
  [
    '代码块:调色板为空且没有着色',
    tree(
      block({ colors: [], lines: [] }),
      block({ colors: [], lines: [[]] }),
      block({ colors: [], lines: [[['x', -1]]] }),
    ),
  ],
  [
    '代码块:调色板恰好 64 项,下标取 -1、0、63',
    tree(
      block({
        colors: Array.from({ length: 64 }, () => ({ light: '#000000', dark: '#FFFFFFFF' })),
        lines: [
          [
            ['a', -1],
            ['b', 0],
            ['c', 63],
          ],
        ],
      }),
    ),
  ],
  ['代码块:八位与大小写混合的色值', tree(block({ colors: [{ light: '#AbCdEf', dark: '#abcdef12' }] }))],
  [
    '代码块:一万行、单行一千个片段、超长文本',
    tree(
      block({ lines: Array.from({ length: 10_000 }, () => [['x', 0]]) }),
      block({ lines: [Array.from({ length: 1000 }, () => ['x', -1])] }),
      block({ lines: [[[long(200_000), 0]]] }),
    ),
  ],
  [
    'Callout:info / warning,带与不带 title,带子节点',
    tree(
      callout({ type: 'info' }),
      callout({ type: 'warning', title: '' }),
      callout({ type: 'info', title: long(50_000) }, [para(txt('x')), callout({ type: 'warning' })]),
    ),
  ],
];

const TOCS: [string, unknown][] = [
  ['空目录', []],
  [
    'depth 取 2 与 6',
    [
      { title: 'a', url: '#a', depth: 2 },
      { title: 'b', url: '#b', depth: 6 },
    ],
  ],
  [
    'title 为空、url 只有 #、url 超长',
    [
      { title: '', url: '#', depth: 3 },
      { title: long(100_000), url: long(100_000, '#'), depth: 4 },
    ],
  ],
  ['一万项', Array.from({ length: 10_000 }, () => ({ title: 'a', url: '#a', depth: 2 }))],
];

const STRUCTURED: [string, unknown][] = [
  ['两个数组都为空', { headings: [], contents: [] }],
  [
    'heading 可省略;id 为 1 个与 200 个字符',
    {
      headings: [
        { id: 'a', content: '' },
        { id: long(200), content: long(100_000) },
      ],
      contents: [{ content: '' }, { heading: long(200), content: long(100_000) }],
    },
  ],
  [
    '一万项',
    {
      headings: Array.from({ length: 10_000 }, () => ({ id: 'a', content: 'x' })),
      contents: Array.from({ length: 10_000 }, () => ({ content: 'x' })),
    },
  ],
];

describe('AST 与基线定义的差分:基线接受的既有形式,新契约一律接受', () => {
  it.each(BODIES)('正文:%s', async (_, body) => {
    const baseline = await loadBaseline();
    expect(baseline.Root.safeParse(body).success, '样本应被基线接受').toBe(true);
    const result = Root.safeParse(body);
    expect(result.success ? [] : result.error.issues.slice(0, 3)).toEqual([]);
  });

  it.each(TOCS)('目录:%s', async (_, toc) => {
    const baseline = await loadBaseline();
    expect(baseline.Toc.safeParse(toc).success, '样本应被基线接受').toBe(true);
    expect(Toc.safeParse(toc).success).toBe(true);
  });

  it.each(STRUCTURED)('结构化文本:%s', async (_, data) => {
    const baseline = await loadBaseline();
    expect(baseline.StructuredData.safeParse(data).success, '样本应被基线接受').toBe(true);
    expect(StructuredData.safeParse(data).success).toBe(true);
  });

  it('五个基线样本同样被基线定义接受(确认加载的就是那份定义)', async () => {
    const baseline = await loadBaseline();
    for (const name of SAMPLES) {
      const sample = JSON.parse(readFileSync(`${fixtureDir}${name}.json`, 'utf8')) as Sample;
      expect(baseline.Root.safeParse(sample.body).success).toBe(true);
      expect(baseline.Toc.safeParse(sample.toc).success).toBe(true);
      expect(baseline.StructuredData.safeParse(sample.structuredData).success).toBe(true);
    }
  });

  it('基线拒绝的边界,新契约没有因此放宽到基线之外的既有形式上(抽查)', async () => {
    const baseline = await loadBaseline();
    const rejectedByBoth: unknown[] = [
      deep(65),
      tree(elem('h2', [], { id: long(201) })),
      tree(para(anchor(long(4097, 'https://example.com/')))),
      tree(block({ colors: Array.from({ length: 65 }, () => ({ light: '#000000', dark: '#ffffff' })) })),
      tree(block({ lang: long(33) })),
      tree(image({ src: '/assets/..', alt: 'x' })),
      tree(image({ src: '/assets/a', alt: ' ' })),
      tree(elem('ol', [], { start: 0 })),
      tree(elem('ol', [], { start: 1.5 })),
    ];
    for (const body of rejectedByBoth) {
      expect(baseline.Root.safeParse(body).success).toBe(false);
      expect(Root.safeParse(body).success).toBe(false);
    }
  });
});
