// TC-12:R2 路径、MIME 白名单与资源定稿的单测。
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ASSET_MIMES,
  AssetRef,
  ContractError,
  Root,
  assertAssetMime,
  assetKey,
  assetRef,
  finalizeAsset,
  manifestKey,
  mimeForFileName,
  sha256Hex,
  toReleaseAssetRow,
} from '../contract/index.ts';
import { DIGEST_A, DIGEST_B } from './fixtures/samples.ts';

const bytes = (text: string) => new TextEncoder().encode(text);
const nodeSha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

const code = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ContractError);
    return (error as ContractError).code;
  }
  throw new Error('应当抛错');
};

describe('路径:合法入参得到确切路径', () => {
  it.each([
    ['logo.png', `assets/${DIGEST_A}/logo.png`],
    ['photo.jpeg', `assets/${DIGEST_A}/photo.jpeg`],
    ['photo.JPG', `assets/${DIGEST_A}/photo.JPG`],
    ['hero_image-2.webp', `assets/${DIGEST_A}/hero_image-2.webp`],
    ['icon.svg', `assets/${DIGEST_A}/icon.svg`],
    ['favicon.ico', `assets/${DIGEST_A}/favicon.ico`],
    ['data.v2.json', `assets/${DIGEST_A}/data.v2.json`],
  ])('assetKey(%s)', (name, expected) => {
    expect(assetKey(DIGEST_A, name)).toBe(expected);
    expect(assetRef(DIGEST_A, name)).toBe(`/${expected}`);
    expect(AssetRef.safeParse(`/${expected}`).success).toBe(true);
  });

  it('manifestKey', () => {
    expect(manifestKey('example', DIGEST_B)).toBe(`example/releases/${DIGEST_B}/manifest.json`);
    expect(manifestKey('docs-site2', DIGEST_A)).toBe(`docs-site2/releases/${DIGEST_A}/manifest.json`);
  });

  it('MIME 白名单', () => {
    expect([...ASSET_MIMES].sort()).toEqual([
      'application/json',
      'image/jpeg',
      'image/png',
      'image/svg+xml',
      'image/vnd.microsoft.icon',
      'image/webp',
    ]);
    expect(mimeForFileName('favicon.ico')).toBe('image/vnd.microsoft.icon');
    expect(mimeForFileName('a.jpg')).toBe('image/jpeg');
    expect(assertAssetMime('a.svg', 'image/svg+xml')).toBe('image/svg+xml');
  });
});

describe('路径:非法入参抛错', () => {
  it.each([
    ['摘要过短', 'a'.repeat(63)],
    ['摘要过长', 'a'.repeat(65)],
    ['摘要含大写', 'A'.repeat(64)],
    ['摘要含非十六进制字符', 'g'.repeat(64)],
    ['摘要为空', ''],
    ['摘要带路径', `${'a'.repeat(61)}/..`],
  ])('%s', (_, sha256) => {
    expect(code(() => assetKey(sha256, 'logo.png'))).toBe('invalid_sha256');
    expect(code(() => assetRef(sha256, 'logo.png'))).toBe('invalid_sha256');
  });

  it.each([
    ['含正斜杠', 'img/logo.png'],
    ['含反斜杠', 'img\\logo.png'],
    ['..', '..'],
    ['.', '.'],
    ['以 ../ 开头', '../logo.png'],
    ['绝对路径', '/etc/logo.png'],
    ['含空格', 'my logo.png'],
    ['含百分号编码', '%2e%2e%2flogo.png'],
    ['含空字符', 'logo\u0000.png'],
    ['空文件名', ''],
    ['过长', `${'a'.repeat(130)}.png`],
  ])('文件名%s', (_, name) => {
    expect(code(() => assetKey(DIGEST_A, name))).toBe('invalid_file_name');
  });

  it.each([
    ['source 含大写', 'Example', DIGEST_A, 'invalid_source'],
    ['source 含斜杠', 'a/b', DIGEST_A, 'invalid_source'],
    ['source 为 ..', '..', DIGEST_A, 'invalid_source'],
    ['source 为空', '', DIGEST_A, 'invalid_source'],
    ['source 以数字开头', '1site', DIGEST_A, 'invalid_source'],
    ['releaseId 过短', 'example', 'abc123', 'invalid_release_id'],
    ['releaseId 含大写', 'example', 'A'.repeat(64), 'invalid_release_id'],
    ['releaseId 含路径', 'example', `${'a'.repeat(60)}/../`, 'invalid_release_id'],
    ['releaseId 为 32 位', 'example', 'a'.repeat(32), 'invalid_release_id'],
  ])('%s', (_, source, releaseId, expected) => {
    expect(code(() => manifestKey(source, releaseId))).toBe(expected);
  });

  it.each(['page.html', 'script.js', 'archive.zip', 'anim.gif', 'doc.pdf', 'noextension', '.png', 'image.png.exe'])(
    'MIME 不在白名单:%s',
    (name) => {
      expect(code(() => assetKey(DIGEST_A, name))).toBe('mime_not_allowed');
      expect(code(() => mimeForFileName(name))).toBe('mime_not_allowed');
    },
  );

  it('声明的 MIME 不在白名单或与扩展名不一致', () => {
    expect(code(() => assertAssetMime('page.png', 'text/html'))).toBe('mime_not_allowed');
    expect(code(() => assertAssetMime('logo.png', 'image/svg+xml'))).toBe('mime_mismatch');
    expect(AssetRef.safeParse(`/assets/${DIGEST_A}/page.html`).success).toBe(false);
    expect(AssetRef.safeParse(`assets/${DIGEST_A}/logo.png`).success).toBe(false);
  });
});

