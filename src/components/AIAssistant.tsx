import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Send, X, Loader2, Play, Copy, Check } from 'lucide-react';
import { AIMessage, sendChatCompletion } from '../services/aiService';

interface AIAssistantProps {
  onClose: () => void;
  droppedFile?: string | null;
  activeTab: string;
}

const WELCOME_MESSAGE: AIMessage = {
  role: 'assistant',
  content: "Bonjour 👋 Je suis **Orbit IA**. Pose-moi une question sur les outils, ou glisse-dépose un fichier et je te guide.",
};

const openExternal = (url: string) => { try { (window as any).electronAPI?.openExternalUrl?.(url); } catch (e) {} };

// ── Lightweight, safe markdown → JSX (bold, inline code, links) ──
function renderInline(text: string, kb: string) {
  const nodes: React.ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('`')) nodes.push(<code key={kb + k++} className="px-1.5 py-0.5 rounded-md bg-black/40 border border-white/10 text-[12px] font-mono" style={{ color: 'var(--accent,#ec4899)' }}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('**')) nodes.push(<strong key={kb + k++} className="font-semibold text-white">{t.slice(2, -2)}</strong>);
    else { const lm = t.match(/\[([^\]]+)\]\(([^)]+)\)/); if (lm) nodes.push(<a key={kb + k++} onClick={() => openExternal(lm[2])} className="underline cursor-pointer hover:opacity-80" style={{ color: 'var(--accent,#ec4899)' }}>{lm[1]}</a>); }
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { try { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (e) {} };
  return (
    <div className="my-1.5 rounded-xl overflow-hidden border border-white/10" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="flex items-center justify-between px-3 py-1 border-b border-white/8 bg-white/[0.03]">
        <span className="text-[10px] uppercase tracking-wider text-gray-500">{lang || 'code'}</span>
        <button onClick={copy} className="text-gray-500 hover:text-gray-200 flex items-center gap-1 text-[10px]">{copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}{copied ? 'Copié' : 'Copier'}</button>
      </div>
      <pre className="p-3 overflow-x-auto custom-scrollbar"><code className="text-[12px] font-mono text-gray-200 whitespace-pre">{code}</code></pre>
    </div>
  );
}

