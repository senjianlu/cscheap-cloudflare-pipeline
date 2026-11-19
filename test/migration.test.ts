// TC-14:迁移在本地 D1 上的集成测试——结构与契约常量一致;写入一版含 §1.2 全部字段的数据并读回。
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CONTRACT_VERSION,
  EntryRow,
  type ExpectedCounts,
  INDEXES,
  INSERT_OBJECT_SQL,
  type Item,
  PageObject,
  ReleaseRow,
  SiteSnapshot,
  TABLES,
  TABLE_NAMES,
  encodePageObject,
  finalizeAsset,
  manifestKey,
  sha256Hex,
  toEntryLocaleRow,
  toEntryRow,
  toEntryTagRows,
  toNavRows,
  toRedirectRows,
  toRefLinkRows,
  toReleaseAssetRow,
  toTaxonomyTermRows,
  utf8ByteLength,
} from '../contract/index.ts';
import { INPUT_CASES } from './fixtures/cases.ts';
import { DIGEST_A, fullItem, mainFrontmatter, translationFrontmatter, validItem } from './fixtures/samples.ts';
import { type TestDb, migrationStatements, openTestDb } from './d1.ts';
import { contract } from './helpers.ts';

let db: TestDb;

beforeAll(async () => {
  db = await openTestDb();
});

afterAll(async () => {
  await db.dispose();
});

const input = (name: string) => {
  const found = INPUT_CASES.find((testCase) => testCase.name.startsWith(name));
  if (found === undefined) throw new Error(`缺少用例:${name}`);
  return found.value;
};

describe('迁移:结构与契约常量一致', () => {
  it('迁移成功,表集合与 TABLES 一致', async () => {
    expect(migrationStatements().length).toBe(TABLE_NAMES.length + INDEXES.length);
    const tables = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'",
    );
    expect(tables.map((table) => table.name).sort()).toEqual(TABLE_NAMES.map((key) => TABLES[key].name).sort());
  });

  it.each(TABLE_NAMES)('%s:列与主键一致', async (key) => {
    const table = TABLES[key];
    expect(table.name).toBe(key);
    const columns = await db.all<{ name: string; pk: number; cid: number }>(`PRAGMA table_info(${table.name})`);
    expect(columns.sort((a, b) => a.cid - b.cid).map((column) => column.name)).toEqual([...table.columns]);
    const primaryKey = columns
      .filter((column) => column.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((column) => column.name);
    expect(primaryKey).toEqual([...table.primaryKey]);
  });

  it('索引与 INDEXES 一致(名称、所属表、唯一性、列与排序方向)', async () => {
    const indexes = await db.all<{ name: string; tbl_name: string }>(
      "SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL",
    );
    expect(indexes.map((index) => index.name).sort()).toEqual(INDEXES.map((index) => index.name).sort());

    for (const expected of INDEXES) {
      const found = indexes.find((index) => index.name === expected.name);
      expect(found?.tbl_name).toBe(TABLES[expected.table].name);
      const list = await db.all<{ name: string; unique: number }>(`PRAGMA index_list(${TABLES[expected.table].name})`);
      expect(list.find((index) => index.name === expected.name)?.unique).toBe(expected.unique ? 1 : 0);
      const columns = await db.all<{ seqno: number; name: string | null; desc: number; key: number }>(
        `PRAGMA index_xinfo(${expected.name})`,
      );
      const keyColumns = columns.filter((column) => column.key === 1).sort((a, b) => a.seqno - b.seqno);
      expect(keyColumns.map((column) => ({ name: column.name, desc: column.desc === 1 }))).toEqual(
        expected.columns.map((column) => ({ name: column.name, desc: column.desc === true })),
      );
    }
  });
});

