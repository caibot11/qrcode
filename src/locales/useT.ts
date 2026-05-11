import { useContext } from 'react';
import { LocaleContext } from './LocaleContext';

export function useT() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useT must be used inside <LocaleProvider>');
  return ctx;
}
