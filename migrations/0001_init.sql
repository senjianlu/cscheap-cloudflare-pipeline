-- 内容契约 v1 的 D1 表结构。表名、列名、索引必须与 contract/release.ts 的常量一致(由测试核对)。
-- 读取端不建表;每个请求先取频道指针,其后所有查询显式带 release_id。

-- 一次发布。status: writing → ready;ready 之后该版本的全部行不可变。
CREATE TABLE releases (
  release_id TEXT NOT NULL PRIMARY KEY,
  source TEXT NOT NULL,
  channel TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  contract_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('writing', 'ready')),
  expected TEXT NOT NULL CHECK (json_valid(expected)),
  assets_verified INTEGER NOT NULL DEFAULT 0 CHECK (assets_verified IN (0, 1)),
  site TEXT NOT NULL CHECK (json_valid(site)),
  created_at TEXT NOT NULL
) STRICT;

-- 频道指针:发布完成后唯一会被改写的行。某来源某频道从未激活时没有这一行。
CREATE TABLE channel_pointers (
  source TEXT NOT NULL,
  channel TEXT NOT NULL,
  current_release TEXT NOT NULL REFERENCES releases (release_id),
  previous_release TEXT REFERENCES releases (release_id),
  activated_at TEXT NOT NULL,
  PRIMARY KEY (source, channel)
) STRICT;

-- 内容寻址的正文对象:不可变,跨版本去重。body 是页对象的规范 JSON。
CREATE TABLE objects (
  sha256 TEXT NOT NULL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('page')),
  size INTEGER NOT NULL CHECK (size >= 0),
  body TEXT NOT NULL
) STRICT;

-- 语言无关的一行。
CREATE TABLE entries (
  release_id TEXT NOT NULL REFERENCES releases (release_id),
  type TEXT NOT NULL,
  id TEXT NOT NULL,
  slug TEXT NOT NULL,
  category TEXT,
  published_at TEXT,
  updated_at TEXT,
  noindex INTEGER NOT NULL DEFAULT 0 CHECK (noindex IN (0, 1)),
  meta TEXT NOT NULL CHECK (json_valid(meta)),
  data TEXT NOT NULL CHECK (json_valid(data)),
  PRIMARY KEY (release_id, type, id)
) STRICT;

CREATE UNIQUE INDEX entries_release_type_slug ON entries (release_id, type, slug);
CREATE INDEX entries_release_type_published ON entries (release_id, type, published_at DESC);
CREATE INDEX entries_release_type_category_published ON entries (release_id, type, category, published_at DESC);

-- 译文行。object_sha256 为空 = 该语言没有正文。
CREATE TABLE entry_locales (
  release_id TEXT NOT NULL REFERENCES releases (release_id),
  type TEXT NOT NULL,
  id TEXT NOT NULL,
  locale TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  seo_title TEXT,
  summary TEXT,
  image_alt TEXT,
  l10n TEXT CHECK (l10n IS NULL OR json_valid(l10n)),
  object_sha256 TEXT,
  PRIMARY KEY (release_id, type, id, locale)
) STRICT;

CREATE INDEX entry_locales_release_locale_type ON entry_locales (release_id, locale, type);

-- 标签成员。
CREATE TABLE entry_tags (
  release_id TEXT NOT NULL REFERENCES releases (release_id),
  tag TEXT NOT NULL,
  type TEXT NOT NULL,
  id TEXT NOT NULL,
  PRIMARY KEY (release_id, tag, type, id)
) STRICT;

-- 正向引用边。source_locale 为空串 = 语言无关(信封 refs)。
-- 全部列都在主键里,用 WITHOUT ROWID:二级索引自带其余主键列,反向查询只读索引、不回表。
CREATE TABLE links (
  release_id TEXT NOT NULL REFERENCES releases (release_id),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_locale TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_key TEXT NOT NULL,
  rel TEXT NOT NULL,
  PRIMARY KEY (release_id, source_type, source_id, source_locale, target_type, target_key, rel)
) STRICT, WITHOUT ROWID;

-- 反向链接按 (release_id, target_type, target_key) 查询。
CREATE INDEX links_release_target ON links (release_id, target_type, target_key, source_type);

-- 重定向。locale 为 '*' = 对全部语言生效。
CREATE TABLE redirects (
  release_id TEXT NOT NULL REFERENCES releases (release_id),
  locale TEXT NOT NULL,
  from_path TEXT NOT NULL,
  to_path TEXT NOT NULL,
  status INTEGER NOT NULL CHECK (status IN (301, 308)),
  PRIMARY KEY (release_id, locale, from_path)
) STRICT;

-- 该版本引用的 R2 资源清单。路径由 sha256 与 name 按契约生成。
CREATE TABLE release_assets (
  release_id TEXT NOT NULL REFERENCES releases (release_id),
  sha256 TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size >= 0),
  PRIMARY KEY (release_id, sha256, name)
) STRICT;

-- 词表项与各语言标签。
CREATE TABLE taxonomy_terms (
  release_id TEXT NOT NULL REFERENCES releases (release_id),
  vocabulary TEXT NOT NULL,
  term TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  PRIMARY KEY (release_id, vocabulary, term)
) STRICT;

-- 导航树(每种语言一行)。不用导航的使用方不写此表。
CREATE TABLE nav (
  release_id TEXT NOT NULL REFERENCES releases (release_id),
  locale TEXT NOT NULL,
  tree TEXT NOT NULL CHECK (json_valid(tree)),
  PRIMARY KEY (release_id, locale)
) STRICT;