describe('迁移:写入一版含全部映射字段的数据并读回', () => {
  const source = 'example';
  const channel = 'production';
  const commit = '0123456789abcdef0123456789abcdef01234567';
  let releaseId: string;
  let item: Item;
  let assetRefs: Record<string, string>;
  let pageDigest: string;
  let expected: ExpectedCounts;

  beforeAll(async () => {
    releaseId = await sha256Hex(new TextEncoder().encode(`${source}/${channel}/${commit}`));
    item = contract.item.parse({
      ...fullItem('blog.post'),
      data: { series: 'market-basics', heroImage: 'hero.webp' },
      icon: { image: 'icon.svg', imageDark: 'https://cdn.example.com/icon-dark.svg', width: 32, height: 32 },
    });

    // 1. 资源定稿:相对路径 → 内容寻址的引用。
    const assets = await Promise.all(
      ['og.png', 'icon.svg', 'nav-dark.png'].map((name) =>
        finalizeAsset({ name, bytes: new TextEncoder().encode(`bytes of ${name}`) }),
      ),
    );
    assetRefs = Object.fromEntries(assets.map((asset) => [asset.name, asset.ref]));
    const resolve = (path: string): string => {
      const ref = assetRefs[path];
      if (ref === undefined) throw new Error(`未定稿的资源:${path}`);
      return ref;
    };

    // 2. 正文对象(只有主稿有正文;译文行的 object_sha256 为空以覆盖两种情形)。
    const page = PageObject.parse({
      schemaVersion: 1,
      type: item.type,
      id: item.id,
      locale: 'en',
      body: {
        type: 'root',
        children: [
          { type: 'element', tagName: 'img', properties: { src: resolve('og.png'), alt: 'Hero' }, children: [] },
        ],
      },
      toc: [],
      structuredData: { headings: [], contents: [] },
    });
    const pageText = encodePageObject(page);
    pageDigest = await sha256Hex(new TextEncoder().encode(pageText));

    const main = contract.frontmatter('blog.post', 'en').parse({
      ...mainFrontmatter(),
      seoTitle: 'Sample SEO title',
      summary: 'Sample summary.',
      imageAlt: 'A sample image',
    });
    const translation = contract.frontmatter('blog.post', 'fr').parse({
      ...translationFrontmatter(),
      imageAlt: 'Une image',
    });

    const rows = {
      entries: [toEntryRow(releaseId, item, resolve)],
      entry_locales: [
        toEntryLocaleRow(releaseId, item, 'en', main, pageDigest),
        toEntryLocaleRow(releaseId, item, 'fr', translation, null),
      ],
      entry_tags: toEntryTagRows(releaseId, item),
      links: toRefLinkRows(releaseId, item),
      redirects: toRedirectRows(releaseId, contract.redirects.parse(input('重定向:合法'))),
      release_assets: assets.map((asset) => toReleaseAssetRow(releaseId, asset)),
      taxonomy_terms: [
        ...toTaxonomyTermRows(releaseId, contract.taxonomy.parse(input('词表:authors'))),
        ...toTaxonomyTermRows(releaseId, contract.taxonomy.parse(input('词表:tags'))),
      ],
      nav: toNavRows(releaseId, contract.navigation.parse(input('导航:分组带四种图标形态')), contract.site, resolve),
    };
    expected = {
      entries: rows.entries.length,
      entry_locales: rows.entry_locales.length,
      entry_tags: rows.entry_tags.length,
      links: rows.links.length,
      redirects: rows.redirects.length,
      release_assets: rows.release_assets.length,
      taxonomy_terms: rows.taxonomy_terms.length,
      nav: rows.nav.length,
      objects: 1,
    };

    // 3. 写入:objects → releases → 各表行。
    expect(await db.run(INSERT_OBJECT_SQL, pageDigest, 'page', utf8ByteLength(pageText), pageText)).toBe(1);
    expect(await db.run(INSERT_OBJECT_SQL, pageDigest, 'page', utf8ByteLength(pageText), pageText)).toBe(0);
    await db.insert('releases', {
      release_id: releaseId,
      source,
      channel,
      commit_sha: commit,
      contract_version: CONTRACT_VERSION,
      status: 'writing',
      expected,
      assets_verified: 0,
      site: contract.snapshot(),
      created_at: '2026-03-01T00:00:00Z',
    });
    for (const [table, tableRows] of Object.entries(rows)) {
      for (const row of tableRows) expect(await db.insert(table as keyof typeof rows, row)).toBe(1);
    }
  });

  const json = (text: unknown): unknown => JSON.parse(String(text));

  it('releases:版本行与 site 快照逐字段相符', async () => {
    const row = await db.first('SELECT * FROM releases WHERE release_id = ?1', releaseId);
    const parsed = ReleaseRow.parse({ ...row, expected: json(row?.['expected']), site: json(row?.['site']) });
    expect(parsed).toEqual({
      release_id: releaseId,
      source,
      channel,
      commit_sha: commit,
      contract_version: 1,
      status: 'writing',
      expected,
      assets_verified: 0,
      site: {
        locales: ['en', 'fr'],
        defaultLocale: 'en',
        types: contract.site.types,
        assetHosts: ['cdn.example.com'],
      },
      created_at: '2026-03-01T00:00:00Z',
    });
    expect(SiteSnapshot.parse(parsed.site)).toEqual(contract.snapshot());
    expect(manifestKey(parsed.source, parsed.release_id)).toBe(`example/releases/${releaseId}/manifest.json`);
  });

  it('entries:type、id、slug、category、时间、noindex、meta(作者、来源、SEO、图标)、data 相符', async () => {
    const row = await db.first(
      'SELECT * FROM entries WHERE release_id = ?1 AND type = ?2 AND id = ?3',
      releaseId,
      item.type,
      item.id,
    );
    expect(row).toMatchObject({
      release_id: releaseId,
      type: 'blog.post',
      id: 'sample',
      slug: 'sample',
      category: 'news',
      // 发布列里的时间已规范化为小数固定九位。
      published_at: '2026-01-03T00:00:00.000000000Z',
      updated_at: '2026-02-01T12:00:00.000000000Z',
      noindex: 1,
    });
    expect(json(row?.['meta'])).toEqual({
      authors: ['alice', 'bob'],
      sources: [
        { kind: 'url', url: 'https://example.com/source', retrievedAt: '2026-01-01T00:00:00Z' },
        { kind: 'project', id: 'sample-project' },
      ],
      canonical: '/en/blog/sample',
      ogImage: assetRefs['og.png'],
      icon: {
        image: assetRefs['icon.svg'],
        imageDark: 'https://cdn.example.com/icon-dark.svg',
        width: 32,
        height: 32,
      },
    });
    // data 原样写入。
    expect(json(row?.['data'])).toEqual({ series: 'market-basics', heroImage: 'hero.webp' });
    // stage、workflow、schemaVersion 不发布。
    expect(Object.keys(row ?? {}).sort()).toEqual([...TABLES.entries.columns].sort());
    expect(String(row?.['meta'])).not.toContain('workflow');
  });

  it('entry_locales:title、description、summary、l10n、seo_title、image_alt、object_sha256 相符', async () => {
    const rows = await db.all('SELECT * FROM entry_locales WHERE release_id = ?1 ORDER BY locale', releaseId);
    expect(rows).toEqual([
      {
        release_id: releaseId,
        type: 'blog.post',
        id: 'sample',
        locale: 'en',
        title: 'Sample title',
        description: 'Sample description.',
        seo_title: 'Sample SEO title',
        summary: 'Sample summary.',
        image_alt: 'A sample image',
        l10n: null,
        object_sha256: pageDigest,
      },
      {
        release_id: releaseId,
        type: 'blog.post',
        id: 'sample',
        locale: 'fr',
        title: 'Titre',
        description: 'Description.',
        seo_title: null,
        summary: null,
        image_alt: 'Une image',
        l10n: null,
        object_sha256: null,
      },
    ]);
    // sourceDigest 不发布。
    expect(JSON.stringify(rows)).not.toContain(DIGEST_A);
  });

  it('l10n 与无正文的译文行可往返', async () => {
    const site = contract.itemOf('wiki.site').parse({
      ...fullItem('wiki.site'),
      id: 'example-market',
      slug: 'example-market',
      seo: { noindex: false },
      icon: false,
    });
    expect(await db.insert('entries', toEntryRow(releaseId, site))).toBe(1);
    // 首版没有类型声明 l10n 的键;这里直接构造一行来核对该列的往返。
    const frontmatter = {
      ...contract.frontmatter('wiki.site', 'en').parse(mainFrontmatter()),
      l10n: { tagline: 'Trade safely.' },
    };
    expect(await db.insert('entry_locales', toEntryLocaleRow(releaseId, site, 'en', frontmatter, null))).toBe(1);
    const row = await db.first(
      "SELECT e.noindex, e.meta, l.l10n, l.object_sha256 FROM entries AS e JOIN entry_locales AS l USING (release_id, type, id) WHERE e.release_id = ?1 AND e.type = 'wiki.site'",
      releaseId,
    );
    expect(row?.['noindex']).toBe(0);
    expect(json(row?.['meta'])).toMatchObject({ icon: false });
    expect(json(row?.['l10n'])).toEqual({ tagline: 'Trade safely.' });
    expect(row?.['object_sha256']).toBeNull();
    await db.run("DELETE FROM entry_locales WHERE release_id = ?1 AND type = 'wiki.site'", releaseId);
    await db.run("DELETE FROM entries WHERE release_id = ?1 AND type = 'wiki.site'", releaseId);
  });

  it('entry_tags、links、redirects、taxonomy_terms、nav 相符', async () => {
    expect(await db.all('SELECT tag, type, id FROM entry_tags WHERE release_id = ?1 ORDER BY tag', releaseId)).toEqual([
      { tag: 'guide', type: 'blog.post', id: 'sample' },
      { tag: 'market', type: 'blog.post', id: 'sample' },
    ]);
    expect(
      await db.all(
        'SELECT source_type, source_id, source_locale, target_type, target_key, rel FROM links WHERE release_id = ?1 ORDER BY rel',
        releaseId,
      ),
    ).toEqual([
      {
        source_type: 'blog.post',
        source_id: 'sample',
        source_locale: '',
        target_type: 'wiki.site',
        target_key: 'example-market',
        rel: 'about',
      },
      {
        source_type: 'blog.post',
        source_id: 'sample',
        source_locale: '',
        target_type: 'item',
        target_key: 'skins/Example-Item_1',
        rel: 'mentions',
      },
    ]);
    expect(
      await db.all(
        'SELECT locale, from_path, to_path, status FROM redirects WHERE release_id = ?1 ORDER BY from_path',
        releaseId,
      ),
    ).toEqual([
      { locale: 'en', from_path: '/en/blog/old-sample', to_path: '/en/blog/sample', status: 301 },
      { locale: '*', from_path: '/legacy', to_path: '/en/blog/sample', status: 308 },
    ]);
    const terms = await db.all<{ vocabulary: string; term: string; data: string }>(
      'SELECT vocabulary, term, data FROM taxonomy_terms WHERE release_id = ?1 ORDER BY vocabulary, term',
      releaseId,
    );
    expect(terms.map((term) => ({ ...term, data: json(term.data) }))).toEqual([
      {
        vocabulary: 'authors',
        term: 'alice',
        data: { labels: { en: 'Alice', fr: 'Alice' }, url: 'https://example.com/alice' },
      },
      { vocabulary: 'authors', term: 'bob', data: { labels: { en: 'Bob' } } },
      { vocabulary: 'tags', term: 'guide', data: { labels: { en: 'Guide', fr: 'Guide' } } },
      { vocabulary: 'tags', term: 'market', data: { labels: { en: 'Market' } } },
    ]);
    const nav = await db.first<{ tree: string }>(
      "SELECT tree FROM nav WHERE release_id = ?1 AND locale = 'fr'",
      releaseId,
    );
    expect(json(nav?.tree)).toEqual([
      { title: 'Par défaut', pages: ['docs.page:sample'] },
      { title: 'Hidden icon', icon: false, pages: ['docs.page:sample', 'docs.api:list-markets'] },
      { title: 'Named icon', icon: 'book-open', pages: [] },
      {
        title: 'Image icon',
        icon: { image: 'https://cdn.example.com/nav.png', imageDark: assetRefs['nav-dark.png'], width: 24, height: 24 },
        pages: ['wiki.site:example-market'],
      },
    ]);
  });

  it('release_assets 与 objects:资源清单、正文对象相符', async () => {
    const assets = await db.all<{ sha256: string; name: string; mime: string; size: number }>(
      'SELECT sha256, name, mime, size FROM release_assets WHERE release_id = ?1 ORDER BY name',
      releaseId,
    );
    expect(assets.map((asset) => asset.name)).toEqual(['icon.svg', 'nav-dark.png', 'og.png']);
    for (const asset of assets) {
      expect(`/assets/${asset.sha256}/${asset.name}`).toBe(assetRefs[asset.name]);
      expect(asset.size).toBe(`bytes of ${asset.name}`.length);
    }
    expect(assets.map((asset) => asset.mime)).toEqual(['image/svg+xml', 'image/png', 'image/png']);

    const object = await db.first<{ kind: string; size: number; body: string }>(
      'SELECT kind, size, body FROM objects WHERE sha256 = ?1',
      pageDigest,
    );
    expect(object?.kind).toBe('page');
    expect(object?.size).toBe(utf8ByteLength(object?.body ?? ''));
    expect(await sha256Hex(new TextEncoder().encode(object?.body ?? ''))).toBe(pageDigest);
    const page = PageObject.parse(json(object?.body));
    expect(JSON.stringify(page.body)).toContain(assetRefs['og.png']);
  });

  it('约束:主键、唯一 slug、取值检查与外键生效', async () => {
    const entry = toEntryRow(releaseId, item, (path) => assetRefs[path] ?? '');
    await expect(db.insert('entries', entry)).rejects.toThrow();
    await expect(db.insert('entries', { ...entry, id: 'another' })).rejects.toThrow(/UNIQUE/i);
    await expect(db.insert('entries', { ...entry, id: 'third', slug: 'third', release_id: DIGEST_A })).rejects.toThrow(
      /FOREIGN KEY/i,
    );
    await expect(db.run("UPDATE releases SET status = 'done' WHERE release_id = ?1", releaseId)).rejects.toThrow(
      /CHECK/i,
    );
    await expect(db.run('UPDATE releases SET assets_verified = 2 WHERE release_id = ?1', releaseId)).rejects.toThrow(
      /CHECK/i,
    );
    await expect(db.run("UPDATE entries SET meta = 'not json' WHERE release_id = ?1", releaseId)).rejects.toThrow(
      /CHECK/i,
    );
  });
});

