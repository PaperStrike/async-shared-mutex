import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: 'src/index.ts',
  target: 'es2022',
  platform: 'neutral',
  minify: true,
  exports: {
    legacy: true,
  },
  tsconfig: 'tsconfig.build.json',
  dts: {
    build: true,
  },
})
