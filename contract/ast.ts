// 正文 AST:白名单节点、组件注册表、目录、搜索用结构化文本与页对象。
// 形状沿用既有文档站已在生产中使用的定义(渲染器依赖这些形状),只做三处加法扩展:
// 链接允许任意前缀的站内路径与 `ref:` 实体引用;图片指向内容寻址的资源并可带宽高;组件走注册表。
// 渲染端不编译、不 eval:这里没有原始 HTML 节点,也没有表达式节点。
import { z } from 'zod';
import { ContractError, HeadingId, Id, Locale, SchemaVersion, canonicalJson, isSafeUrl } from './primitives.ts';
import { AssetRef } from './storage.ts';
import { GLOBAL_REF_PATTERN, GitTypeKeySchema, GlobalRef } from './types.ts';

export const MAX_AST_DEPTH = 64;
export const MAX_PALETTE_COLORS = 64;

/** 未解析的实体引用的前缀:`ref:<类型>:<键>`。 */
export const REF_HREF_PREFIX = 'ref:';

// ---- 链接 ----

/**
 * a.href 的合法形式:
 * - `#<标题 id>` 锚点;
 * - 外链,只认 https / http / mailto;
 * - 已解析的站内路径(以单个 / 开头,不含 . / .. 段;前缀是否合法由编译任务按 site.json 判定);
 * - 未解析的实体引用 `ref:<类型>:<键>`(渲染期解析,目标缺失时降级为纯文本)。
 */
export function isSafeHref(href: string): boolean {
  if (href.startsWith(REF_HREF_PREFIX)) return GLOBAL_REF_PATTERN.test(href.slice(REF_HREF_PREFIX.length));
  if (!isSafeUrl(href)) return false;
  if (href.startsWith('#')) return HeadingId.safeParse(href.slice(1)).success;
  return true;
}

/** 链接长度上限:沿用既有文档站的取值(只做加法扩展,不收紧)。 */
export const MAX_HREF_LENGTH = 4096;

export const SafeHref = z
  .string()
  .max(MAX_HREF_LENGTH)
  .refine(isSafeHref, '链接必须是锚点、站内路径、外链(https / http / mailto)或 ref: 实体引用');

// ---- 组件注册表 ----

export const CALLOUT_TYPES = ['info', 'warning', 'tip', 'danger'] as const;

/** 正文里允许出现的组件。未登记的组件一律不合法。`children` 表示该组件是否可以包含子节点。 */
export const COMPONENT_REGISTRY = {
  Callout: {
    props: z.strictObject({ type: z.enum(CALLOUT_TYPES), title: z.string().optional() }),
    children: true,
  },
  EntityCard: {
    props: z.strictObject({ ref: GlobalRef }),
    children: false,
  },
} as const;

export type ComponentName = keyof typeof COMPONENT_REGISTRY;
export const COMPONENT_NAMES = Object.keys(COMPONENT_REGISTRY) as ComponentName[];

// ---- 节点 ----

export const PLAIN_TAGS = [
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
] as const;
export const HEADING_TAGS = ['h2', 'h3', 'h4', 'h5', 'h6'] as const;
export const VOID_TAGS: readonly string[] = ['img', 'hr', 'br'];
export const ELEMENT_TAGS = [...PLAIN_TAGS, 'ol', ...HEADING_TAGS, 'a', 'img', 'th', 'td'] as const;

export interface TextNode {
  type: 'text';
  value: string;
}

export interface CodeBlockNode {
  type: 'codeBlock';
  lang: string;
  title?: string | undefined;
  colors: { light: string; dark: string }[];
  /** 每行是若干 [文本, 调色板下标];下标 -1 表示无色。 */
  lines: [string, number][][];
}

export type ElementNode = { type: 'element'; children: BodyNode[] } & (
  | { tagName: (typeof PLAIN_TAGS)[number]; properties?: Record<string, never> | undefined }
  | { tagName: 'ol'; properties?: { start?: number | undefined } | undefined }
  | { tagName: (typeof HEADING_TAGS)[number]; properties: { id: string } }
  | { tagName: 'a'; properties: { href: string; title?: string | undefined } }
  | {
      tagName: 'img';
      properties: {
        src: string;
        alt: string;
        title?: string | undefined;
        width?: number | undefined;
        height?: number | undefined;
      };
    }
  | { tagName: 'th' | 'td'; properties?: { align?: 'left' | 'right' | 'center' | undefined } | undefined }
);