describe('迁移:发布时间规范化后,按文本排序即按时间排序', () => {
  // 输入里的写法:无小数与不同小数位数混排。按原样的文本倒序,「…00Z」会排在更晚的「…00.5Z」前面。
  const INPUTS = [
    ['t0', '2026-01-01T00:00:00Z'],
    ['t1', '2026-01-01T00:00:00.000000001Z'],
    ['t2', '2026-01-01T00:00:00.0001Z'],
    ['t3', '2026-01-01T00:00:00.0009Z'],
    ['t4', '2026-01-01T00:00:00.25Z'],
    ['t5', '2026-01-01T00:00:00.5Z'],
    ['t6', '2026-01-01T00:00:00.500000001Z'],
    ['t7', '2026-01-01T00:00:01Z'],
    ['t8', '2026-01-01T00:00:01.000Z'],
    ['t9', '2026-01-01T00:00:10Z'],
  ] as const;
  let releaseId: string;

  beforeAll(async () => {
    releaseId = await sha256Hex(new TextEncoder().encode('ordering-release'));
    await db.insert('releases', {
      release_id: releaseId,
      source: 'ordering',
      channel: 'production',
      commit_sha: 'd'.repeat(40),
      contract_version: CONTRACT_VERSION,
      status: 'writing',
      expected: { entries: INPUTS.length },
      assets_verified: 0,
      site: contract.snapshot(),
      created_at: '2026-03-01T00:00:00Z',
    });
    // 打乱插入顺序;t0–t9 走 publishedAt,另加一条 publishedAt 缺省、取 workflow 时间的条目。
    for (const index of [5, 0, 8, 2, 9, 4, 1, 7, 3, 6]) {
      const [id, publishedAt] = INPUTS[index] ?? INPUTS[0];
      const item = contract.itemOf('docs.page').parse({ ...validItem('docs.page'), id, slug: id, publishedAt });
      expect(await db.insert('entries', toEntryRow(releaseId, item))).toBe(1);
    }
    const fromWorkflow = contract.itemOf('docs.page').parse({
      ...validItem('docs.page'),
      id: 'tw',
      slug: 'tw',
      workflow: [{ stage: 'published', by: 'editor', at: '2026-01-01T00:00:00.75Z' }],
    });
    expect(await db.insert('entries', toEntryRow(releaseId, fromWorkflow))).toBe(1);
  });

  it('原样的写法按文本排序是错的(说明规范化的必要)', () => {
    const raw = INPUTS.map(([, time]) => time);
    const byText = [...raw].sort().reverse();
    expect(byText.indexOf('2026-01-01T00:00:00Z')).toBeLessThan(byText.indexOf('2026-01-01T00:00:00.5Z'));
  });

  it('写入的列是定宽的规范写法,精度不丢', async () => {
    const rows = await db.all<{ id: string; published_at: string }>(
      'SELECT id, published_at FROM entries WHERE release_id = ?1 ORDER BY id',
      releaseId,
    );
    expect(rows).toHaveLength(INPUTS.length + 1);
    for (const row of rows) expect(row.published_at).toMatch(/^2026-01-01T00:00:\d{2}\.\d{9}Z$/);
    const byId = Object.fromEntries(rows.map((row) => [row.id, row.published_at]));
    expect(byId['t0']).toBe('2026-01-01T00:00:00.000000000Z');
    expect(byId['t1']).toBe('2026-01-01T00:00:00.000000001Z');
    expect(byId['t3']).toBe('2026-01-01T00:00:00.000900000Z');
    expect(byId['t6']).toBe('2026-01-01T00:00:00.500000001Z');
    expect(byId['tw']).toBe('2026-01-01T00:00:00.750000000Z');
    // 同一时刻的不同写法得到同一个值。
    expect(byId['t7']).toBe(byId['t8']);
    for (const row of rows) expect(EntryRow.shape.published_at.safeParse(row.published_at).success).toBe(true);
    expect(EntryRow.shape.published_at.safeParse('2026-01-01T00:00:00Z').success).toBe(false);
  });

  it('按 published_at 倒序的列表查询返回真实的时间顺序,且走索引', async () => {
    const sql = 'SELECT id FROM entries WHERE release_id = ?1 AND type = ?2 ORDER BY published_at DESC, id DESC';
    const rows = await db.all<{ id: string }>(sql, releaseId, 'docs.page');
    expect(rows.map((row) => row.id)).toEqual(['t9', 't8', 't7', 'tw', 't6', 't5', 't4', 't3', 't2', 't1', 't0']);

    const ascending = await db.all<{ id: string }>(
      'SELECT id FROM entries WHERE release_id = ?1 AND type = ?2 ORDER BY published_at ASC, id ASC',
      releaseId,
      'docs.page',
    );
    expect(ascending.map((row) => row.id)).toEqual(['t0', 't1', 't2', 't3', 't4', 't5', 't6', 'tw', 't7', 't8', 't9']);

    const newest = await db.all<{ id: string }>(
      'SELECT id FROM entries WHERE release_id = ?1 AND type = ?2 AND published_at > ?3 ORDER BY published_at DESC',
      releaseId,
      'docs.page',
      '2026-01-01T00:00:00.500000000Z',
    );
    expect(newest.map((row) => row.id).sort()).toEqual(['t6', 't7', 't8', 't9', 'tw']);

    const plan = await db.all<{ detail: string }>(
      'EXPLAIN QUERY PLAN SELECT id FROM entries WHERE release_id = ?1 AND type = ?2 ORDER BY published_at DESC LIMIT 5',
      releaseId,
      'docs.page',
    );
    expect(plan.map((row) => row.detail).join('\n')).toContain('entries_release_type_published');
  });

  it('updated_at 同样规范化;缺省的时间记为 NULL', () => {
    const item = contract.itemOf('docs.page').parse({
      ...validItem('docs.page'),
      stage: 'draft',
      workflow: [{ stage: 'draft', by: 'author', at: '2026-01-01T00:00:00Z' }],
      updatedAt: '2026-02-01T12:00:00.12Z',
    });
    const row = toEntryRow(releaseId, item);
    expect(row.updated_at).toBe('2026-02-01T12:00:00.120000000Z');
    expect(row.published_at).toBeNull();
  });
});

