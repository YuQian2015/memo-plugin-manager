import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  splitting: false,
  sourcemap: false,
  clean: true,
  dts: true,
  format: ['cjs'],
  target: 'node16',
  noExternal: ['unzip-stream'],
})
