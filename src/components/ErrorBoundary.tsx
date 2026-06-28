import React from 'react';
import { t } from '@/i18n';

const api = () => (window as any).electronAPI;

type Props = { children: React.ReactNode };
type State = { error: Error | null; info: string; sent: boolean; copied: boolean };

// Capture les erreurs de rendu React : au lieu d'un écran blanc, on affiche un
// message clair et on envoie automatiquement un rapport (serveur → Discord).
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: '', sent: false, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const stack = (error?.stack || '') + '\n--- composant ---' + (info?.componentStack || '');
    this.setState({ info: stack });
    try {
      api()?.reportError?.({ type: 'react', message: error?.message || String(error), stack, context: 'ErrorBoundary' });
      this.setState({ sent: true });
    } catch { /* hors-ligne : le rapport sera perdu, l'app reste utilisable */ }
  }

  reload = () => { try { location.reload(); } catch { /* ignore */ } };

  copyReport = async () => {
    try {
      await navigator.clipboard.writeText(`Orbit — rapport d'erreur\n${this.state.error?.message || ''}\n\n${this.state.info}`);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
    } catch { /* ignore */ }
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/90 backdrop-blur-xl p-6">
        <div className="max-w-lg w-full glass-panel rounded-2xl p-6 border border-red-500/30 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-2xl">💥</div>
            <div>
              <h2 className="text-lg font-bold text-white">{t("Oups, une erreur est survenue")}</h2>
              <p className="text-xs text-gray-400">{this.state.sent ? t("Un rapport a été envoyé automatiquement.") : t("Impossible d'envoyer le rapport (hors-ligne).")}</p>
            </div>
          </div>
          <pre className="text-[11px] text-red-300 bg-red-500/5 border border-red-500/20 rounded-xl p-3 max-h-48 overflow-auto whitespace-pre-wrap select-text">{this.state.error.message}{this.state.info ? '\n\n' + this.state.info.slice(0, 1500) : ''}</pre>
          <div className="flex items-center gap-2">
            <button onClick={this.reload} className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm bg-orange-500/20 border border-orange-500/40 text-orange-200 hover:bg-orange-500/30 transition-all">{t("Recharger l'app")}</button>
            <button onClick={this.copyReport} className="px-4 py-2.5 rounded-xl text-sm bg-white/5 border border-white/10 hover:bg-white/10 transition-all">{this.state.copied ? t("Copié ✓") : t("Copier le rapport")}</button>
          </div>
        </div>
      </div>
    );
  }
}
