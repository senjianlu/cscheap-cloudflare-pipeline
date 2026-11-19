// 体积上限的检查入口。输入文件按原始字节计量(UTF-8 编码后的字节数,含空白),必须在解析之前调用;
// 页对象按规范序列化后的字节数计量。上限为「小于等于」。
import { ContractError, SIZE_LIMITS, type SizeKind, utf8ByteLength } from './primitives.ts';

export { SIZE_LIMITS, type SizeKind };

export const SIZE_KINDS = Object.keys(SIZE_LIMITS) as SizeKind[];

export interface SizeCheck {
  readonly ok: boolean;
  readonly kind: SizeKind;
  /** 实际字节数。 */
  readonly size: number;
  /** 上限(字节)。 */
  readonly limit: number;
}

/**
 * 检查某类输入的体积。`input` 是原始字节、原始文本(按 UTF-8 计字节)或已知的字节数。
 * 不抛错,由调用方决定如何报告。
 */
export function checkSize(kind: SizeKind, input: Uint8Array | string | number): SizeCheck {
  if (!Object.hasOwn(SIZE_LIMITS, kind)) throw new ContractError('unknown_size_kind', '未知的体积类别');
  const size = typeof input === 'number' ? input : typeof input === 'string' ? utf8ByteLength(input) : input.byteLength;
  if (!Number.isInteger(size) || size < 0) throw new ContractError('invalid_size', '字节数必须是非负整数');
  const limit = SIZE_LIMITS[kind];
  return { ok: size <= limit, kind, size, limit };
}

/** 同 checkSize,超限时抛 ContractError(code = too_large)。 */
export function assertSize(kind: SizeKind, input: Uint8Array | string | number): SizeCheck {
  const result = checkSize(kind, input);
  if (!result.ok) throw new ContractError('too_large', `${kind} 超过体积上限(${result.size} > ${result.limit} 字节)`);
  return result;
}
