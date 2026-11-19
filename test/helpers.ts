import { expect } from 'vitest';
import type { z } from 'zod';
import { SiteConfig, createContract, isGitType } from '../contract/index.ts';
import type { Case } from './fixtures/cases.ts';
import { SITE } from './fixtures/samples.ts';

export const contract = createContract(SITE);

/** 用例名 → 带示例站点上下文的 Zod schema。 */
export function contextualSchema(name: string): z.ZodType {
  if (isGitType(name)) return contract.item;
  switch (name) {
    case 'site':
      return SiteConfig;
    case 'frontmatter':
      return contract
        .frontmatter('wiki.site', contract.site.locales[1] ?? '')
        .or(contract.frontmatter('wiki.site', contract.site.defaultLocale));
    case 'taxonomy':
      return contract.taxonomy;
    case 'redirects':
      return contract.redirects;
    case 'navigation':
      return contract.navigation;
    default:
      throw new Error(`未知的 schema:${name}`);
  }
}

export function issuePaths(result: z.ZodSafeParseResult<unknown>): string[] {
  return result.success ? [] : result.error.issues.map((issue) => JSON.stringify(issue.path));
}

/** 合法样本必须通过;非法样本必须被拒,且至少有一条错误恰好指向用例声明的字段。 */
export function expectCase(schema: z.ZodType, testCase: Case): void {
  const result = schema.safeParse(testCase.value);
  if (testCase.valid) {
    expect(issuePaths(result), `${testCase.name} 应通过`).toEqual([]);
    expect(result.success).toBe(true);
    return;
  }
  expect(result.success, `${testCase.name} 应被拒`).toBe(false);
  if (testCase.path !== undefined) {
    expect(issuePaths(result), `${testCase.name} 的错误应指向 ${JSON.stringify(testCase.path)}`).toContain(
      JSON.stringify(testCase.path),
    );
  }
}

/** 断言被拒且错误指向给定字段。 */
export function expectRejectedAt(schema: z.ZodType, value: unknown, path: readonly (string | number)[]): void {
  const result = schema.safeParse(value);
  expect(result.success).toBe(false);
  expect(issuePaths(result)).toContain(JSON.stringify(path));
}

export function expectAccepted(schema: z.ZodType, value: unknown): void {
  const result = schema.safeParse(value);
  expect(issuePaths(result)).toEqual([]);
  expect(result.success).toBe(true);
}
