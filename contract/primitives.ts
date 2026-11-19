// 基础类型:语言标签、时间、摘要、标识、URL、相对路径、规范序列化与体积上限常量。
// 这里的每个正则都同时是 Zod 校验与生成的 JSON Schema 的 pattern,写法须兼容 ECMAScript 的 u 模式。
import { z } from 'zod';

/** 契约版本。信封、仓级输入与页对象的 `schemaVersion` 必须等于它。 */
export const CONTRACT_VERSION = 1;

export const SchemaVersion = z.literal(CONTRACT_VERSION);

// ---- 语言标签(BCP 47 / RFC 5646 的常用子集,要求规范大小写) ----

/** 语言[-文字][-地区][-变体…];语言小写、文字首字母大写、地区大写或三位数字。 */
export const LOCALE_PATTERN =
  /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?(-([a-z0-9]{5,8}|[0-9][a-z0-9]{3}))*$/;

export const Locale = z.string().max(35).regex(LOCALE_PATTERN, '不是规范写法的 BCP 47 语言标签');
export type Locale = z.infer<typeof Locale>;

// ---- 时间与日期 ----

/** RFC 3339 的 UTC 形式:只接受大写 T 与 Z,不接受数字时区偏移。 */
export const UTC_DATE_TIME_PATTERN =
  /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,9})?Z$/;

export const CALENDAR_DATE_PATTERN = /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;

function isRealCalendarDate(value: string): boolean {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCFullYear(year);
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const UtcDateTime = z
  .string()
  .regex(UTC_DATE_TIME_PATTERN, '时间必须是 RFC 3339 的 UTC 形式(以 Z 结尾)')
  .refine(isRealCalendarDate, '日期不存在');
export type UtcDateTime = z.infer<typeof UtcDateTime>;

export const CalendarDate = z
  .string()
  .regex(CALENDAR_DATE_PATTERN, '日期必须是 YYYY-MM-DD')
  .refine(isRealCalendarDate, '日期不存在');

/** 规范化后的 UTC 时间:小数部分固定九位。定宽,所以按字典序比较就是按时间先后比较。 */
export const NORMALIZED_UTC_DATE_TIME_PATTERN =
  /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{9}Z$/;

/**
 * 把已通过 `UtcDateTime` 校验的时间规范化为小数部分固定九位的写法(契约接受的最高精度,不丢精度)。
 * 同一时刻的不同写法得到同一个结果;结果定宽,可直接按字典序比较与排序。格式不合法时返回 undefined。
 */
export function normalizeUtc(value: string): string | undefined {
  if (!UTC_DATE_TIME_PATTERN.test(value)) return undefined;
  const fraction = value.length > 20 ? value.slice(20, -1) : '';
  return `${value.slice(0, 19)}.${fraction.padEnd(9, '0')}Z`;
}

/** 发布侧的时间列:规范化后的 UTC 时间。 */
export const NormalizedUtcDateTime = z
  .string()
  .regex(NORMALIZED_UTC_DATE_TIME_PATTERN, '时间必须是小数部分固定九位的 UTC 写法')
  .refine(isRealCalendarDate, '日期不存在');

/**
 * 按契约接受的完整精度(九位小数)比较两个 UTC 时间:负数 = a 早于 b,0 = 同一时刻,正数 = a 晚于 b。
 * 任一格式不合法时返回 undefined。
 */
export function compareUtc(a: string, b: string): number | undefined {
  const left = normalizeUtc(a);
  const right = normalizeUtc(b);
  if (left === undefined || right === undefined) return undefined;
  return left < right ? -1 : left > right ? 1 : 0;
}

// ---- 摘要与标识 ----

export const SHA256_PATTERN = /^[0-9a-f]{64}$/;
export const Sha256 = z.string().regex(SHA256_PATTERN, '必须是 64 位小写十六进制的 sha256 摘要');
export type Sha256 = z.infer<typeof Sha256>;

/** URL 段:小写字母、数字,以单个短横线分隔。 */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const Slug = z.string().max(96).regex(SLUG_PATTERN, 'slug 只允许小写字母、数字与短横线');

/** 类型内唯一标识:小写字母、数字,以单个点、下划线或短横线分隔。 */
export const ID_BODY = '[a-z0-9]+(?:[._-][a-z0-9]+)*';
export const ID_PATTERN = new RegExp(`^${ID_BODY}$`);
export const Id = z.string().max(96).regex(ID_PATTERN, 'id 只允许小写字母、数字与 . _ -');

/** 词表项的键(作者、分类、标签),格式同 slug。 */
export const TermKey = z.string().max(64).regex(SLUG_PATTERN, '词表键只允许小写字母、数字与短横线');

/** 来源标识、频道名、参与者:小写字母开头的短词。 */
export const SHORT_NAME_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
export const ShortName = z
  .string()
  .regex(SHORT_NAME_PATTERN, '只允许小写字母开头的短词(字母、数字、短横线,至多 32 个字符)');

/** 标题锚点 id(沿用既有文档站的规则)。 */
export const HEADING_ID_PATTERN = /^[^\s#%/?\\\u0000-\u001f\u007f]+$/u;
export const HeadingId = z.string().min(1).max(200).regex(HEADING_ID_PATTERN);

// ---- URL 与路径 ----

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return '..';
  }
}

