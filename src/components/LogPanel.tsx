"use client";
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Terminal, AlertCircle, Info, AlertTriangle, Copy, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";

type LogLine = {
  id: string;
  line: string;
  level: 'info' | 'warn' | 'error';
  ts: number;
};

type LogPanelProps = {
  downloadId: string | null;
  title?: string;
  initialLogs?: Array<{line: string, level: string}>;
  onClose: () => void;
};

export default function LogPanel({ downloadId, title, initialLogs = [], onClose }: LogPanelProps) {
  const [logs, setLogs] = useState<LogLine[]>(() =>
    initialLogs.map((l, i) => ({ id: `init-${i}`, line: l.line, level: (l.level as any) || 'info', ts: Date.now() - (initialLogs.length - i) }))
  );
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!downloadId) return;
    setLogs([]);

    const api = (window as any).electronAPI;
    if (!api?.onDownloadLog) return;

    const remove = api.onDownloadLog((data: any) => {
      if (data.id !== downloadId) return;
      setLogs(prev => [...prev, {
        id: Math.random().toString(36).slice(2),
        line: data.line,
        level: data.level || 'info',
        ts: Date.now()
      }]);
    });

    return () => { if (typeof remove === 'function') remove(); };
  }, [downloadId]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  };

  const copyLogs = () => {
    const text = logs.map(l => `[${l.level.toUpperCase()}] ${l.line}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openLogFile = async () => {
    const api = (window as any).electronAPI;
    if (api?.getLogFile) {
      const path = await api.getLogFile();
      if (api?.openFile) api.openFile(path);
    }
  };

  const levelColor = {
    info: 'text-emerald-400',
    warn: 'text-yellow-400',
    error: 'text-red-400',
  };
  const levelBg = {
    info: 'bg-emerald-400/5',
    warn: 'bg-yellow-400/5',
    error: 'bg-red-400/8',
  };
  const LevelIcon = {
    info: Info,
    warn: AlertTriangle,
    error: AlertCircle,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2 }}
      className="fixed bottom-0 left-0 right-0 z-50 flex flex-col"
      style={{
        height: '40vh',
        minHeight: 220,
        background: 'rgba(10,10,14,0.97)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-pink-400" />
          <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">Console yt-dlp</span>
          {title && <span className="text-xs text-gray-500 truncate max-w-[300px]">— {title}</span>}
          <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded font-mono ${
            logs.some(l => l.level === 'error')
              ? 'bg-red-500/20 text-red-400'
              : 'bg-emerald-500/20 text-emerald-400'
          }`}>
            {logs.length} lignes
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`text-[10px] px-2 py-1 rounded flex items-center gap-1 transition-colors ${
              autoScroll ? 'bg-pink-500/20 text-pink-400' : 'bg-white/5 text-gray-500 hover:text-gray-300'
            }`}
            title="Auto-scroll"
          >
            {autoScroll ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            Auto
          </button>
          <button
            onClick={copyLogs}
            className="text-[10px] px-2 py-1 rounded bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1"
          >
            <Copy className="w-3 h-3" />
            {copied ? 'Copié !' : 'Copier'}
          </button>
          <button
            onClick={openLogFile}
            className="text-[10px] px-2 py-1 rounded bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1"
            title="Ouvrir le fichier log complet"
          >
            <ExternalLink className="w-3 h-3" />
            orbit.log
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Log area */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed px-3 py-2 space-y-0.5"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}
      >
        {logs.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">
            En attente des logs...
          </div>
        )}
        {logs.map((log) => {
          const Icon = LevelIcon[log.level];
          return (
            <div
              key={log.id}
              className={`flex items-start gap-2 px-2 py-0.5 rounded ${levelBg[log.level]} group`}
            >
              <Icon className={`w-3 h-3 mt-0.5 shrink-0 ${levelColor[log.level]} opacity-70`} />
              <span className={`${levelColor[log.level]} break-all`}>{log.line}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </motion.div>
  );
}
