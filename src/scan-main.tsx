import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '@/locales/LocaleContext';
import { ScanApp } from '@/app/ScanApp';
import '@/styles/tokens.css';
import '@/styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <ScanApp />
    </LocaleProvider>
  </StrictMode>,
);
