// TC-15:就绪与激活规则(实现方案 §4 第 3–7 步的 SQL)在本地 D1 上的验证。
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ACTIVATE_FIRST_SQL,
  CONTRACT_VERSION,
  type ChannelPointerRow,
  type ExpectedCounts,
  INSERT_OBJECT_SQL,
  MARK_ASSETS_VERIFIED_SQL,
  MARK_READY_SQL,
  READ_POINTER_SQL,
  ROLLBACK_POINTER_SQL,
  SWITCH_POINTER_SQL,
  judgeActivation,
  sha256Hex,
} from '../contract/index.ts';
import { SITE } from './fixtures/samples.ts';
import { type TestDb, openTestDb } from './d1.ts';
import { contract } from './helpers.ts';

let db: TestDb;
let counter = 0;

beforeAll(async () => {
  db = await openTestDb();
});

afterAll(async () => {
  await db.dispose();
});

const digest = (text: string) => sha256Hex(new TextEncoder().encode(text));

const EMPTY: ExpectedCounts = {
  entries: 0,
  entry_locales: 0,
  entry_tags: 0,
  links: 0,
  redirects: 0,
  release_assets: 0,
  taxonomy_terms: 0,
  nav: 0,
  objects: 0,
};

interface ReleaseOptions {
  source: string;
  channel?: string;
  expected?: Partial<ExpectedCounts>;
  /** 写入的条目数(每个条目一行 entries、一行带正文的 entry_locales)。 */
  entries?: number;
  /** 是否把正文对象写进 objects。 */
  withObjects?: boolean;
  assetsVerified?: boolean;
  ready?: boolean;
}

/** 写入一个版本:版本行 + 若干条目与译文行(+ 正文对象),按需置 assets_verified 与 ready。 */
async function writeRelease(options: ReleaseOptions): Promise<string> {
  counter += 1;
  const channel = options.channel ?? 'production';
  const entries = options.entries ?? 1;
  const releaseId = await digest(`release-${counter}`);
  const expected: ExpectedCounts = { ...EMPTY, entries, entry_locales: entries, objects: entries, ...options.expected };
  await db.insert('releases', {
    release_id: releaseId,
    source: options.source,
    channel,
    commit_sha: 'c'.repeat(40),
    contract_version: CONTRACT_VERSION,
    status: 'writing',
    expected,
    assets_verified: 0,
    site: contract.snapshot(),
    created_at: '2026-03-01T00:00:00Z',
  });
  for (let index = 0; index < entries; index += 1) {
    const id = `entry-${index}`;
    const object = await digest(`object-${counter}-${index}`);
    if (options.withObjects !== false) await db.run(INSERT_OBJECT_SQL, object, 'page', 2, '{}');
    await db.insert('entries', {
      release_id: releaseId,
      type: 'docs.page',
      id,
      slug: id,
      category: null,
      published_at: null,
      updated_at: null,
      noindex: 0,
      meta: {},
      data: { kind: 'tutorial' },
    });
    await db.insert('entry_locales', {
      release_id: releaseId,
      type: 'docs.page',
      id,
      locale: SITE.defaultLocale,
      title: 'Title',
      description: 'Description.',
      seo_title: null,
      summary: null,
      image_alt: null,
      l10n: null,
      object_sha256: object,
    });
  }
  if (options.assetsVerified !== false) expect(await db.run(MARK_ASSETS_VERIFIED_SQL, releaseId)).toBe(1);
  if (options.ready === true) expect(await db.run(MARK_READY_SQL, releaseId)).toBe(1);
  return releaseId;
}

const statusOf = async (releaseId: string) =>
  (await db.first<{ status: string; assets_verified: number }>(
    'SELECT status, assets_verified FROM releases WHERE release_id = ?1',
    releaseId,
  )) ?? undefined;

const pointerOf = (source: string, channel = 'production') =>
  db.first<ChannelPointerRow>(READ_POINTER_SQL, source, channel);

const T1 = '2026-03-01T10:00:00Z';
const T2 = '2026-03-02T10:00:00Z';
const T3 = '2026-03-03T10:00:00Z';
const T4 = '2026-03-04T10:00:00Z';

