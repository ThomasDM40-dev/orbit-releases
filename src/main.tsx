import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { useLangState } from './i18n/useLangState'
import ErrorBoundary from './components/ErrorBoundary'
import { ShellProvider } from './shell/ShellContext'

const api = () => (window as any).electronAPI;

// Erreurs JS non gérées (hors rendu React) → rapport auto, throttlé (anti-spam).
const seen = new Map<string, number>();
function reportGlobal(type: string, message: string, stack?: string) {
  const sig = type + '|' + (message || '').slice(0, 160);
  const now = Date.now();
  if (seen.has(sig) && now - (seen.get(sig) || 0) < 60000) return;
  seen.set(sig, now);
  try { api()?.reportError?.({ type, message, stack, context: 'window' }); } catch { /* ignore */ }
}
window.addEventListener('error', (e) => reportGlobal('js-error', e?.message || 'erreur', (e?.error && e.error.stack) || `${e?.filename}:${e?.lineno}:${e?.colno}`));
window.addEventListener('unhandledrejection', (e) => {
  const r: any = e?.reason;
  reportGlobal('js-rejection', (r && r.message) || String(r), r && r.stack);
});

// Remount the whole tree when the language changes so every `t(...)` call
// re-reads the active dictionary without per-component i18n plumbing.
function Root() {
  const lang = useLangState()
  // ShellProvider sits ABOVE the lang-keyed remount so the chosen shell
  // (Classic / Nova) survives language switches.
  return (
    <ShellProvider>
      <App key={lang} />
    </ShellProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>
)
