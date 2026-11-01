// Link previews: a link to a page in the app (?view= or ?sel=) gets index.html with that page's title,
// description and card image in place of Home's (src/lib/share.ts). middleware.ts sends those links here.

import { withShareTags } from '../src/lib/share';
import { findCard, SHARE_CACHE } from './share';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  try {
    const [page, found] = await Promise.all([
      fetch(new URL('/index.html', url.origin)).then((r) => {
        if (!r.ok) throw new Error(`index.html: ${r.status}`);
        return r.text();
      }),
      findCard(url),
    ]);
    const html = found
      ? withShareTags(page, found.card, { url: `${url.origin}/${found.query}`, image: `${url.origin}/api/og${found.query}` })
      : page;
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': SHARE_CACHE } });
  } catch {
    // Never keep anyone from the app over a preview: hand over the plain page, same query.
    return Response.redirect(new URL(`/index.html${url.search}`, url.origin), 307);
  }
}
