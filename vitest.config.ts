import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // 本地 D1(miniflare)启动 workerd 需要一点时间。
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
