import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Bot, Send, X, Loader2, Play } from 'lucide-react';
import { AIMessage, sendChatCompletion } from '../services/aiService';

interface AIAssistantProps {
  onClose: () => void;
  droppedFile?: string | null;
  activeTab: string;
}

const WELCOME_MESSAGE: AIMessage = {
  role: 'assistant',
  content: "Bonjour ! Je suis **Orbit IA**. Posez-moi une question sur les outils, ou glissez-déposez un fichier pour que je vous guide.",
};

export default function AIAssistant({ onClose, droppedFile, activeTab }: AIAssistantProps) {
  const [messages, setMessages] = useState<AIMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const processedDropRef = useRef<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Handle dropped file — only once per unique file path
  useEffect(() => {
    if (droppedFile && droppedFile !== processedDropRef.current) {
      processedDropRef.current = droppedFile;
      const userMsg: AIMessage = {
        role: 'user',
        content: `Un fichier vient d'être déposé : "${droppedFile}". L'onglet actif est "${activeTab}". Propose-moi ce que je peux faire avec ce fichier.`,
      };
      sendMessage(userMsg);
    }
  }, [droppedFile]);

  const sendMessage = useCallback(async (userMsg: AIMessage) => {
    setError(null);
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      // Build the conversation including the new user message
      const conversation = [...messages.filter(m => m.role !== 'system'), userMsg];
      const response = await sendChatCompletion(conversation);
      setMessages(prev => [...prev, response]);
    } catch (err: any) {
      setError(err.message);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `❌ ${err.message}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    sendMessage({ role: 'user', content: text });
  };

  const executeAction = (action: any) => {
    if (action.name === 'dispatch_action') {
      const { actionName, payload } = action.arguments;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ai-dispatch', { detail: { actionName, payload } }));
      }
    }
  };

  // Simple markdown bold rendering
  const renderText = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="fixed bottom-20 right-6 w-[360px] h-[520px] flex flex-col rounded-2xl shadow-2xl border border-white/10 z-50 overflow-hidden"
      style={{
        background: 'rgba(14, 14, 20, 0.96)',
        backdropFilter: 'blur(24px)',
        boxShadow: '0 25px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06) inset',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-white/8 shrink-0"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'color-mix(in srgb, var(--accent, #ec4899) 20%, transparent)' }}
          >
            <Bot className="w-4.5 h-4.5" style={{ color: 'var(--accent, #ec4899)' }} />
          </div>
          <div>
            <span className="font-bold text-gray-200 text-sm">Orbit IA</span>
            <span className="text-[10px] text-gray-500 ml-2">Public Cloud</span>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar min-h-0">
        {messages.filter(m => m.role !== 'system').map((msg, idx) => (
          <div key={idx} className={`flex flex-col max-w-[88%] ${msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
            <div
              className={`px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed ${
                msg.role === 'user'
                  ? 'text-white rounded-br-md'
                  : 'bg-white/[0.07] text-gray-200 rounded-bl-md'
              }`}
              style={msg.role === 'user' ? { background: 'var(--accent, #ec4899)' } : undefined}
            >
              {msg.role === 'assistant' ? renderText(msg.content) : msg.content}
            </div>

            {msg.functionCall && msg.functionCall.name === 'dispatch_action' && (
              <button
                onClick={() => executeAction(msg.functionCall)}
                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 hover:bg-white/10 text-xs rounded-lg border border-white/10 transition-colors"
                style={{ color: 'var(--accent, #ec4899)' }}
              >
                <Play className="w-3 h-3" />
                Exécuter l'action
              </button>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="self-start px-3.5 py-2.5 bg-white/[0.07] text-gray-400 rounded-2xl rounded-bl-md text-[13px] flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent, #ec4899)' }} />
            Réflexion...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-white/8 bg-black/20 shrink-0">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
            placeholder="Posez une question..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-pink-500/50 transition-colors pr-10"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 disabled:opacity-30 transition-colors"
            style={{ color: 'var(--accent, #ec4899)' }}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
