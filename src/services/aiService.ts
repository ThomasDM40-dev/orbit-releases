export interface AIFunctionCall {
  name: string;
  arguments: any;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  functionCall?: AIFunctionCall;
}

const SYSTEM_PROMPT = `Tu es Orbit IA, l'assistant intelligent intégré au logiciel vidéo/audio Orbit.
L'utilisateur peut te demander de l'aide sur la manière d'utiliser les différents outils.
Voici les outils disponibles dans Orbit :
- Téléchargements (yt-dlp) — id: "downloads"
- Convertisseur & Tags (ffmpeg) — id: "converter"
- Abonnements — id: "subscriptions"
- Interpolateur IA (DAIN / RIFE) — id: "interpolator"
- Médiathèque — id: "library"
- Amélioration IA (Upscale) — id: "enhance"
- Détourage IA (Matting) — id: "matting"
- HandBrake (Compression vidéo) — id: "handbrake"
- Topaz Video AI — id: "topaz"
- Transcription (Whisper) — id: "transcription"

Tu as accès à un outil "dispatch_action" que tu peux utiliser pour effectuer des actions pour l'utilisateur, comme changer d'onglet, ou charger un fichier dans un outil spécifique.
Si l'utilisateur glisse-dépose un fichier, le système va t'envoyer un message automatique pour te prévenir. Demande alors à l'utilisateur ce qu'il souhaite faire avec ce fichier, et propose des actions pertinentes (ex: "Voulez-vous extraire l'audio ?", "Voulez-vous compresser cette vidéo ?").
Sois concis, clair et professionnel. Réponds toujours en français.`;

const CLAUDE_TOOLS = [
  {
    name: "dispatch_action",
    description: "Déclenche une action dans l'application Orbit, comme changer d'onglet ou charger un fichier dans un outil.",
    input_schema: {
      type: "object" as const,
      properties: {
        actionName: {
          type: "string",
          description: "Le nom de l'action à déclencher (ex: 'switchTab', 'loadFile')",
        },
        payload: {
          type: "object",
          description: "Les paramètres de l'action (ex: { tab: 'handbrake' } ou { tool: 'transcription', file: 'chemin/vers/fichier.mp4' })",
          additionalProperties: true,
        }
      },
      required: ["actionName", "payload"]
    }
  }
];

export const sendChatCompletion = async (
  messages: AIMessage[]
): Promise<AIMessage> => {

  const apiMessages = messages
    .filter(m => m.role !== 'system' && m.content.trim() !== '')
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  // Ensure the conversation starts with a user message (Claude requirement)
  if (apiMessages.length === 0 || apiMessages[0].role !== 'user') {
    // If the first message is from the assistant (like the welcome message),
    // we just remove it so the real user prompt becomes the first message.
    if (apiMessages.length > 1 && apiMessages[1].role === 'user') {
      apiMessages.shift();
    } else {
      return {
        role: 'assistant',
        content: "Bonjour ! Je suis Orbit IA. Comment puis-je vous aider aujourd'hui ?",
      };
    }
  }

  // Call the main process via IPC to avoid CORS issues
  let data;
  if (typeof window !== 'undefined' && (window as any).electronAPI && (window as any).electronAPI.aiChat) {
    data = await (window as any).electronAPI.aiChat({ messages: apiMessages });
  } else {
    throw new Error("L'API Electron n'est pas disponible.");
  }

  if (data.error) {
    throw new Error(data.error);
  }

  return {
    role: 'assistant',
    content: data.text || '',
    functionCall: data.functionCall,
  };
};
