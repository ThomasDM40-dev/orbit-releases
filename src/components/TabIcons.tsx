import React from "react";

// Custom hand-crafted line icons for the main tabs — consistent 24px grid,
// rounded strokes, currentColor (inherit the tab's text colour/active state).
const ic = (children: React.ReactNode) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

export const TAB_ICONS: Record<string, React.ReactNode> = {
  // ⬇ download into a tray
  downloads: ic(<><path d="M12 3v10" /><path d="m8 9 4 4 4-4" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>),
  // ⇄ convert (two opposing arrows)
  converter: ic(<><path d="M4 8h13" /><path d="m14 5-3 3 3 3" /><path d="M20 16H7" /><path d="m10 13-3 3 3 3" /></>),
  // RSS / broadcast
  subscriptions: ic(<><circle cx="6" cy="18" r="1.6" /><path d="M5 11.5a7 7 0 0 1 7 7" /><path d="M5 4.5a14 14 0 0 1 14 14" /></>),
  // ⚡ lightning (interpolation)
  interpolator: ic(<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />),
  // film frame with play (media library)
  library: ic(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9.5h3M18 9.5h3M3 14.5h3M18 14.5h3" /><path d="m10 9.5 5 2.5-5 2.5z" /></>),
  // ✨ sparkles (AI enhance)
  enhance: ic(<><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" /><path d="M18.5 14.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></>),
  // 🪄 wand + spark (AI image generation)
  imagegen: ic(<><path d="M15 4V2" /><path d="M15 16v-2" /><path d="M8 9h2" /><path d="M20 9h2" /><path d="M17.8 11.8 19 13" /><path d="M15 9h0" /><path d="M17.8 6.2 19 5" /><path d="m3 21 9-9" /><path d="M12.2 6.2 11 5" /></>),
  // 🧽 eraser (magic object removal)
  inpaint: ic(<><path d="m7 21-4-4a2 2 0 0 1 0-2.8l9.6-9.6a2 2 0 0 1 2.8 0l3.6 3.6a2 2 0 0 1 0 2.8L12 19" /><path d="M7 21h10" /><path d="m9 12 4 4" /></>),
  // ✂ scissors (matting / cut-out)
  matting: ic(<><circle cx="6" cy="6" r="2.4" /><circle cx="6" cy="18" r="2.4" /><path d="M8 7.5 20 18" /><path d="M8 16.5 20 6" /></>),
  // compress (HandBrake)
  handbrake: ic(<><path d="M9 3H5v4" /><path d="M15 3h4v4" /><path d="M9 21H5v-4" /><path d="M15 21h4v-4" /><rect x="8.5" y="8.5" width="7" height="7" rx="1" /></>),
  // 💎 gem (Topaz)
  topaz: ic(<><path d="M12 3 4 9l8 12 8-12z" /><path d="M4 9h16" /><path d="m9 3-2 6 5 12" /><path d="m15 3 2 6-5 12" /></>),
  // caption bubble (transcription)
  transcription: ic(<><path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /><path d="M7 9h10" /><path d="M7 12.5h6" /></>),
  // ☁ cloud + lock (Discord drive storage)
  drive: ic(<><path d="M7 18a4 4 0 0 1-.5-7.97A5 5 0 0 1 16 9.5a3.5 3.5 0 0 1 1 6.86" /><rect x="9" y="13" width="6" height="5" rx="1" /><path d="M10.5 13v-1.2a1.5 1.5 0 0 1 3 0V13" /></>),
  // 🧰 toolbox / wrench (quick utilities)
  toolbox: ic(<><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2 2.6-2.6z" /></>),
  // ⇄ universal converter (two arrows in a loop)
  convertpro: ic(<><path d="M17 2.1 21 6l-4 3.9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 21.9 3 18l4-3.9" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>),
};
