import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Rss, Plus, Trash2, RefreshCw, AlertCircle, Link } from "lucide-react";
import { t } from "@/i18n";

type Subscription = {
  id: string;
  url: string;
  title: string;
  dateAdded: string;
};

export default function Subscriptions() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    loadSubs();
  }, []);

  const loadSubs = async () => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      const data = await (window as any).electronAPI.getSubscriptions();
      setSubs(data);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setIsLoading(true);
    setError(null);
    try {
      if (typeof window !== "undefined" && (window as any).electronAPI) {
        const newData = await (window as any).electronAPI.addSubscription(urlInput.trim());
        setSubs(newData);
        setUrlInput("");
      }
    } catch (err: any) {
      setError(err.message || t("Erreur lors de l'ajout."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      const newData = await (window as any).electronAPI.deleteSubscription(id);
      setSubs(newData);
    }
  };

  const handleCheckNow = async () => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      setIsChecking(true);
      await (window as any).electronAPI.checkSubscriptionsNow();
      setTimeout(() => setIsChecking(false), 2000);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col gap-6 bg-transparent">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)' }}>
            <Rss className="w-5 h-5" style={{ color: 'var(--accent-strong)' }} />
          </span>
          <span className="os-text-gradient">{t("Abonnements")}</span>
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> {t("Auto-check toutes les 6h")}
          </span>
          <button 
            onClick={handleCheckNow}
            disabled={isChecking || subs.length === 0}
            className="flex items-center gap-2 text-xs bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded border border-white/10 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin text-pink-500' : ''}`} />
            {t("Vérifier maintenant")}
          </button>
        </div>
      </div>

      <form onSubmit={handleAdd} className="flex gap-3">
        <div className="relative flex-1">
          <Link className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input 
            type="text" 
            placeholder={t("Collez l'URL d'une chaîne ou d'une playlist (ex: youtube.com/@createur)...")}
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            disabled={isLoading}
            className="w-full glass-panel rounded-lg pl-10 pr-4 py-3 text-sm text-gray-200 outline-none focus:ring-2 focus:ring-pink-500/50 transition-all placeholder:text-gray-500 disabled:opacity-50"
          />
        </div>
        <button 
          type="submit"
          disabled={isLoading || !urlInput.trim()}
          className="bg-pink-500 hover:bg-pink-600 text-white px-5 rounded-lg font-medium text-sm flex items-center gap-2 disabled:opacity-50 transition-colors"
        >
          {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {t("S'abonner")}
        </button>
      </form>

      {error && (
        <div className="text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto pr-2">
        {subs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-4 opacity-50">
            <Rss className="w-12 h-12" />
            <p className="text-sm">{t("Vous n'êtes abonné à aucune chaîne.")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-10">
            <AnimatePresence>
              {subs.map(sub => (
                <motion.div 
                  key={sub.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="glass-panel hover:bg-white/5 rounded-xl p-4 flex items-center justify-between group transition-all hover:scale-[1.02]"
                >
                  <div className="min-w-0 pr-4">
                    <h3 className="font-semibold text-gray-200 text-sm truncate" title={sub.title}>{sub.title}</h3>
                    <p className="text-xs text-gray-500 truncate mt-1">{sub.url}</p>
                    <p className="text-[10px] text-gray-600 mt-2">{t("Ajouté le {date}", { date: new Date(sub.dateAdded).toLocaleDateString() })}</p>
                  </div>
                  <button 
                    onClick={() => handleDelete(sub.id)}
                    className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
