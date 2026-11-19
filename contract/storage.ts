// R2 路径与资源定稿。路径一律由这里的函数生成;函数对非法入参抛错,不拼接未经校验的片段。
import { z } from 'zod';
import { ContractError, SHA256_PATTERN, SHORT_NAME_PATTERN } from './primitives.ts';

/** 资源 MIME 白名单:扩展名 → MIME。 */
export const ASSET_MIME_BY_EXTENSION = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/vnd.microsoft.icon',
  json: 'application/json',
} as const;

export type AssetExtension = keyof typeof ASSET_MIME_BY_EXTENSION;
export type AssetMime = (typeof ASSET_MIME_BY_EXTENSION)[AssetExtension];

export const ASSET_MIMES: readonly AssetMime[] = [...new Set(Object.values(ASSET_MIME_BY_EXTENSION))];

/** 文件名:只允许字母、数字、点、下划线、短横线;不得是 `.` 或 `..`。 */
export const ASSET_FILE_NAME_BODY = '(?!\\.{1,2}$)[A-Za-z0-9._-]{1,128}';
export const ASSET_FILE_NAME_PATTERN = new RegExp(`^${ASSET_FILE_NAME_BODY}$`);

export const ASSETS_PREFIX = 'assets';

function fail(code: string, message: string): never {
  throw new ContractError(code, message);
}

function assertSha256(sha256: string): void {
  if (typeof sha256 !== 'string' || !SHA256_PATTERN.test(sha256))
    fail('invalid_sha256', '摘要必须是 64 位小写十六进制');
}

function assertFileName(fileName: string): void {
  if (typeof fileName !== 'string' || !ASSET_FILE_NAME_PATTERN.test(fileName)) {
    fail('invalid_file_name', '文件名只允许字母、数字、点、下划线、短横线,且不得是 . 或 ..');
  }
}

export function isAssetMime(mime: string): mime is AssetMime {
  return (ASSET_MIMES as readonly string[]).includes(mime);
}

/** 按扩展名取 MIME;扩展名不在白名单内则抛错。 */
export function mimeForFileName(fileName: string): AssetMime {
  assertFileName(fileName);
  const dot = fileName.lastIndexOf('.');
  const extension = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  if (!Object.hasOwn(ASSET_MIME_BY_EXTENSION, extension)) fail('mime_not_allowed', '资源类型不在白名单内');
  return ASSET_MIME_BY_EXTENSION[extension as AssetExtension];
}

/** 核对 MIME 在白名单内,且与文件扩展名一致。 */
export function assertAssetMime(fileName: string, mime: string): AssetMime {
  if (!isAssetMime(mime)) fail('mime_not_allowed', '资源类型不在白名单内');
  if (mimeForFileName(fileName) !== mime) fail('mime_mismatch', '资源类型与文件扩展名不一致');
  return mime;
}

/** 资源的 R2 键:`assets/<sha256>/<文件名>`。sha256 是实际上传字节的摘要。 */
export function assetKey(sha256: string, fileName: string): string {
  assertSha256(sha256);
  assertFileName(fileName);
  mimeForFileName(fileName);
  return `${ASSETS_PREFIX}/${sha256}/${fileName}`;
}

/** 正文 AST 与图标里对资源的引用:`/` 加上 R2 键。 */
export function assetRef(sha256: string, fileName: string): string {
  return `/${assetKey(sha256, fileName)}`;
}

export const ASSET_REF_PATTERN = new RegExp(`^\\/${ASSETS_PREFIX}\\/[0-9a-f]{64}\\/${ASSET_FILE_NAME_BODY}$`);

/** 已定稿的资源引用。 */
export const AssetRef = z
  .string()
  .regex(ASSET_REF_PATTERN, '资源引用必须是 /assets/<sha256>/<文件名>')
  .refine((ref) => {
    const fileName = ref.slice(ref.lastIndexOf('/') + 1);
    const dot = fileName.lastIndexOf('.');
    return dot > 0 && Object.hasOwn(ASSET_MIME_BY_EXTENSION, fileName.slice(dot + 1).toLowerCase());
  }, '资源类型不在白名单内');

/** 版本清单的 R2 键:`<source>/releases/<releaseId>/manifest.json`。 */
export function manifestKey(source: string, releaseId: string): string {
  if (typeof source !== 'string' || !SHORT_NAME_PATTERN.test(source)) fail('invalid_source', 'source 格式不合法');
  if (typeof releaseId !== 'string' || !SHA256_PATTERN.test(releaseId)) {
    fail('invalid_release_id', 'releaseId 必须是 64 位小写十六进制');
  }
  return `${source}/releases/${releaseId}/manifest.json`;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface AssetInput {
  /** 文件名(不含目录)。 */
  readonly name: string;
  /** 原始字节。 */
  readonly bytes: Uint8Array;
  /** 缺省时按扩展名推断。 */
  readonly mime?: string;
}

export interface FinalizedAsset {
  readonly name: string;
  readonly mime: AssetMime;
  /** 实际上传的字节(经处理函数处理之后)。 */
  readonly bytes: Uint8Array;
  readonly size: number;
  /** `bytes` 的 sha256。 */
  readonly sha256: string;
  /** R2 键。 */
  readonly key: string;
  /** AST 与图标里使用的引用。 */
  readonly ref: string;
}

export type AssetProcessor = (
  bytes: Uint8Array,
  asset: { name: string; mime: AssetMime },
) => Uint8Array | Promise<Uint8Array>;

/**
 * 资源定稿的唯一入口:先做该类型要求的处理(如 svg 清洗),再对处理后的字节计算摘要并得到最终路径。
 * 正文 AST 与图标引用的是这里返回的 `ref`;此后不得再改动资源字节或 AST 中的资源引用。
 * 处理函数的实现(清洗器)归编译任务,契约只规定顺序与摘要口径。
 */
export async function finalizeAsset(asset: AssetInput, process?: AssetProcessor): Promise<FinalizedAsset> {
  const mime = asset.mime === undefined ? mimeForFileName(asset.name) : assertAssetMime(asset.name, asset.mime);
  if (!(asset.bytes instanceof Uint8Array)) fail('invalid_bytes', '资源内容必须是字节数组');
  const bytes = process ? await process(asset.bytes, { name: asset.name, mime }) : asset.bytes;
  if (!(bytes instanceof Uint8Array)) fail('invalid_bytes', '处理函数必须返回字节数组');
  const sha256 = await sha256Hex(bytes);
  return {
    name: asset.name,
    mime,
    bytes,
    size: bytes.byteLength,
    sha256,
    key: assetKey(sha256, asset.name),
    ref: assetRef(sha256, asset.name),
  };
}
