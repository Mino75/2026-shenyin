// styles.js
(() => {
  const css = `
:root{
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

*{box-sizing:border-box}
html,body{height:100%}
body{
  margin:0;
  font-family: var(--sans);
  color: var(--text);
  background:
    radial-gradient(1200px 800px at 20% -10%, rgba(124,92,255,.22), transparent 60%),
    radial-gradient(900px 700px at 90% 0%, rgba(255,77,109,.14), transparent 55%),
    radial-gradient(900px 700px at 10% 110%, rgba(0,200,255,.10), transparent 55%),
    var(--bg);
}

.topbar{
  position: sticky;
  top: 0;
  z-index: 10;
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--stroke);
  background: rgba(11,15,20,.72);
  backdrop-filter: blur(10px);
}

.brand{display:flex;gap:12px;align-items:center}
.brand__dot{
  width:12px;height:12px;border-radius:999px;
  background: var(--primary);
  box-shadow: 0 0 0 6px rgba(124,92,255,.14);
}
.brand__title{font-weight:700;letter-spacing:.2px}
.brand__subtitle{color:var(--muted);font-size:12px;margin-top:2px}

.layout{
  display:grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 16px;
  padding: 16px;
  max-width: 1200px;
  margin: 0 auto;
}

@media (max-width: 980px){
  .layout{grid-template-columns: 1fr}
}

.panel{
  border: 1px solid var(--stroke);
  background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.04));
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
  min-height: 220px;
}

.panel__header{
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--stroke);
  background: rgba(255,255,255,.02);
}
.panel__header--stack{display:flex;flex-direction:column;gap:10px}
.panel__title{margin:0;font-size:14px;color:var(--muted);letter-spacing:.35px;text-transform:uppercase}

.panel__body{padding: 12px}

.row{display:flex;gap:10px;align-items:center}
.row--space{justify-content:space-between}
.row--wrap{flex-wrap:wrap}

.btn{
  appearance:none;
  border: 1px solid var(--stroke);
  background: rgba(255,255,255,.05);
  color: var(--text);
  padding: 10px 12px;
  border-radius: 999px;
  font-weight: 600;
  cursor: pointer;
  transition: transform .08s ease, background .15s ease, border-color .15s ease;
}
.btn:hover{background: rgba(255,255,255,.08)}
.btn:active{transform: translateY(1px)}
.btn:disabled{opacity:.45;cursor:not-allowed}

.btn--primary{
  border-color: rgba(124,92,255,.45);
  background: var(--primary2);
}
.btn--primary:hover{background: rgba(124,92,255,.26)}
.btn--ghost{background: transparent}

.badge{
  font-family: var(--mono);
  font-size: 12px;
  color: var(--muted);
  border: 1px solid var(--stroke);
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,.03);
}

.list{display:flex;flex-direction:column;gap:8px}
.item{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding: 10px 10px;
  border: 1px solid var(--stroke);
  border-radius: var(--radius2);
  background: rgba(255,255,255,.04);
}
.item--active{
  border-color: rgba(124,92,255,.55);
  background: rgba(124,92,255,.14);
}
.item__left{display:flex;flex-direction:column;min-width:0}
.item__title{
  font-weight:700;
  font-size: 13px;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.item__meta{font-size:12px;color:var(--muted);margin-top:2px}
.item__actions{display:flex;gap:6px;align-items:center}

.iconbtn{
  width: 34px; height: 34px;
  border-radius: 10px;
  border: 1px solid var(--stroke);
  background: rgba(255,255,255,.04);
  color: var(--text);
  cursor:pointer;
}
.iconbtn:hover{background: rgba(255,255,255,.08)}
.iconbtn:disabled{opacity:.45;cursor:not-allowed}

.inputTitle{
  width: 100%;
  font: inherit;
  font-weight: 700;
  font-size: 13px;
  color: var(--text);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 6px 8px;
  outline:none;
}
.inputTitle:focus{
  border-color: rgba(124,92,255,.55);
  background: rgba(0,0,0,.18);
}

.empty{
  margin-top: 12px;
  padding: 14px;
  border: 1px dashed rgba(255,255,255,.18);
  color: var(--muted);
  border-radius: var(--radius2);
  display:none;
}
.mini{font-size:12px;color:var(--muted)}
.mini--muted{color:var(--muted2)}
  `.trim();

  const style = document.createElement("style");
  style.setAttribute("data-app-styles", "1");
  style.textContent = css;
  document.head.appendChild(style);
})();
