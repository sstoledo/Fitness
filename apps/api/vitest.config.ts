import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    // SWC emits decorator metadata (design:paramtypes), required for Nest DI.
    swc.vite(),
    tsconfigPaths(),
  ],
  test: {
    root: '.',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['test/**'],
  },
});