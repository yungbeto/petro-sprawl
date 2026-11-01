// The page tags function. Its code is server/page.ts, bundled into one file by `npm run build`
// (vite.functions.config.ts): Vercel transpiles api/ file by file, which leaves imports Node can't resolve.
export { GET } from './_dist/page.mjs';
