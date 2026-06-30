import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { t } from '@/i18n';

// ────────────────────────────────────────────────────────────────────────────
// orbitPrompt — async replacement for window.prompt()
// ────────────────────────────────────────────────────────────────────────────
// Electron's renderer throws "prompt() is not supported", so every call to the
// native prompt() used to crash the tab. This renders a small themed modal in
// its own React root and resolves to the entered string (or null on cancel),
// keeping the exact 1:1 call ergonomics of prompt(): `await orbitPrompt(msg)`.
// ────────────────────────────────────────────────────────────────────────────

type Opts = { defaultValue?: string; placeholder?: string; okLabel?: string; cancelLabel?: string };

export function orbitPrompt(message: string, opts: Opts = {}): Promise<string | null> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    let settled = false;
    const close = (val: string | null) => {
      if (settled) return;
      settled = true;
      resolve(val);
      // Unmount on a later tick so we never remove the container while React is
      // mid-commit (avoids "removeChild … not a child of this node").
      setTimeout(() => { root.unmount(); host.remove(); }, 0);
    };
    root.render(<PromptDialog message={message} opts={opts} onClose={close} />);
  });
}

function PromptDialog({ message, opts, onClose }: { message: string; opts: Opts; onClose: (v: string | null) => void }) {
  const [value, setValue] = useState(opts.defaultValue ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = () => { const v = value.trim(); onClose(v ? v : null); };

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(null); }}
      style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
    >
      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        style={{ width: 'min(420px, 90vw)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(18,18,26,0.98)', boxShadow: '0 30px 80px rgba(0,0,0,0.7)', padding: 22 }}
      >
        <p style={{ fontSize: 14, fontWeight: 600, color: '#e5e7eb', margin: '0 0 12px' }}>{message}</p>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={opts.placeholder}
          style={{ width: '100%', boxSizing: 'border-box', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', padding: '10px 12px', fontSize: 14, color: '#f3f4f6', outline: 'none' }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={() => onClose(null)} style={{ padding: '8px 14px', borderRadius: 10, fontSize: 13, color: '#9ca3af', background: 'transparent', border: 'none', cursor: 'pointer' }}>{opts.cancelLabel ?? t('Annuler')}</button>
          <button type="submit" style={{ padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#fff', background: 'var(--accent,#ec4899)', border: 'none', cursor: 'pointer' }}>{opts.okLabel ?? t('OK')}</button>
        </div>
      </form>
    </div>
  );
}
