// ─────────────────────────────────────────────────────────────────────────────
// Orbit — Transcription export helpers
// Whisper produces a reliable SRT; everything else is derived here so the result
// can be imported into Premiere Pro, After Effects, CapCut, DaVinci, Final Cut…
// ─────────────────────────────────────────────────────────────────────────────

// Parse an SRT string into [{ index, start, end, text }] (start/end in seconds).
function parseSrt(srt) {
  const cues = [];
  const blocks = srt.replace(/\r/g, '').split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.length);
    if (lines.length < 2) continue;
    // first line may be the index (optional)
    let i = 0;
    if (/^\d+$/.test(lines[0].trim())) i = 1;
    const timeLine = lines[i];
    const m = timeLine.match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/);
    if (!m) continue;
    const start = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
    const end   = (+m[5]) * 3600 + (+m[6]) * 60 + (+m[7]) + (+m[8]) / 1000;
    const text  = lines.slice(i + 1).join('\n').trim();
    if (text) cues.push({ index: cues.length + 1, start, end, text });
  }
  return cues;
}

// ── Time formatters ──────────────────────────────────────────────────────────
const pad = (n, l = 2) => String(Math.floor(n)).padStart(l, '0');
function fmtSrt(t) {
  const ms = Math.round((t - Math.floor(t)) * 1000);
  const s = Math.floor(t) % 60, mn = Math.floor(t / 60) % 60, h = Math.floor(t / 3600);
  return `${pad(h)}:${pad(mn)}:${pad(s)},${pad(ms, 3)}`;
}
function fmtVtt(t) { return fmtSrt(t).replace(',', '.'); }
function fmtAss(t) { // H:MM:SS.cs (centiseconds)
  const cs = Math.round((t - Math.floor(t)) * 100);
  const s = Math.floor(t) % 60, mn = Math.floor(t / 60) % 60, h = Math.floor(t / 3600);
  return `${h}:${pad(mn)}:${pad(s)}.${pad(cs)}`;
}
function fmtLrc(t) { // [mm:ss.xx]
  const cs = Math.round((t - Math.floor(t)) * 100);
  const s = Math.floor(t) % 60, mn = Math.floor(t / 60);
  return `[${pad(mn)}:${pad(s)}.${pad(cs)}]`;
}
function fcpTime(t) { return `${Math.round(t * 1000)}/1000s`; }

// ── Generators ───────────────────────────────────────────────────────────────
function toSrt(cues) {
  return cues.map((c, i) =>
    `${i + 1}\n${fmtSrt(c.start)} --> ${fmtSrt(c.end)}\n${c.text}`).join('\n\n') + '\n';
}

function toVtt(cues) {
  return 'WEBVTT\n\n' + cues.map(c =>
    `${fmtVtt(c.start)} --> ${fmtVtt(c.end)}\n${c.text}`).join('\n\n') + '\n';
}

function toTxt(cues) {
  return cues.map(c => c.text.replace(/\n/g, ' ')).join('\n') + '\n';
}

function toJson(cues) {
  return JSON.stringify(cues.map(c => ({
    start: +c.start.toFixed(3), end: +c.end.toFixed(3), text: c.text.replace(/\n/g, ' ')
  })), null, 2);
}

function toCsv(cues) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return 'Index,Start,End,Start (s),End (s),Text\n' + cues.map((c, i) =>
    [i + 1, fmtSrt(c.start), fmtSrt(c.end), c.start.toFixed(3), c.end.toFixed(3), q(c.text.replace(/\n/g, ' '))].join(',')
  ).join('\n') + '\n';
}

function toLrc(cues) {
  return cues.map(c => `${fmtLrc(c.start)}${c.text.replace(/\n/g, ' ')}`).join('\n') + '\n';
}

