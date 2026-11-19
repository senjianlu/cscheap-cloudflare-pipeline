// TC-06:图标取值的单测。
import { describe, expect, it } from 'vitest';
import { TYPE_REGISTRY, resolveIcon } from '../contract/index.ts';
import { validItem, withValue, without } from './fixtures/samples.ts';
import { contract, expectAccepted, issuePaths } from './helpers.ts';

const item = (icon: unknown) => withValue(validItem('wiki.guide'), ['icon'], icon);
const defaultIcon = TYPE_REGISTRY['wiki.guide'].defaultIcon;

describe('图标:合法形态', () => {
  it('不写 = 类型默认', () => {
    const parsed = contract.itemOf('wiki.guide').parse(without(validItem('wiki.guide'), 'icon'));
    expect('icon' in parsed).toBe(false);
    expect(resolveIcon(parsed.icon, defaultIcon)).toEqual({ kind: 'name', name: 'book-open', isDefault: true });
  });

  it('false = 不显示,与「未配置」可区分', () => {
    const parsed = contract.itemOf('wiki.guide').parse(item(false));
    expect(parsed.icon).toBe(false);
    expect(resolveIcon(parsed.icon, defaultIcon)).toEqual({ kind: 'none' });
    expect(resolveIcon(undefined, defaultIcon)).not.toEqual(resolveIcon(false, defaultIcon));
  });

  it.each(['rocket', 'a-arrow-down', 'clock-3', 'file-json-2'])('图标名 %s(不设受控清单,只校验格式)', (name) => {
    const parsed = contract.itemOf('wiki.guide').parse(item(name));
    expect(resolveIcon(parsed.icon, defaultIcon)).toEqual({ kind: 'name', name, isDefault: false });
  });

  it('{image} 相对路径', () => {
    const parsed = contract.itemOf('wiki.guide').parse(item({ image: 'icons/guide.svg' }));
    expect(resolveIcon(parsed.icon, defaultIcon)).toEqual({ kind: 'image', image: { image: 'icons/guide.svg' } });
  });

  it('{image, imageDark}', () => {
    expectAccepted(contract.item, item({ image: 'guide.png', imageDark: 'guide-dark.png' }));
    expectAccepted(contract.item, item({ image: 'guide.png', imageDark: 'guide-dark.png', width: 32, height: 32 }));
  });

  it('白名单域名的 https 地址带宽高', () => {
    expectAccepted(contract.item, item({ image: 'https://cdn.example.com/icons/guide.png', width: 48, height: 48 }));
    expectAccepted(
      contract.item,
      item({
        image: 'https://cdn.example.com/icons/guide.png',
        imageDark: 'https://cdn.example.com/icons/guide-dark.png',
        width: 48,
        height: 48,
      }),
    );
  });
});

describe('图标:非法形态', () => {
  const rejected = (icon: unknown): string[] => {
    const result = contract.item.safeParse(item(icon));
    expect(result.success, JSON.stringify(icon)).toBe(false);
    return issuePaths(result);
  };

  it.each([
    ['true', true],
    ['空串', ''],
    ['含大写的名字', 'BookOpen'],
    ['含空格的名字', 'book open'],
    ['下划线写法', 'book_open'],
    ['数字', 1],
    ['null', null],
    ['空对象', {}],
    ['对象带未知字段', { image: 'guide.png', size: 24 }],
    ['相对路径含 ..', { image: '../shared/guide.png' }],
    ['相对路径中段含 ..', { image: 'icons/../../guide.png' }],
    ['绝对文件路径', { image: '/etc/guide.png' }],
    ['http 地址', { image: 'http://cdn.example.com/guide.png', width: 24, height: 24 }],
    ['域名不在 assetHosts', { image: 'https://other.example.org/guide.png', width: 24, height: 24 }],
    ['绝对地址缺宽高', { image: 'https://cdn.example.com/guide.png' }],
    ['绝对地址只缺高', { image: 'https://cdn.example.com/guide.png', width: 24 }],
    ['imageDark 为绝对地址但缺宽高', { image: 'guide.png', imageDark: 'https://cdn.example.com/guide-dark.png' }],
    [
      'imageDark 域名不在 assetHosts',
      { image: 'guide.png', imageDark: 'https://other.example.org/d.png', width: 1, height: 1 },
    ],
    ['宽度为 0', { image: 'guide.png', width: 0 }],
    ['带账号口令的地址', { image: 'https://user:secret@cdn.example.com/guide.png', width: 24, height: 24 }],
  ])('%s 被拒', (_, icon) => {
    const paths = rejected(icon);
    expect(paths.every((path) => path.startsWith('["icon"'))).toBe(true);
  });

  it('assetHosts 为空时任何绝对地址都被拒', async () => {
    const { createContract } = await import('../contract/index.ts');
    const { SITE } = await import('./fixtures/samples.ts');
    const strict = createContract({ ...SITE, assetHosts: [] });
    const result = strict.item.safeParse(item({ image: 'https://cdn.example.com/guide.png', width: 24, height: 24 }));
    expect(result.success).toBe(false);
    expect(strict.item.safeParse(item({ image: 'guide.png' })).success).toBe(true);
  });
});
