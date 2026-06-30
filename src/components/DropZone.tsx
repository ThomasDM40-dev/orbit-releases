import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { UploadCloud } from 'lucide-react';

// ────────────────────────────────────────────────────────────────────────────
// DropZone — the single drag & drop primitive for the whole app
// ────────────────────────────────────────────────────────────────────────────
// Every tool used to roll its own drop handler, and a drop on any of them also
// bubbled to the window-level AI overlay (App.tsx) — so dropping a file opened
// the AI instead of loading the tool. Two fixes live here:
//   1. `DROPZONE_ATTR` marks the element; the global handler ignores any drop
//      that lands inside a marked node, so tool zones own their own drops.
//   2. one consistent look + drag feedback (accent glow, depth-counted hover).
// ────────────────────────────────────────────────────────────────────────────

// Presence is what matters (`closest('[data-orbit-dropzone]')`), not the value.
export const DROPZONE_ATTR = 'data-orbit-dropzone' as const;

export interface FileDropOptions {
  onFiles: (paths: string[]) => void;
  /** Expand a dropped folder into the file paths it contains (async). */
  scanFolders?: (folder: string) => Promise<string[]>;
  /** Keep only files matching this predicate (e.g. images). */
  filter?: (file: File) => boolean;
}

// Pull absolute paths out of a drop event (Electron exposes File.path), honoring
// an optional per-file filter and optional async folder expansion.
export async function extractDropPaths(e: DragEvent, opts: FileDropOptions): Promise<void> {
  const items = Array.from(e.dataTransfer.items || []);
  const files = Array.from(e.dataTransfer.files || []);
  const direct: string[] = [];
  const folderJobs: Promise<string[]>[] = [];
  files.forEach((f, i) => {
    const p = (f as any).path as string | undefined;
    if (!p) return;
    const entry = (items[i] as any)?.webkitGetAsEntry?.();
    if (entry?.isDirectory) { if (opts.scanFolders) folderJobs.push(opts.scanFolders(p)); return; }
    if (opts.filter && !opts.filter(f)) return;
    direct.push(p);
  });
  const scanned = (await Promise.all(folderJobs)).flat().filter(Boolean);
  const paths = [...direct, ...scanned];
  if (paths.length) opts.onFiles(paths);
}

// Headless variant — spread `dropProps` onto any container (whole-panel drops).
export function useFileDrop(opts: FileDropOptions) {
  const [isOver, setIsOver] = useState(false);
  const depth = useRef(0); // counts enter/leave so child elements don't flicker

  const dropProps = {
    [DROPZONE_ATTR]: true,
    onDragEnter: (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault(); e.stopPropagation(); depth.current++; setIsOver(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault(); e.stopPropagation();
    },
    onDragLeave: (e: DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setIsOver(false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      depth.current = 0; setIsOver(false);
      void extractDropPaths(e, opts);
    },
  };

  return { isOver, dropProps };
}

export interface DropZoneProps extends FileDropOptions {
  title: string;
  hint?: string;
  icon?: ReactNode;
  /** Any CSS color; drives border/glow/icon. Defaults to the app accent. */
  accent?: string;
  onClick?: () => void;
  /** Tighter padding + smaller icon for narrow sidebar queues. */
  compact?: boolean;
  className?: string;
  disabled?: boolean;
  /** Extra content rendered under the hint (e.g. browse buttons). */
  children?: ReactNode;
}

export default function DropZone({
  title, hint, icon, accent = 'var(--accent,#ec4899)', onClick, compact, className = '', disabled, children, ...fileOpts
}: DropZoneProps) {
  const { isOver, dropProps } = useFileDrop(fileOpts);
  const mix = (pct: number) => `color-mix(in srgb, ${accent} ${pct}%, transparent)`;
  const clickable = !!onClick && !disabled;

  return (
    <div
      {...dropProps}
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
      className={`group relative rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center gap-2 overflow-hidden transition-all duration-200 ${clickable ? 'cursor-pointer' : ''} ${className}`}
      style={{
        padding: compact ? '18px 16px' : '36px 24px',
        borderColor: isOver ? accent : 'rgba(255,255,255,0.12)',
        background: isOver ? mix(10) : 'rgba(255,255,255,0.02)',
        transform: isOver ? 'scale(1.01)' : 'none',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {isOver && (
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(120% 80% at 50% 0%, ${mix(16)}, transparent 70%)` }} />
      )}
      <div
        className="flex items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105"
        style={{ width: compact ? 40 : 52, height: compact ? 40 : 52, background: mix(14), border: `1px solid ${mix(34)}`, color: accent }}
      >
        {icon || <UploadCloud style={{ width: compact ? 20 : 26, height: compact ? 20 : 26 }} />}
      </div>
      <p className={`font-semibold text-gray-100 ${compact ? 'text-[13px]' : 'text-sm'}`}>{title}</p>
      {hint && <p className="text-[11px] text-gray-500 leading-snug">{hint}</p>}
      {children && <div className="mt-2 relative" onClick={(e) => e.stopPropagation()}>{children}</div>}
    </div>
  );
}