describe('就绪(§4 第 3 步)', () => {
  it('行数与 expected 不符:不得变为 ready', async () => {
    const more = await writeRelease({ source: 'ready-a', expected: { entries: 2 } });
    expect(await db.run(MARK_READY_SQL, more)).toBe(0);
    expect(await statusOf(more)).toEqual({ status: 'writing', assets_verified: 1 });

    const fewer = await writeRelease({ source: 'ready-a', entries: 2, expected: { entry_locales: 1 } });
    expect(await db.run(MARK_READY_SQL, fewer)).toBe(0);
    expect((await statusOf(fewer))?.status).toBe('writing');

    for (const table of ['entry_tags', 'links', 'redirects', 'release_assets', 'taxonomy_terms', 'nav'] as const) {
      const missing = await writeRelease({ source: 'ready-a', expected: { [table]: 1 } });
      expect(await db.run(MARK_READY_SQL, missing), table).toBe(0);
      expect((await statusOf(missing))?.status, table).toBe('writing');
    }
  });

  it('行数相符但某个 object_sha256 在 objects 中缺失:不得变为 ready', async () => {
    const releaseId = await writeRelease({ source: 'ready-b', entries: 2, withObjects: false });
    expect(await db.run(MARK_READY_SQL, releaseId)).toBe(0);
    expect(await statusOf(releaseId)).toEqual({ status: 'writing', assets_verified: 1 });

    // 只补上其中一个对象,仍然缺一个。
    const rows = await db.all<{ object_sha256: string }>(
      'SELECT object_sha256 FROM entry_locales WHERE release_id = ?1 ORDER BY id',
      releaseId,
    );
    await db.run(INSERT_OBJECT_SQL, rows[0]?.object_sha256 ?? '', 'page', 2, '{}');
    expect(await db.run(MARK_READY_SQL, releaseId)).toBe(0);
    expect((await statusOf(releaseId))?.status).toBe('writing');

    // 全部补齐后才能就绪。
    await db.run(INSERT_OBJECT_SQL, rows[1]?.object_sha256 ?? '', 'page', 2, '{}');
    expect(await db.run(MARK_READY_SQL, releaseId)).toBe(1);
    expect((await statusOf(releaseId))?.status).toBe('ready');
  });

  it('被引用的正文对象数与 expected.objects 不符:不得变为 ready', async () => {
    const releaseId = await writeRelease({ source: 'ready-b', entries: 2, expected: { objects: 3 } });
    expect(await db.run(MARK_READY_SQL, releaseId)).toBe(0);
    expect((await statusOf(releaseId))?.status).toBe('writing');
  });

  it('assets_verified = 0:不得变为 ready', async () => {
    const releaseId = await writeRelease({ source: 'ready-c', assetsVerified: false });
    expect(await db.run(MARK_READY_SQL, releaseId)).toBe(0);
    expect(await statusOf(releaseId)).toEqual({ status: 'writing', assets_verified: 0 });
  });

  it('三项都满足:变为 ready;此后两条更新语句都不再生效', async () => {
    const releaseId = await writeRelease({ source: 'ready-d', entries: 3, assetsVerified: false });
    expect(await db.run(MARK_ASSETS_VERIFIED_SQL, releaseId)).toBe(1);
    expect(await db.run(MARK_ASSETS_VERIFIED_SQL, releaseId)).toBe(0);
    expect(await db.run(MARK_READY_SQL, releaseId)).toBe(1);
    expect(await statusOf(releaseId)).toEqual({ status: 'ready', assets_verified: 1 });
    expect(await db.run(MARK_READY_SQL, releaseId)).toBe(0);
    expect(await db.run(MARK_ASSETS_VERIFIED_SQL, releaseId)).toBe(0);
    expect(await statusOf(releaseId)).toEqual({ status: 'ready', assets_verified: 1 });
  });

  it('无正文的译文行(object_sha256 为空)不计入对象数,也不阻止就绪', async () => {
    const releaseId = await writeRelease({ source: 'ready-e', entries: 1, assetsVerified: true });
    await db.insert('entry_locales', {
      release_id: releaseId,
      type: 'docs.page',
      id: 'entry-0',
      locale: SITE.locales[1],
      title: 'Titre',
      description: 'Description.',
      seo_title: null,
      summary: null,
      image_alt: null,
      l10n: null,
      object_sha256: null,
    });
    expect(await db.run(MARK_READY_SQL, releaseId)).toBe(0);
    await db.run(
      "UPDATE releases SET expected = json_set(expected, '$.entry_locales', 2) WHERE release_id = ?1",
      releaseId,
    );
    expect(await db.run(MARK_READY_SQL, releaseId)).toBe(1);
  });

  it('不存在的版本:影响 0 行', async () => {
    expect(await db.run(MARK_READY_SQL, await digest('no-such-release'))).toBe(0);
  });
});

