// Vercel Routing Middleware: a link to a page in the app (?view= or ?sel=) goes to the page function (server/page.ts, deployed as api/page), which adds
// the page's link preview tags. Home, and every other path, is served as it is.

import { next, rewrite } from '@vercel/functions/middleware';

export const config = { matcher: '/', runtime: 'nodejs' };

export default function middleware(request: Request): Response {
  const url = new URL(request.url);
  if (!url.searchParams.has('view') && !url.searchParams.has('sel')) return next();
  return rewrite(new URL(`/api/page${url.search}`, url.origin));
}
