// 本地 D1(miniflare)测试辅助:起一个内存里的数据库并应用迁移。不访问任何远端资源。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { type TableName, insertSql, rowParams } from '../contract/index.ts';

type Param = string | number | null;

interface D1Result<Row> {
  results: Row[];
  meta: { changes: number };
}

interface D1Statement {
  bind(...values: Param[]): D1Statement;
  run<Row = Record<string, unknown>>(): Promise<D1Result<Row>>;
  all<Row = Record<string, unknown>>(): Promise<D1Result<Row>>;
  first<Row = Record<string, unknown>>(): Promise<Row | null>;
}

/** 测试用到的 D1 接口子集(miniflare 返回的对象满足它)。 */
interface D1 {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown[]>;
}

export const MIGRATION_PATH = fileURLToPath(new URL('../migrations/0001_init.sql', import.meta.url));

/** 去掉注释后按分号拆成单条语句(迁移里没有含分号的字符串字面量)。 */
export function migrationStatements(): string[] {
  return readFileSync(MIGRATION_PATH, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

export interface TestDb {
  all<Row = Record<string, unknown>>(sql: string, ...params: Param[]): Promise<Row[]>;
  first<Row = Record<string, unknown>>(sql: string, ...params: Param[]): Promise<Row | null>;
  /** 执行一条写语句,返回影响的行数。 */
  run(sql: string, ...params: Param[]): Promise<number>;
  /** 按契约的列顺序整行插入。 */
  insert(table: TableName, row: Record<string, unknown>): Promise<number>;
  dispose(): Promise<void>;
}

export async function openTestDb(): Promise<TestDb> {
  const miniflare = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response(null, { status: 204 }); } };',
    d1Databases: ['DB'],
  });
  const db = (await miniflare.getD1Database('DB')) as unknown as D1;
  await db.batch(migrationStatements().map((statement) => db.prepare(statement)));

  const testDb: TestDb = {
    async all<Row>(sql: string, ...params: Param[]) {
      return (
        await db
          .prepare(sql)
          .bind(...params)
          .all<Row>()
      ).results;
    },
    first<Row>(sql: string, ...params: Param[]) {
      return db
        .prepare(sql)
        .bind(...params)
        .first<Row>();
    },
    async run(sql, ...params) {
      return (
        await db
          .prepare(sql)
          .bind(...params)
          .run()
      ).meta.changes;
    },
    insert(table, row) {
      return testDb.run(insertSql(table), ...rowParams(table, row));
    },
    dispose() {
      return miniflare.dispose();
    },
  };
  return testDb;
}
