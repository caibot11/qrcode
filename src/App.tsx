import { LocaleProvider } from '@/locales/LocaleContext';
import { AppShell } from '@/app/AppShell';

export function App() {
  return (
    <LocaleProvider>
      <AppShell />
    </LocaleProvider>
  );
}
