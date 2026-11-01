// The link preview functions (server/), each bundled into one ES module in api/_dist/ for Vercel to deploy
// from api/og.ts and api/page.ts. Everything is inlined but @vercel/og, which loads its own wasm and font
// files from its package, so Vercel traces it from node_modules. Run by `npm run build`.

import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    ssr: true,
    outDir: 'api/_dist',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rolldownOptions: {
      input: { og: 'server/og.tsx', page: 'server/page.ts' },
      output: { format: 'es', entryFileNames: '[name].mjs', chunkFileNames: '[name]-[hash].mjs' },
    },
  },
  ssr: { noExternal: true, external: ['@vercel/og'] },
});