describe('迁移:查询命中索引', () => {
  const plan = async (sql: string, ...params: (string | number)[]): Promise<string> => {
    const rows = await db.all<{ detail: string }>(`EXPLAIN QUERY PLAN ${sql}`, ...params);
    return rows.map((row) => row.detail).join('\n');
  };

  it('按 (release_id, target_type, target_key) 的反向查询不出现全表扫描', async () => {
    const detail = await plan(
      'SELECT source_type, source_id, source_locale, rel FROM links WHERE release_id = ?1 AND target_type = ?2 AND target_key = ?3',
      DIGEST_A,
      'wiki.site',
      'example-market',
    );
    expect(detail).toContain('links_release_target');
    expect(detail).toMatch(/SEARCH/);
    expect(detail).not.toMatch(/SCAN/);
  });

  it('按类型的时间倒序列表、按分类的列表、按 slug 取单页、按语言取译文都命中索引', async () => {
    const list = await plan(
      'SELECT id, slug FROM entries WHERE release_id = ?1 AND type = ?2 ORDER BY published_at DESC LIMIT 20',
      DIGEST_A,
      'blog.post',
    );
    expect(list).toContain('entries_release_type_published');
    expect(list).not.toMatch(/SCAN|TEMP B-TREE/);

    const byCategory = await plan(
      'SELECT id, slug FROM entries WHERE release_id = ?1 AND type = ?2 AND category = ?3 ORDER BY published_at DESC LIMIT 20',
      DIGEST_A,
      'blog.post',
      'news',
    );
    expect(byCategory).toContain('entries_release_type_category_published');
    expect(byCategory).not.toMatch(/SCAN|TEMP B-TREE/);

    const bySlug = await plan(
      'SELECT id FROM entries WHERE release_id = ?1 AND type = ?2 AND slug = ?3',
      DIGEST_A,
      'blog.post',
      'sample',
    );
    expect(bySlug).toContain('entries_release_type_slug');
    expect(bySlug).not.toMatch(/SCAN/);

    const byLocale = await plan(
      'SELECT id, title FROM entry_locales WHERE release_id = ?1 AND locale = ?2 AND type = ?3',
      DIGEST_A,
      'en',
      'blog.post',
    );
    expect(byLocale).toContain('entry_locales_release_locale_type');
    expect(byLocale).not.toMatch(/SCAN/);
  });
});
