// styles.js
(() => {
  const css = `
:root {
  --bg: #0b0f14;
  --panel: rgba(255,255,255,.06);
  --panel2: rgba(255,255,255,.08);
  --stroke: rgba(255,255,255,.10);
  --text: rgba(255,255,255,.92);
  --muted: rgba(255,255,255,.62);
  --muted2: rgba(255,255,255,.42);
  --primary: #7c5cff;
  --primary2: rgba(124,92,255,.18);
  --danger: #ff4d6d;
  --shadow: 0 10px 30px rgba(0,0,0,.35);
  --radius: 18px;
  --radius2: 14px;
  --pad: 14px;
  --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  --sans: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
}

*, *::before, *::after { box-sizing: border-box; }
html, body { height: 100%; }

body {
  margin: 0;
  font-family: var(--sans);
  color: var(--text);
  overflow-x: hidden;
  background:
    radial-gradient(1200px 800px at 20% -10%, rgba(124,92,255,.22), transparent 60%),
    radial-gradient(900px 700px at 90% 0%, rgba(255,77,109,.14), transparent 55%),
    radial-gradient(900px 700px at 10% 110%, rgba(0,200,255,.10), transparent 55%),
    var(--bg);
}

/* ── Top bar ── */
.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--stroke);
  background: rgba(11,15,20,.72);
  backdrop-filter: blur(10px);
}

.topbar__actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.brand { display: flex; gap: 10px; align-items: center; }
.brand__dot {
  width: 10px; height: 10px; border-radius: 999px;
  background: var(--primary);
  box-shadow: 0 0 0 5px rgba(124,92,255,.14);
  flex-shrink: 0;
}
.brand__title    { font-weight: 700; letter-spacing: .2px; font-size: 14px; }
.brand__subtitle { color: var(--muted); font-size: 11px; margin-top: 2px; }

/* ── Layout: mobile-first single column, two columns from 700 px ── */
.layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  padding: 12px;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
}

@media (min-width: 700px) {
  .topbar { padding: 16px 18px; }
  .brand__dot { width: 12px; height: 12px; }
  .brand__title { font-size: 15px; }
  .brand__subtitle { font-size: 12px; }
  .layout { grid-template-columns: 300px minmax(0, 1fr); gap: 16px; padding: 16px; }
}

@media (min-width: 980px) {
  .layout { grid-template-columns: 320px minmax(0, 1fr); }
}

/* ── Panels ── */
.panel {
  border: 1px solid var(--stroke);
  background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.04));
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
  min-height: 180px;
}

.panel__header {
  padding: 12px 12px 10px;
  border-bottom: 1px solid var(--stroke);
  background: rgba(255,255,255,.02);
}
.panel__header--stack { display: flex; flex-direction: column; gap: 10px; }
.panel__title {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  letter-spacing: .35px;
  text-transform: uppercase;
}
.panel__body { padding: 10px; }

/* ── Rows ── */
.row { display: flex; gap: 8px; align-items: center; }
.row--space { justify-content: space-between; }
.row--wrap  { flex-wrap: wrap; gap: 8px; }

/* ── Seek row ── */
.seek-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.seekbar {
  flex: 1;
  min-width: 0;
  height: 4px;
  accent-color: var(--primary);
  cursor: pointer;
  border-radius: 999px;
  /* Increase touch target without changing visual height */
  padding: 8px 0;
  background-clip: content-box;
}
.seekbar:disabled { opacity: .35; cursor: not-allowed; }

.time-display {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 88px;
  text-align: right;
}

/* ── Video / audio element ── */
.media-player {
  display: none;          /* hidden by default (audio-only tracks) */
  width: 100%;
  border-radius: var(--radius2);
  background: #000;
  max-height: 280px;
  object-fit: contain;
  margin-bottom: 10px;
}
.media-player.visible { display: block; }

/* ── Buttons ── */
.btn {
  appearance: none;
  border: 1px solid var(--stroke);
  background: rgba(255,255,255,.05);
  color: var(--text);
  padding: 10px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: transform .08s ease, background .15s ease, border-color .15s ease;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.btn:hover   { background: rgba(255,255,255,.08); }
.btn:active  { transform: translateY(1px); }
.btn:disabled { opacity: .45; cursor: not-allowed; }

.btn--primary { border-color: rgba(124,92,255,.45); background: var(--primary2); }
.btn--primary:hover { background: rgba(124,92,255,.26); }
.btn--ghost { background: transparent; }

#btnShuffle.active {
  border-color: rgba(124,92,255,.55);
  background: rgba(124,92,255,.26);
  box-shadow: 0 0 0 3px rgba(124,92,255,.14);
}

/* ── Badge ── */
.badge {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
  border: 1px solid var(--stroke);
  padding: 5px 9px;
  border-radius: 999px;
  background: rgba(255,255,255,.03);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}

/* ── List & items ── */
.list { display: flex; flex-direction: column; gap: 8px; }

.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--stroke);
  border-radius: var(--radius2);
  background: rgba(255,255,255,.04);
}
.item--active {
  border-color: rgba(124,92,255,.55);
  background: rgba(124,92,255,.14);
}
.item__left {
  display: flex; flex-direction: column;
  min-width: 0; flex: 1;
}
.item__title {
  font-weight: 700; font-size: 13px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.item__meta  { font-size: 11px; color: var(--muted); margin-top: 2px; }
.item__actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }

/* ── Icon buttons — min 44×44 tap target (Apple HIG) ── */
.iconbtn {
  width: 40px; height: 40px;
  border-radius: 10px;
  border: 1px solid var(--stroke);
  background: rgba(255,255,255,.04);
  color: var(--text);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px;
  -webkit-tap-highlight-color: transparent;
}
.iconbtn:hover    { background: rgba(255,255,255,.08); }
.iconbtn:disabled { opacity: .45; cursor: not-allowed; }

/* ── Inline editable inputs ── */
.inputTitle {
  width: 100%;
  font: inherit; font-weight: 700; font-size: 13px;
  color: var(--text);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 6px 8px;
  outline: none;
}
.inputTitle:focus {
  border-color: rgba(124,92,255,.55);
  background: rgba(0,0,0,.18);
}

/* ── Empty state ── */
.empty {
  margin-top: 12px;
  padding: 14px;
  border: 1px dashed rgba(255,255,255,.18);
  color: var(--muted);
  border-radius: var(--radius2);
  display: none;
  font-size: 13px;
  text-align: center;
  line-height: 1.5;
}

/* ── Typography helpers ── */
.mini        { font-size: 12px; color: var(--muted); }
.mini--muted { color: var(--muted2); }
  `.trim();

  const style = document.createElement("style");
  style.setAttribute("data-app-styles", "1");
  style.textContent = css;
  document.head.appendChild(style);
})();