function Markdown({ content }: { content: string }) {
  const segments = content.split(/```/);
  return (
    <>
      {segments.map((seg, i) => {
        if (i % 2 === 1) {
          // code block; optional language on the first line
          let lang = '', code = seg.replace(/^\n/, '');
          const nl = code.indexOf('\n');
          if (nl > -1 && /^[a-zA-Z0-9+#-]{1,12}$/.test(code.slice(0, nl).trim())) { lang = code.slice(0, nl).trim(); code = code.slice(nl + 1); }
          return <CodeBlock key={i} code={code.replace(/\n$/, '')} lang={lang} />;
        }
        // text block → paragraphs + lists
        const lines = seg.split('\n');
        const out: React.ReactNode[] = [];
        let listItems: React.ReactNode[] = [];
        let ordered = false, lk = 0;
        const flush = () => {
          if (!listItems.length) return;
          out.push(ordered
            ? <ol key={'l' + i + lk} className="list-decimal pl-5 my-1 space-y-1">{listItems}</ol>
            : <ul key={'l' + i + lk} className="list-disc pl-5 my-1 space-y-1 marker:text-gray-600">{listItems}</ul>);
          listItems = []; lk++;
        };
        lines.forEach((line, li) => {
          const b = line.match(/^\s*[-*]\s+(.*)/);
          const n = line.match(/^\s*\d+\.\s+(.*)/);
          if (b) { if (ordered) flush(); ordered = false; listItems.push(<li key={li}>{renderInline(b[1], i + '-' + li + '-')}</li>); }
          else if (n) { if (!ordered) flush(); ordered = true; listItems.push(<li key={li}>{renderInline(n[1], i + '-' + li + '-')}</li>); }
          else { flush(); if (line.trim()) out.push(<p key={'p' + i + li} className="my-0.5">{renderInline(line, i + '-' + li + '-')}</p>); }
        });
        flush();
        return <div key={i}>{out}</div>;
      })}
    </>
  );
}

export default function AIAssistant({ onClose, droppedFile, activeTab }: AIAssistantProps) {
  const [messages, setMessages] = useState<AIMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const processedDropRef = useRef<string | null>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isLoading]);

  // Close when clicking outside the panel (ignoring the floating toggle button).
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (panelRef.current && !panelRef.current.contains(target) && !target.closest('[data-ai-toggle]')) onClose();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDown); };
  }, [onClose]);
  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sendMessage = useCallback(async (userMsg: AIMessage) => {
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    try {
      const conversation = [...messages.filter(m => m.role !== 'system'), userMsg];
      const response = await sendChatCompletion(conversation);
      setMessages(prev => [...prev, response]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  }, [messages]);

  useEffect(() => {
    if (droppedFile && droppedFile !== processedDropRef.current) {
      processedDropRef.current = droppedFile;
      sendMessage({ role: 'user', content: `Un fichier vient d'être déposé : "${droppedFile}". L'onglet actif est "${activeTab}". Propose-moi ce que je peux faire avec ce fichier.` });
    }
  }, [droppedFile]); // eslint-disable-line

  const handleSend = () => { const text = input.trim(); if (!text || isLoading) return; setInput(''); sendMessage({ role: 'user', content: text }); };

  const executeAction = (action: any) => {
    if (action?.name === 'dispatch_action') {
      const { actionName, payload } = action.arguments || {};
      window.dispatchEvent(new CustomEvent('ai-dispatch', { detail: { actionName, payload } }));
    }
  };

  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.96 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="fixed bottom-24 right-6 w-[380px] h-[560px] max-h-[78vh] flex flex-col rounded-3xl z-50 overflow-hidden"
      style={{
        background: 'rgba(16,16,24,0.80)',
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 30px 90px rgba(0,0,0,0.65), 0 1px 0 rgba(255,255,255,0.10) inset, 0 0 40px color-mix(in srgb, var(--accent,#ec4899) 12%, transparent)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0 relative"
        style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent,#ec4899) 14%, transparent), transparent)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl flex items-center justify-center relative"
            style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent,#ec4899) 90%, white), var(--accent,#ec4899))', boxShadow: '0 4px 14px color-mix(in srgb, var(--accent,#ec4899) 50%, transparent)' }}>
            <Sparkles className="w-4.5 h-4.5 text-white" />
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-[#101018]" />
          </div>
          <div className="leading-tight">
            <p className="font-bold text-white text-sm">Orbit IA</p>
            <p className="text-[10px] text-gray-400">Assistant intégré</p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/8"><X className="w-4 h-4" /></button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 custom-scrollbar min-h-0">
        {messages.filter(m => m.role !== 'system').map((msg, idx) => (
          <div key={idx} className={`flex flex-col max-w-[90%] ${msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
            <div className={`px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed break-words ${msg.role === 'user' ? 'text-white rounded-br-md shadow-lg' : 'text-gray-200 rounded-bl-md border border-white/8'}`}
              style={msg.role === 'user'
                ? { background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent,#ec4899) 92%, white), var(--accent,#ec4899))', boxShadow: '0 4px 16px color-mix(in srgb, var(--accent,#ec4899) 35%, transparent)' }
                : { background: 'rgba(255,255,255,0.05)' }}>
              {msg.role === 'assistant' ? <Markdown content={msg.content} /> : msg.content}
            </div>
            {msg.functionCall && msg.functionCall.name === 'dispatch_action' && (
              <button onClick={() => executeAction(msg.functionCall)} className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl border transition-all hover:scale-[1.03]"
                style={{ color: 'white', background: 'color-mix(in srgb, var(--accent,#ec4899) 30%, transparent)', borderColor: 'color-mix(in srgb, var(--accent,#ec4899) 50%, transparent)' }}>
                <Play className="w-3 h-3 fill-current" /> Exécuter l'action
              </button>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="self-start px-3.5 py-2.5 rounded-2xl rounded-bl-md text-[13px] flex items-center gap-2 border border-white/8" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent,#ec4899)' }} />
            <span className="text-gray-400">Réflexion…</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.25)' }}>
        <div className="relative">
          <input
            type="text" value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
            placeholder="Pose une question…"
            className="w-full rounded-2xl pl-4 pr-11 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none transition-all"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
          />
          <button onClick={handleSend} disabled={!input.trim() || isLoading}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl flex items-center justify-center disabled:opacity-30 transition-all hover:scale-105"
            style={{ background: input.trim() && !isLoading ? 'var(--accent,#ec4899)' : 'rgba(255,255,255,0.08)' }}>
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
