import { Analytics } from '@vercel/analytics/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { pageviewFilter } from './lib/analytics';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components/bar.css';
import './styles/text.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics beforeSend={pageviewFilter()} />
  </StrictMode>,
);
