import { createContext, useMemo, useState, type ReactNode } from 'react';
import en from './en.json';
import nl from './nl.json';

export type Locale = 'en' | 'nl';

type Strings = Record<string, string>;

const TABLES: Record<Locale, Strings> = {
  en: en as Strings,
  nl: nl as Strings,
};

interface LocaleCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

export const LocaleContext = createContext<LocaleCtx | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en');

  const value = useMemo<LocaleCtx>(() => {
    const table = TABLES[locale];
    return {
      locale,
      setLocale,
      t: (key) => table[key] ?? key,
    };
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
