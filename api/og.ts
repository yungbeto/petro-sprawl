// The card image function. Its code is server/og.tsx, bundled into one file by `npm run build`
// (vite.functions.config.ts): Vercel transpiles api/ file by file, which leaves imports Node can't resolve.
export { GET } from './_dist/og.mjs';
