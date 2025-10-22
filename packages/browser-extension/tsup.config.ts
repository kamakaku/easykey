import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    background: 'src/background.ts',
    content: 'src/content.ts',
    popup: 'src/popup/index.ts',
  },
  format: ['esm'],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  target: 'chrome128',
  minify: false
});
