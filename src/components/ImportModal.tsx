import React, { useRef, useState, useEffect } from 'react';
import { FileText } from 'lucide-react';

type ImportModalProps = {
  onClose: () => void;
  language?: 'en' | 'fr' | 'es';
};

export default function ImportModal({ onClose, language = 'en' }: ImportModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = {
    en: {
      title: "Import Files",
      desc: "You can import any type of file that is plain text. The file will be scanned for URL's and will automatically start downloading with the currently selected configuration. You can change your current configuration at the bottom left of this dialog.",
      dragDrop: "Drag and drop files here to begin downloading",
      orClick: "or click here for a file selection dialog",
      cancel: "Cancel Import",
      defaultConfig: "Default"
    },
    fr: {
      title: "Importer des fichiers",
      desc: "Vous pouvez importer tout type de fichier texte brut. Le fichier sera analysé pour trouver des URL et lancera automatiquement le téléchargement avec la configuration actuelle. Vous pouvez changer votre configuration en bas à gauche de ce dialogue.",
      dragDrop: "Glissez et déposez des fichiers ici pour commencer",
      orClick: "ou cliquez ici pour choisir un fichier",
      cancel: "Annuler l'import",
      defaultConfig: "Par défaut"
    },
    es: {
      title: "Importar Archivos",
      desc: "Puede importar cualquier tipo de archivo de texto sin formato. El archivo será escaneado en busca de URL y comenzará a descargar automáticamente con la configuración actual. Puede cambiar la configuración en la parte inferior izquierda.",
      dragDrop: "Arrastre y suelte archivos aquí para comenzar",
      orClick: "o haga clic aquí para seleccionar un archivo",
      cancel: "Cancelar Importación",
      defaultConfig: "Predeterminado"
    }
  }[language];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        // Regex to match URLs but exclude trailing punctuation like commas or quotes
        const urlRegex = /(https?:\/\/[^\s"']+)/g;
        let urls = text.match(urlRegex);
        
        if (urls && urls.length > 0) {
          // Clean up any trailing commas or periods that might have been caught
          urls = urls.map(u => u.replace(/[.,;]+$/, ''));
          
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent('import-urls', { detail: urls }));
          }
        }
        onClose();
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-200" onClick={onClose}>
      <div className="glass-panel rounded-xl shadow-2xl w-full max-w-2xl p-8 flex flex-col" onClick={(e) => e.stopPropagation()}>
        
        <h2 className="text-2xl font-bold text-white mb-2">{t.title}</h2>
        <p className="text-gray-400 text-sm mb-6 leading-relaxed">
          {t.desc}
        </p>

        <div 
          className={`flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-12 transition-colors cursor-pointer ${
            isDragging ? 'border-pink-500 bg-pink-500/10' : 'border-white/10 glass-panel hover:border-white/30 hover:bg-white/5'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            accept=".txt,.csv" 
          />
          <FileText className="w-16 h-16 text-gray-400 mb-6" />
          <h3 className="text-lg font-medium text-white mb-2">{t.dragDrop}</h3>
          <p className="text-gray-500 text-sm">{t.orClick}</p>
        </div>

        <div className="flex items-center justify-between mt-6">
          <div className="flex items-center gap-2 text-gray-400 hover:text-white cursor-pointer transition-colors text-sm font-medium">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            {t.defaultConfig}
          </div>
          <button 
            onClick={onClose}
            className="border border-pink-500 text-pink-500 px-6 py-2 rounded-lg font-medium hover:bg-pink-500/10 transition-colors"
          >
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
