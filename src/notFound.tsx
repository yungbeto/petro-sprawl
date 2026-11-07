// The 404 page (404.html), served by Vercel for any path the build doesn't have. Its own small entry, so a
// wrong link doesn't load the map: the brand, a way home, and the menu's oil in a deeper tank to stir.

import { Analytics } from '@vercel/analytics/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NotFound } from './app/NotFound';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout/shell.css';
import './styles/pages/not-found.css';
import './styles/text.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NotFound />
    <Analytics />
  </StrictMode>,
);