// ASS / SSA styled subtitles (CapCut, Aegisub, OBS, VLC).
function toAss(cues, style = {}) {
  const font   = style.fontName  || 'Arial';
  const size   = style.fontSize  || 48;
  // ASS colour is &HAABBGGRR. Accept "#RRGGBB".
  const hexToAss = (hex, alpha = '00') => {
    const h = (hex || '#FFFFFF').replace('#', '');
    const r = h.substring(0, 2), g = h.substring(2, 4), b = h.substring(4, 6);
    return `&H${alpha}${b}${g}${r}`.toUpperCase();
  };
  const primary = hexToAss(style.primaryColour || '#FFFFFF');
  const outline = hexToAss(style.outlineColour || '#000000');
  const bold = style.bold ? -1 : 0;
  const outlineW = style.outlineWidth != null ? style.outlineWidth : 2;
  const shadow = style.shadow != null ? style.shadow : 0;
  const header =
`[Script Info]
Title: Orbit Transcription
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${font},${size},${primary},&H000000FF,${outline},&H00000000,${bold},0,0,0,100,100,0,0,1,${outlineW},${shadow},2,40,40,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const events = cues.map(c =>
    `Dialogue: 0,${fmtAss(c.start)},${fmtAss(c.end)},Default,,0,0,0,,${c.text.replace(/\n/g, '\\N')}`
  ).join('\n');
  return header + events + '\n';
}

// Final Cut Pro XML — also imported by DaVinci Resolve & Premiere Pro as titles.
function toFcpxml(cues, opts = {}) {
  const fps = opts.fps || 30;
  const w = opts.width || 1920, h = opts.height || 1080;
  const total = cues.length ? cues[cues.length - 1].end + 2 : 5;
  const titleUid = '.../Titles.localized/Bumper:Opener.localized/Basic Title.localized/Basic Title.moti';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const titles = cues.map((c, i) =>
`            <title ref="r2" lane="1" offset="${fcpTime(c.start)}" duration="${fcpTime(c.end - c.start)}" name="${esc(c.text.replace(/\n/g, ' ')).slice(0, 40)}">
              <text><text-style ref="ts${i}">${esc(c.text.replace(/\n/g, ' '))}</text-style></text>
              <text-style-def id="ts${i}"><text-style font="Helvetica" fontSize="63" fontColor="1 1 1 1" alignment="center"/></text-style-def>
            </title>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" name="FFVideoFormat1080p${fps}" frameDuration="100/${fps * 100}s" width="${w}" height="${h}"/>
    <effect id="r2" name="Basic Title" uid="${titleUid}"/>
  </resources>
  <library>
    <event name="Orbit Subtitles">
      <project name="Orbit Subtitles">
        <sequence format="r1" duration="${fcpTime(total)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
            <gap name="Gap" offset="0s" start="0s" duration="${fcpTime(total)}">
${titles}
            </gap>
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
}

// After Effects ExtendScript — run via File ▸ Scripts ▸ Run Script File…
// Creates one text layer per subtitle, timed to its in/out point.
function toAeJsx(cues, opts = {}) {
  const w = opts.width || 1920, h = opts.height || 1080, fps = opts.fps || 30;
  const total = cues.length ? cues[cues.length - 1].end + 2 : 5;
  const data = JSON.stringify(cues.map(c => ({
    s: +c.start.toFixed(3), e: +c.end.toFixed(3), t: c.text.replace(/\n/g, ' ')
  })));
  return `// Orbit → After Effects subtitle importer
// File ▸ Scripts ▸ Run Script File…  (or drop into the Scripts folder)
(function () {
  var subs = ${data};
  app.beginUndoGroup("Orbit Subtitles");

  var comp = app.project.activeItem;
  if (!(comp && comp instanceof CompItem)) {
    comp = app.project.items.addComp("Orbit Subtitles", ${w}, ${h}, 1.0, ${total.toFixed(2)}, ${fps});
    comp.openInViewer();
  }

  for (var i = 0; i < subs.length; i++) {
    var s = subs[i];
    var layer = comp.layers.addText(s.t);
    layer.name = "Sub " + (i + 1);
    layer.startTime = 0;
    layer.inPoint = s.s;
    layer.outPoint = s.e;

    var txt = layer.property("Source Text");
    var doc = txt.value;
    doc.resetCharStyle();
    doc.fontSize = 56;
    doc.fillColor = [1, 1, 1];
    doc.strokeColor = [0, 0, 0];
    doc.strokeWidth = 3;
    doc.strokeOverFill = false;
    doc.applyStroke = true;
    doc.applyFill = true;
    doc.justification = ParagraphJustification.CENTER_JUSTIFY;
    txt.setValue(doc);

    // Position near the bottom-center
    layer.property("Transform").property("Position").setValue([${w / 2}, ${h - 120}]);
  }

  app.endUndoGroup();
  alert("Orbit: " + subs.length + " sous-titres importés ✓");
})();
`;
}

// Map a format key → { ext, build(cues, opts) }
const GENERATORS = {
  srt:     { ext: 'srt',          build: (c) => toSrt(c) },
  vtt:     { ext: 'vtt',          build: (c) => toVtt(c) },
  ass:     { ext: 'ass',          build: (c, o) => toAss(c, o.style) },
  txt:     { ext: 'txt',          build: (c) => toTxt(c) },
  json:    { ext: 'json',         build: (c) => toJson(c) },
  csv:     { ext: 'csv',          build: (c) => toCsv(c) },
  lrc:     { ext: 'lrc',          build: (c) => toLrc(c) },
  fcpxml:  { ext: 'fcpxml',       build: (c, o) => toFcpxml(c, o) },
  aejsx:   { ext: 'jsx',          build: (c, o) => toAeJsx(c, o) },
};

module.exports = { parseSrt, GENERATORS, toSrt, toVtt, toAss, toTxt, toJson, toCsv, toLrc, toFcpxml, toAeJsx };