describe('激活、切换与回滚(§4 第 4–7 步)', () => {
  it('空库首次激活:插入 1 行且 previous_release 为空', async () => {
    const source = 'act-first';
    const r1 = await writeRelease({ source, ready: true });
    expect(await pointerOf(source)).toBeNull();
    const changes = await db.run(ACTIVATE_FIRST_SQL, r1, source, 'production', T1);
    expect(changes).toBe(1);
    const pointer = await pointerOf(source);
    expect(pointer).toEqual({
      source,
      channel: 'production',
      current_release: r1,
      previous_release: null,
      activated_at: T1,
    });
    expect(judgeActivation({ changes, target: r1, pointer })).toBe('activated');

    // 指针已存在时再次首次激活:不报错、不改指针,判为幂等成功。
    const again = await db.run(ACTIVATE_FIRST_SQL, r1, source, 'production', T2);
    expect(again).toBe(0);
    expect(await pointerOf(source)).toEqual(pointer);
    expect(judgeActivation({ changes: again, target: r1, pointer: await pointerOf(source) })).toBe('already-current');
  });

  it('目标版本不存在:影响 0 行,不创建也不改变指针', async () => {
    const source = 'act-missing';
    const ghost = await digest('ghost-release');

    // 尚无指针:首次激活不得创建指针行。
    const first = await db.run(ACTIVATE_FIRST_SQL, ghost, source, 'production', T1);
    expect(first).toBe(0);
    expect(await pointerOf(source)).toBeNull();
    expect(judgeActivation({ changes: first, target: ghost, pointer: await pointerOf(source) })).toBe('rejected');

    // 已有指针:切换不得改变指针三列。
    const r1 = await writeRelease({ source, ready: true });
    expect(await db.run(ACTIVATE_FIRST_SQL, r1, source, 'production', T1)).toBe(1);
    const before = await pointerOf(source);
    const changes = await db.run(SWITCH_POINTER_SQL, ghost, source, 'production', r1, T2);
    expect(changes).toBe(0);
    expect(await pointerOf(source)).toEqual(before);
    expect(judgeActivation({ changes, target: ghost, pointer: await pointerOf(source) })).toBe('rejected');
  });

  it('目标为 writing:影响 0 行,指针三列不变', async () => {
    const source = 'act-writing';
    const writing = await writeRelease({ source });
    expect((await statusOf(writing))?.status).toBe('writing');

    const first = await db.run(ACTIVATE_FIRST_SQL, writing, source, 'production', T1);
    expect(first).toBe(0);
    expect(await pointerOf(source)).toBeNull();

    const r1 = await writeRelease({ source, ready: true });
    expect(await db.run(ACTIVATE_FIRST_SQL, r1, source, 'production', T1)).toBe(1);
    const before = await pointerOf(source);
    const changes = await db.run(SWITCH_POINTER_SQL, writing, source, 'production', r1, T2);
    expect(changes).toBe(0);
    expect(await pointerOf(source)).toEqual(before);
    expect(judgeActivation({ changes, target: writing, pointer: await pointerOf(source) })).toBe('rejected');
  });

  it('目标属于别的来源或频道:影响 0 行,指针三列不变', async () => {
    const source = 'act-owner';
    const otherSource = await writeRelease({ source: 'act-owner-other', ready: true });
    const otherChannel = await writeRelease({ source, channel: 'preview', ready: true });

    // 尚无指针时,首次激活同样拒绝错误归属的目标。
    for (const target of [otherSource, otherChannel]) {
      expect(await db.run(ACTIVATE_FIRST_SQL, target, source, 'production', T1)).toBe(0);
    }
    expect(await pointerOf(source)).toBeNull();

    const r1 = await writeRelease({ source, ready: true });
    expect(await db.run(ACTIVATE_FIRST_SQL, r1, source, 'production', T1)).toBe(1);
    const before = await pointerOf(source);
    for (const target of [otherSource, otherChannel]) {
      const changes = await db.run(SWITCH_POINTER_SQL, target, source, 'production', r1, T2);
      expect(changes).toBe(0);
      expect(await pointerOf(source)).toEqual(before);
      expect(judgeActivation({ changes, target, pointer: await pointerOf(source) })).toBe('rejected');
    }
    // 别的来源、别的频道的指针也没有被创建或改动。
    expect(await pointerOf('act-owner-other')).toBeNull();
    expect(await pointerOf(source, 'preview')).toBeNull();
  });

  it('带错误旧值的切换:影响 0 行,指针三列不变', async () => {
    const source = 'act-conflict';
    const r1 = await writeRelease({ source, ready: true });
    const r2 = await writeRelease({ source, ready: true });
    const r3 = await writeRelease({ source, ready: true });
    expect(await db.run(ACTIVATE_FIRST_SQL, r1, source, 'production', T1)).toBe(1);
    expect(await db.run(SWITCH_POINTER_SQL, r2, source, 'production', r1, T2)).toBe(1);
    const before = await pointerOf(source);

    // 另一个发布者基于过期的旧值 r1 想切到 r3。
    const changes = await db.run(SWITCH_POINTER_SQL, r3, source, 'production', r1, T3);
    expect(changes).toBe(0);
    expect(await pointerOf(source)).toEqual(before);
    expect(before).toMatchObject({ current_release: r2, previous_release: r1, activated_at: T2 });
    expect(judgeActivation({ changes, target: r3, pointer: await pointerOf(source) })).toBe('rejected');
  });

  it('正确切换:影响 1 行并正确移动 previous_release', async () => {
    const source = 'act-switch';
    const r1 = await writeRelease({ source, ready: true });
    const r2 = await writeRelease({ source, ready: true });
    const r3 = await writeRelease({ source, ready: true });
    expect(await db.run(ACTIVATE_FIRST_SQL, r1, source, 'production', T1)).toBe(1);

    const first = await db.run(SWITCH_POINTER_SQL, r2, source, 'production', r1, T2);
    expect(first).toBe(1);
    expect(await pointerOf(source)).toEqual({
      source,
      channel: 'production',
      current_release: r2,
      previous_release: r1,
      activated_at: T2,
    });
    expect(judgeActivation({ changes: first, target: r2, pointer: await pointerOf(source) })).toBe('activated');

    const second = await db.run(SWITCH_POINTER_SQL, r3, source, 'production', r2, T3);
    expect(second).toBe(1);
    expect(await pointerOf(source)).toEqual({
      source,
      channel: 'production',
      current_release: r3,
      previous_release: r2,
      activated_at: T3,
    });
  });

  it('对当前版本重复激活:幂等成功,current、previous、activated_at 均不变', async () => {
    const source = 'act-repeat';
    const r1 = await writeRelease({ source, ready: true });
    const r2 = await writeRelease({ source, ready: true });
    expect(await db.run(ACTIVATE_FIRST_SQL, r1, source, 'production', T1)).toBe(1);
    expect(await db.run(SWITCH_POINTER_SQL, r2, source, 'production', r1, T2)).toBe(1);
    const before = await pointerOf(source);
    expect(before).toMatchObject({ current_release: r2, previous_release: r1, activated_at: T2 });

    // 重跑时读到的旧值已经是 r2(目标自身)。
    const fresh = await db.run(SWITCH_POINTER_SQL, r2, source, 'production', r2, T3);
    expect(fresh).toBe(0);
    expect(await pointerOf(source)).toEqual(before);
    expect(judgeActivation({ changes: fresh, target: r2, pointer: await pointerOf(source) })).toBe('already-current');

    // 重跑时仍带着第一次读到的旧值 r1。
    const stale = await db.run(SWITCH_POINTER_SQL, r2, source, 'production', r1, T4);
    expect(stale).toBe(0);
    expect(await pointerOf(source)).toEqual(before);
    expect(judgeActivation({ changes: stale, target: r2, pointer: await pointerOf(source) })).toBe('already-current');
  });

  it('回滚到上一版后重复回滚:幂等成功,指针三列不变', async () => {
    const source = 'act-rollback';
    const r1 = await writeRelease({ source, ready: true });
    const r2 = await writeRelease({ source, ready: true });
    expect(await db.run(ACTIVATE_FIRST_SQL, r1, source, 'production', T1)).toBe(1);
    expect(await db.run(SWITCH_POINTER_SQL, r2, source, 'production', r1, T2)).toBe(1);

    // 回滚:目标取 previous_release,与切换是同一条语句。
    expect(ROLLBACK_POINTER_SQL).toBe(SWITCH_POINTER_SQL);
    const current = await pointerOf(source);
    const target = current?.previous_release ?? '';
    expect(target).toBe(r1);
    const changes = await db.run(
      ROLLBACK_POINTER_SQL,
      target,
      source,
      'production',
      current?.current_release ?? '',
      T3,
    );
    expect(changes).toBe(1);
    const rolledBack = await pointerOf(source);
    expect(rolledBack).toEqual({
      source,
      channel: 'production',
      current_release: r1,
      previous_release: r2,
      activated_at: T3,
    });
    expect(judgeActivation({ changes, target, pointer: rolledBack })).toBe('activated');

    // 重复回滚到同一目标:带新读到的旧值,或带过期的旧值,都不改指针。
    for (const expectedCurrent of [r1, r2]) {
      const again = await db.run(ROLLBACK_POINTER_SQL, r1, source, 'production', expectedCurrent, T4);
      expect(again).toBe(0);
      expect(await pointerOf(source)).toEqual(rolledBack);
      expect(judgeActivation({ changes: again, target: r1, pointer: await pointerOf(source) })).toBe('already-current');
    }
  });

  it('回滚目标必须仍为 ready 且同来源同频道', async () => {
    const source = 'act-rollback-guard';
    const r1 = await writeRelease({ source, ready: true });
    const stillWriting = await writeRelease({ source });
    const foreign = await writeRelease({ source: 'act-rollback-guard-other', ready: true });
    expect(await db.run(ACTIVATE_FIRST_SQL, r1, source, 'production', T1)).toBe(1);
    const before = await pointerOf(source);
    for (const target of [stillWriting, foreign]) {
      const changes = await db.run(ROLLBACK_POINTER_SQL, target, source, 'production', r1, T2);
      expect(changes).toBe(0);
      expect(await pointerOf(source)).toEqual(before);
    }
  });

  it('不同频道的指针互不影响', async () => {
    const source = 'act-channels';
    const preview = await writeRelease({ source, channel: 'preview', ready: true });
    const production = await writeRelease({ source, channel: 'production', ready: true });
    expect(await db.run(ACTIVATE_FIRST_SQL, preview, source, 'preview', T1)).toBe(1);
    expect(await db.run(ACTIVATE_FIRST_SQL, production, source, 'production', T2)).toBe(1);
    expect((await pointerOf(source, 'preview'))?.current_release).toBe(preview);
    expect((await pointerOf(source, 'production'))?.current_release).toBe(production);
  });
});

describe('结果判定', () => {
  const target = 'a'.repeat(64);
  const other = 'b'.repeat(64);

  it.each([
    [1, { current_release: target }, 'activated'],
    [0, { current_release: target }, 'already-current'],
    [0, { current_release: other }, 'rejected'],
    [0, null, 'rejected'],
    [0, undefined, 'rejected'],
    [1, { current_release: other }, 'rejected'],
    [2, { current_release: target }, 'rejected'],
  ] as const)('影响 %i 行、指针 %j → %s', (changes, pointer, outcome) => {
    expect(judgeActivation({ changes, target, pointer })).toBe(outcome);
  });

  it('目标不是合法的版本标识时一律拒绝', () => {
    expect(judgeActivation({ changes: 0, target: '', pointer: { current_release: '' } })).toBe('rejected');
  });
});