function hasDotSegment(path: string): boolean {
  const pathOnly = path.split(/[?#]/)[0] ?? '';
  return pathOnly.split('/').some((segment) => ['.', '..'].includes(decodeSegment(segment)));
}

/**
 * 不可信 URL 的统一判定(沿用既有文档站的规则):拒绝控制字符、空白、反斜杠及其百分号编码,
 * 拒绝协议相对地址;站内路径与锚点不得含 `.` / `..` 段;其余只认 https、http、mailto,且不得带账号口令。
 */
export function isSafeUrl(url: string): boolean {
  if (!url || /[\u0000- \u007f\\]/u.test(url) || /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(url)) return false;
  if (url.startsWith('//')) return false;
  if (url.startsWith('/') || url.startsWith('#')) return !hasDotSegment(url);
  try {
    const parsed = new URL(url);
    return ['https:', 'http:', 'mailto:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export const MAX_URL_LENGTH = 2048;

/** 外部网页地址:只认 http / https。 */
export const WebUrl = z
  .string()
  .max(MAX_URL_LENGTH)
  .regex(/^https?:\/\/[^\s/]/, '只允许 http 或 https 地址')
  .refine(isSafeUrl, '不安全的 URL');

/** 外部资源地址:只认 https。域名是否在 `site.assetHosts` 内由带上下文的契约判定。 */
export const HttpsUrl = z
  .string()
  .max(MAX_URL_LENGTH)
  .regex(/^https:\/\/[^\s/]/, '只允许 https 地址')
  .refine(isSafeUrl, '不安全的 URL');

/** 站内路径:以单个 `/` 开头,不含 `.` / `..` 段。前缀是否合法由编译任务按 `site.json` 判定。 */
export const SitePath = z
  .string()
  .max(MAX_URL_LENGTH)
  .regex(/^\/(?!\/)/, '站内路径必须以单个 / 开头')
  .refine(isSafeUrl, '不安全的站内路径');

/**
 * 仓内相对路径:段只允许字母、数字、点、下划线、短横线;不得以 `/` 开头,不得含 `.` 或 `..` 段。
 * 负向前瞻写进正则,使生成的 JSON Schema 带同样的约束。
 */
export const RELATIVE_PATH_PATTERN = /^(?!\.{1,2}(\/|$))[A-Za-z0-9._-]+(\/(?!\.{1,2}(\/|$))[A-Za-z0-9._-]+)*$/;
export const RelativePath = z.string().max(512).regex(RELATIVE_PATH_PATTERN, '必须是不含 . 或 .. 段的仓内相对路径');

/** 域名(小写,至少两段)。 */
export const HOSTNAME_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const Hostname = z.string().regex(HOSTNAME_PATTERN, '必须是小写域名');

/** 取 https 地址的域名;地址不合法时返回 undefined。 */
export function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

// ---- 规范序列化与字节长度 ----

/** 规范 JSON:对象键按码位升序、无空白。页对象的体积与摘要都按它计算。 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) sorted[key] = sortKeys(source[key]);
    return sorted;
  }
  return value;
}

const encoder = new TextEncoder();

/** UTF-8 编码后的字节数。 */
export function utf8ByteLength(text: string): number {
  return encoder.encode(text).byteLength;
}

export function utf8Bytes(text: string): Uint8Array {
  return encoder.encode(text);
}

// ---- 体积上限(字节;判定为「小于等于」) ----

const KIB = 1024;

export const SIZE_LIMITS = {
  site: 64 * KIB,
  item: 64 * KIB,
  frontmatter: 16 * KIB,
  taxonomy: 1024 * KIB,
  redirects: 1024 * KIB,
  navigation: 256 * KIB,
  page: 256 * KIB,
} as const;

export type SizeKind = keyof typeof SIZE_LIMITS;

/** 契约抛出的错误都带原因码,便于调用方记录而不泄露内容。 */
export class ContractError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ContractError';
    this.code = code;
  }
}