describe('finalizeAsset:资源定稿', () => {
  const raw = bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect/></svg>');
  const cleaned = bytes('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');

  it('sha256Hex 与 Node 的实现一致', async () => {
    expect(await sha256Hex(raw)).toBe(nodeSha256(raw));
  });

  it('处理函数改变了字节:摘要与路径取处理后的字节,并与 AST 资源引用一致', async () => {
    const seen: string[] = [];
    const asset = await finalizeAsset({ name: 'diagram.svg', bytes: raw }, (input, info) => {
      seen.push(`${info.name}|${info.mime}|${input.byteLength}`);
      return cleaned;
    });
    expect(seen).toEqual([`diagram.svg|image/svg+xml|${raw.byteLength}`]);
    expect(asset.sha256).toBe(nodeSha256(cleaned));
    expect(asset.sha256).not.toBe(nodeSha256(raw));
    expect(asset.bytes).toBe(cleaned);
    expect(asset.size).toBe(cleaned.byteLength);
    expect(asset.mime).toBe('image/svg+xml');
    expect(asset.key).toBe(`assets/${nodeSha256(cleaned)}/diagram.svg`);
    expect(asset.ref).toBe(`/assets/${nodeSha256(cleaned)}/diagram.svg`);

    // 用定稿结果构造 AST:图片引用就是 asset.ref,且通过契约。
    const tree = {
      type: 'root',
      children: [{ type: 'element', tagName: 'img', properties: { src: asset.ref, alt: 'Diagram' }, children: [] }],
    };
    const parsed = Root.parse(tree);
    const image = parsed.children[0];
    expect(image?.type === 'element' && image.tagName === 'img' ? image.properties.src : undefined).toBe(
      `/${asset.key}`,
    );
    // 资源清单行与 R2 键用的是同一个摘要。
    expect(toReleaseAssetRow(DIGEST_B, asset)).toEqual({
      release_id: DIGEST_B,
      sha256: nodeSha256(cleaned),
      name: 'diagram.svg',
      mime: 'image/svg+xml',
      size: cleaned.byteLength,
    });
  });

  it('异步处理函数同样适用', async () => {
    const asset = await finalizeAsset({ name: 'diagram.svg', bytes: raw }, () => Promise.resolve(cleaned));
    expect(asset.sha256).toBe(nodeSha256(cleaned));
  });

  it('不传处理函数:取原始字节', async () => {
    const asset = await finalizeAsset({ name: 'diagram.svg', bytes: raw });
    expect(asset.sha256).toBe(nodeSha256(raw));
    expect(asset.bytes).toBe(raw);
    expect(asset.size).toBe(raw.byteLength);
    expect(asset.key).toBe(`assets/${nodeSha256(raw)}/diagram.svg`);
    expect(asset.ref).toBe(`/${asset.key}`);
  });

  it('非法资源在定稿时被拒', async () => {
    await expect(finalizeAsset({ name: 'page.html', bytes: raw })).rejects.toMatchObject({ code: 'mime_not_allowed' });
    await expect(finalizeAsset({ name: '../x.svg', bytes: raw })).rejects.toMatchObject({ code: 'invalid_file_name' });
    await expect(finalizeAsset({ name: 'x.svg', bytes: raw, mime: 'image/png' })).rejects.toMatchObject({
      code: 'mime_mismatch',
    });
    await expect(
      finalizeAsset({ name: 'x.svg', bytes: raw }, () => 'not bytes' as unknown as Uint8Array),
    ).rejects.toMatchObject({ code: 'invalid_bytes' });
  });
});
