import { Analytics } from '@vercel/analytics/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { pageviewFilter } from './lib/analytics';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout/shell.css';
import './styles/pages/detail.css';
import './styles/layout/map-search.css';
import './styles/pages/home.css';
import './styles/pages/lists.css';
import './styles/interaction.css';
import './styles/layout/phone.css';
import './styles/loading.css';
import './styles/pages/menu.css';
import './styles/components/bar.css';
import './styles/components/button.css';
import './styles/components/card.css';
import './styles/components/note.css';
import './styles/components/pill.css';
import './styles/text.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics beforeSend={pageviewFilter()} />
  </StrictMode>,
);