export type ComponentNode =
  | {
      type: 'component';
      name: 'Callout';
      props: { type: (typeof CALLOUT_TYPES)[number]; title?: string | undefined };
      children: BodyNode[];
    }
  | { type: 'component'; name: 'EntityCard'; props: { ref: string }; children: BodyNode[] };

export type BodyNode = TextNode | CodeBlockNode | ElementNode | ComponentNode;

export interface RootNode {
  type: 'root';
  children: BodyNode[];
}

const EmptyProps = z.strictObject({});
const Text = z.strictObject({ type: z.literal('text'), value: z.string() });
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/);
const CodeBlock = z.strictObject({
  type: z.literal('codeBlock'),
  lang: z.string().regex(/^[a-z0-9+#-]{1,32}$/),
  title: z.string().optional(),
  colors: z.array(z.strictObject({ light: Hex, dark: Hex })).max(MAX_PALETTE_COLORS),
  lines: z.array(z.array(z.tuple([z.string(), z.number().int().min(-1)]))),
});
const ImageDimension = z.number().int().min(1).max(16384);

/**
 * ol.start:正整数。基线对整数没有「安全整数」上限,而 Zod 4 的 int() 有;
 * 这里用 Number.isInteger 判定,保持基线的接受范围。
 */
const OlStart = z
  .number()
  .refine((value) => Number.isInteger(value), '必须是整数')
  .positive();

/** 既有文档站的资源路径 `/assets/<文件名>`(既有形状,保留以保证只做加法扩展)。 */
export const LEGACY_ASSET_PATH_PATTERN = /^\/assets\/(?!\.{1,2}$)[a-zA-Z0-9._-]+$/;

/**
 * img.src:已定稿的资源引用 `/assets/<sha256>/<文件名>`(本契约的编译产物只产出这一种),
 * 或既有形式 `/assets/<文件名>`。既有形式沿用基线的接受范围:基线没有长度上限,这里也不加。
 */
export const ImageSrc = z
  .string()
  .refine(
    (src) => AssetRef.safeParse(src).success || LEGACY_ASSET_PATH_PATTERN.test(src),
    '图片地址必须是资源引用 /assets/<sha256>/<文件名>',
  );

/** 各元素的属性(不含 children;children 由递归的节点 schema 校验)。 */
const ElementProps = z.discriminatedUnion('tagName', [
  z.strictObject({ tagName: z.enum(PLAIN_TAGS), properties: EmptyProps.optional() }),
  z.strictObject({
    tagName: z.literal('ol'),
    properties: z.strictObject({ start: OlStart.optional() }).optional(),
  }),
  z.strictObject({ tagName: z.enum(HEADING_TAGS), properties: z.strictObject({ id: HeadingId }) }),
  z.strictObject({
    tagName: z.literal('a'),
    properties: z.strictObject({ href: SafeHref, title: z.string().optional() }),
  }),
  z.strictObject({
    tagName: z.literal('img'),
    properties: z.strictObject({
      src: ImageSrc,
      alt: z.string().refine((value) => value.trim().length > 0, '图片必须有替代文本'),
      title: z.string().optional(),
      width: ImageDimension.optional(),
      height: ImageDimension.optional(),
    }),
  }),
  z.strictObject({
    tagName: z.enum(['th', 'td']),
    properties: z.strictObject({ align: z.enum(['left', 'right', 'center']).optional() }).optional(),
  }),
]);

const ComponentProps = z.discriminatedUnion('name', [
  z.strictObject({ name: z.literal('Callout'), props: COMPONENT_REGISTRY.Callout.props }),
  z.strictObject({ name: z.literal('EntityCard'), props: COMPONENT_REGISTRY.EntityCard.props }),
]);

export const AstNode: z.ZodType<BodyNode> = z.lazy(() => NodeVariants);
const children = z.array(AstNode);

function relay(issue: z.RefinementCtx, inner: z.core.$ZodIssue): void {
  issue.addIssue({ code: 'custom', path: [...inner.path], message: inner.message });
}

// 外层按 type 判别、内层按 tagName / name 判别,递归校验保持线性,不做联合回溯。
const NodeVariants = z
  .discriminatedUnion('type', [
    Text,
    CodeBlock,
    z.strictObject({
      type: z.literal('element'),
      tagName: z.string(),
      properties: z.unknown().optional(),
      children,
    }),
    z.strictObject({ type: z.literal('component'), name: z.string(), props: z.unknown(), children }),
  ])
  .superRefine((node, issue) => {
    if (node.type === 'element') {
      const result = ElementProps.safeParse(
        node.properties === undefined
          ? { tagName: node.tagName }
          : { tagName: node.tagName, properties: node.properties },
      );
      if (!result.success) for (const inner of result.error.issues) relay(issue, inner);
      if (VOID_TAGS.includes(node.tagName) && node.children.length > 0) {
        issue.addIssue({ code: 'custom', path: ['children'], message: '空元素不得有子节点' });
      }
    }
    if (node.type === 'component') {
      const result = ComponentProps.safeParse({ name: node.name, props: node.props });
      if (!result.success) for (const inner of result.error.issues) relay(issue, inner);
      const def = Object.hasOwn(COMPONENT_REGISTRY, node.name)
        ? COMPONENT_REGISTRY[node.name as ComponentName]
        : undefined;
      if (def !== undefined && !def.children && node.children.length > 0) {
        issue.addIssue({ code: 'custom', path: ['children'], message: '该组件不得有子节点' });
      }
    }
    if (node.type === 'codeBlock') {
      node.lines.forEach((line, lineIndex) => {
        line.forEach(([, colorIndex], tokenIndex) => {
          if (colorIndex >= node.colors.length) {
            issue.addIssue({
              code: 'custom',
              path: ['lines', lineIndex, tokenIndex, 1],
              message: '调色板下标越界',
            });
          }
        });
      });
    }
  }) as z.ZodType<BodyNode>;

/** 在递归校验之前先限制嵌套深度(输入可能是不可信的下载内容)。根的子节点深度为 1。 */
export function astDepthWithin(value: unknown, limit: number = MAX_AST_DEPTH): boolean {
  const pending: [unknown, number][] = [[value, 0]];
  while (pending.length > 0) {
    const entry = pending.pop();
    if (entry === undefined) break;
    const [node, depth] = entry;
    if (depth > limit) return false;
    if (node !== null && typeof node === 'object' && 'children' in node && Array.isArray(node.children)) {
      for (const child of node.children as unknown[]) pending.push([child, depth + 1]);
    }
  }
  return true;
}

const BoundedTree = z.unknown().refine((value) => astDepthWithin(value), {
  message: `AST 嵌套深度超过 ${MAX_AST_DEPTH}`,
  abort: true,
});

export const Root: z.ZodType<RootNode> = BoundedTree.pipe(z.strictObject({ type: z.literal('root'), children }));

// ---- 目录与搜索用结构化文本 ----

export const Toc = z.array(
  z.strictObject({ title: z.string(), url: z.string().startsWith('#'), depth: z.number().int().min(2).max(6) }),
);
export type Toc = z.infer<typeof Toc>;

export const StructuredData = z.strictObject({
  headings: z.array(z.strictObject({ id: HeadingId, content: z.string() })),
  contents: z.array(z.strictObject({ heading: HeadingId.optional(), content: z.string() })),
});
export type StructuredData = z.infer<typeof StructuredData>;

// ---- 页对象 ----

/** 一种语言下一个单元的正文产物,按内容寻址存入 objects 表。 */
export const PageObject = z.strictObject({
  schemaVersion: SchemaVersion,
  type: GitTypeKeySchema,
  id: Id,
  locale: Locale,
  body: Root,
  toc: Toc,
  structuredData: StructuredData,
});
export type PageObject = z.infer<typeof PageObject>;

/** 页对象的规范序列化(体积与摘要都按它计算)。 */
export function serializePageObject(page: PageObject): string {
  return canonicalJson(page);
}

/** 校验并序列化;不合法时抛错。 */
export function encodePageObject(page: unknown): string {
  const parsed = PageObject.safeParse(page);
  if (!parsed.success) throw new ContractError('invalid_page_object', '页对象不符合契约');
  return serializePageObject(parsed.data);
}
