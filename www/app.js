'use strict';

/* ================= Pohrana ================= */
const KEY = 'lchf-dnevnik-v1';
const DEFAULT_SETTINGS = {
  heightCm: null,
  goalWeight: null,
  carbLimit: 25,          // neto ugljikohidrati (g/dan)
  proteinTarget: 100,     // g/dan
  fatTarget: 130,         // g/dan (orijentacijski)
  kcalTarget: 1800,
  carbsIncludeFiber: false, // EU deklaracije: UH NE uključuju vlakna
  healthWeight: true,       // uvozi težinu iz Health Connecta za dane bez unosa
  lastBackup: null,
  hideInstall: false,
  fastGoal: 16,             // cilj posta u satima
  diet: 'lchf', dietChosen: false, sex: '', age: null, activity: 1.375, pace: 0.5,
  reportEmail: '', reportFrom: '', reportDay: 0, reportTime: '08:00'
};
const emptyDb = () => ({ settings: { ...DEFAULT_SETTINGS }, weights: {}, ketones: [], energy: {}, foods: [], favorites: [], products: {}, fasts: [], fast: null });

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyDb();
    const d = JSON.parse(raw), e = emptyDb();
    return { ...e, ...d, settings: { ...e.settings, ...(d.settings || {}) } };
  } catch (err) {
    console.error(err);
    return emptyDb();
  }
}
let db = load();
function save() {
  db.savedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('Spremanje nije uspjelo: ' + e.message); }
  try { widgetSync(); } catch { /* widget još nije inicijaliziran */ }
  try { nativeSave(); } catch { /* samo Android */ }
}

/* ================= Pomoćne funkcije ================= */
const $ = (s, el = document) => el.querySelector(s);
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const today = () => iso(new Date());
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
const num = v => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
const r1 = n => Math.round(n * 10) / 10;
const fmt = (n, dec = 0) => (n == null || isNaN(n)) ? '–' : Number(n).toLocaleString('hr-HR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const sgn = (n, dec = 1) => n == null ? '–' : (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n), dec);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const sum = a => a.reduce((x, y) => x + (y || 0), 0);
const DAYS = ['Ned', 'Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub'];
const MONTHS = ['sij', 'velj', 'ožu', 'tra', 'svi', 'lip', 'srp', 'kol', 'ruj', 'lis', 'stu', 'pro'];
const dayLabel = s => { const d = parseISO(s); return `${DAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`; };
const shortDate = s => { const d = parseISO(s); return `${d.getDate()}.${d.getMonth() + 1}.`; };
const weekStart = s => { const d = parseISO(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return iso(d); };

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ================= Domena ================= */
// Neto UH: na EU deklaracijama "ugljikohidrati" već NE uključuju vlakna.
const netOf = f => Math.max(0, (f.carbs || 0) - (f.inc ? (f.fiber || 0) : 0));
const kcalOf = f => netOf(f) * 4 + (f.fiber || 0) * 2 + (f.fat || 0) * 9 + (f.protein || 0) * 4;
const dayFood = d => db.foods.filter(f => f.date === d).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
function totals(list) {
  const t = { net: 0, fiber: 0, fat: 0, protein: 0, kcal: 0, n: list.length };
  for (const f of list) {
    t.net += netOf(f); t.fiber += f.fiber || 0; t.fat += f.fat || 0; t.protein += f.protein || 0; t.kcal += kcalOf(f);
  }
  return t;
}
const burnedOf = e => !e ? null : e.total != null ? e.total : (e.active != null || e.basal != null) ? (e.active || 0) + (e.basal || 0) : null;

const weightDates = () => Object.keys(db.weights).sort();
function latestWeight(upto) {
  const ds = weightDates().filter(d => d <= upto);
  return ds.length ? { date: ds.at(-1), kg: db.weights[ds.at(-1)] } : null;
}
function avg7(date) {
  const v = [];
  for (let i = 0; i < 7; i++) { const w = db.weights[addDays(date, -i)]; if (w != null) v.push(w); }
  return mean(v);
}
// Linearni trend (kg/tjedan) kroz zadnjih `days` dana
function weeklyRate(end = today(), days = 21) {
  const pts = weightDates().filter(d => d <= end && daysBetween(d, end) < days).map(d => [daysBetween(end, d), db.weights[d]]);
  if (pts.length < 3 || pts[pts.length - 1][0] - pts[0][0] < 5) return null;
  const mx = mean(pts.map(p => p[0])), my = mean(pts.map(p => p[1]));
  let nu = 0, de = 0;
  for (const [x, y] of pts) { nu += (x - mx) * (y - my); de += (x - mx) ** 2; }
  return de ? nu / de * 7 : null;
}

/* Keto-Diastix skala (ketoni: 15 s, glukoza: 30 s) – boje su orijentacijske */
const KET = [
  { l: 'Negativno', mg: 0, mmol: 0, c: '#efe3c9' },
  { l: 'Trag', mg: 5, mmol: 0.5, c: '#e9c3bd' },
  { l: 'Malo', mg: 15, mmol: 1.5, c: '#d6909f' },
  { l: 'Umjereno', mg: 40, mmol: 4, c: '#ad4f78' },
  { l: 'Puno', mg: 80, mmol: 8, c: '#7a2453' },
  { l: 'Jako puno', mg: 160, mmol: 16, c: '#4c1238' }
];
const GLU = [
  { l: 'Negativno', mg: 0, c: '#79c2c9' },
  { l: 'Trag', mg: 100, c: '#8fc49b' },
  { l: '250', mg: 250, c: '#9fb35c' },
  { l: '500', mg: 500, c: '#a28f3e' },
  { l: '1000', mg: 1000, c: '#8c6a2c' },
  { l: '≥2000', mg: 2000, c: '#694a22' }
];
const KET_TEXT = ['Nema ketona u urinu', 'Lagana ketoza', 'Lagana ketoza', 'Nutritivna ketoza', 'Visoki ketoni – pij dovoljno vode', 'Vrlo visoki ketoni – pij vodu, prati se'];

/* ================= Grafovi (SVG) ================= */
function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw || 1)), m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}
function chart(o) {
  const W = 340, H = o.h || 170, L = 34, R = 6, T = 10, B = 20;
  const n = o.labels.length;
  const vals = [], stackTot = new Array(n).fill(0);
  let hasStack = false;
  for (const s of o.series) {
    if (s.type === 'bar' && s.stack) { hasStack = true; s.values.forEach((v, i) => stackTot[i] += v || 0); }
    else s.values.forEach(v => { if (v != null) vals.push(v); });
  }
  if (hasStack) vals.push(...stackTot.filter(v => v));
  if (!vals.length) return `<p class="empty">${o.empty || 'Nema podataka za ovo razdoblje.'}</p>`;
  (o.refs || []).forEach(r => r.y != null && vals.push(r.y));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (o.zero) { lo = Math.min(0, lo); hi = Math.max(0, hi); }
  if (hi === lo) { hi += 1; if (!o.zero) lo -= 1; }
  if (!o.zero) { const p = (hi - lo) * 0.1; lo -= p; hi += p; }
  const step = niceStep((hi - lo) / 4);
  lo = Math.floor(lo / step + 1e-9) * step; hi = Math.ceil(hi / step - 1e-9) * step;
  const y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const cw = (W - L - R) / n, x = i => L + cw * (i + 0.5);
  const dec = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  let g = '';
  for (let v = lo; v <= hi + step / 2; v += step) {
    g += `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" class="ax" text-anchor="end">${fmt(v, dec)}</text>`;
  }
  const base = new Array(n).fill(0);
  const bw = Math.max(1.5, Math.min(cw * 0.62, 26));
  for (const s of o.series.filter(s => s.type === 'bar')) {
    s.values.forEach((v, i) => {
      if (v == null || v === 0) return;
      const b0 = s.stack ? base[i] : Math.max(lo, 0), b1 = b0 + (s.stack ? v : v - (lo > 0 ? lo : 0));
      const y0 = y(b0), y1 = y(s.stack ? b1 : v);
      const col = typeof s.color === 'function' ? s.color(v, i) : s.color;
      g += `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.8, Math.abs(y0 - y1)).toFixed(1)}" rx="${Math.min(3, bw / 3).toFixed(1)}" style="fill:${col}"><title>${h(o.labels[i])}: ${fmt(v, s.dec || 0)} ${s.name || ''}</title></rect>`;
      if (s.stack) base[i] = b1;
    });
  }
  for (const s of o.series.filter(s => s.type === 'line')) {
    let d = '', pen = false;
    s.values.forEach((v, i) => {
      if (v == null) { if (!s.span) pen = false; return; }
      d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); pen = true;
    });
    if (d) g += `<path d="${d}" fill="none" style="stroke:${s.color}" stroke-width="${s.width || 2}" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ' stroke-dasharray="4 3"' : ''}/>`;
  }
  for (const s of o.series.filter(s => s.type === 'dots')) {
    const rr = n > 120 ? 1.4 : n > 45 ? 2 : 3;
    s.values.forEach((v, i) => {
      if (v == null) return;
      g += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${rr}" style="fill:${s.color}" opacity="${s.opacity || 1}"><title>${h(o.labels[i])}: ${fmt(v, s.dec || 0)} ${s.name || ''}</title></circle>`;
    });
  }
  for (const r of o.refs || []) {
    if (r.y == null) continue;
    g += `<line x1="${L}" x2="${W - R}" y1="${y(r.y).toFixed(1)}" y2="${y(r.y).toFixed(1)}" class="ref" style="stroke:${r.color}"/>`;
    if (r.label) g += `<text x="${W - R}" y="${(y(r.y) - 3).toFixed(1)}" text-anchor="end" class="reflbl" style="fill:${r.color}">${h(r.label)}</text>`;
  }
  const every = Math.ceil(n / (o.maxLabels || 7));
  o.labels.forEach((lb, i) => {
    if ((n - 1 - i) % every === 0) g += `<text x="${x(i).toFixed(1)}" y="${H - 5}" class="ax" text-anchor="middle">${h(lb)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${h(o.title || 'graf')}">${g}</svg>`;
}

function donut(parts, size = 92) {
  const tot = sum(parts.map(p => p.v)), r = 38, c = 2 * Math.PI * r;
  let off = 0, s = `<circle cx="50" cy="50" r="${r}" fill="none" style="stroke:var(--soft)" stroke-width="13"/>`;
  if (tot) for (const p of parts) {
    const len = c * p.v / tot;
    s += `<circle cx="50" cy="50" r="${r}" fill="none" style="stroke:${p.color}" stroke-width="13" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 50 50)"/>`;
    off += len;
  }
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="donut">${s}${parts.center || ''}</svg>`;
}

function pbar(label, val, target, color, limit = false) {
  const pct = target ? Math.min(100, val / target * 100) : 0;
  const over = limit && target && val > target;
  return `<div class="pbar"><div class="pbar-h"><span>${label}</span><span class="${over ? 'bad' : ''}"><b>${fmt(val)}</b> / ${fmt(target)} g</span></div>
    <div class="track"><i style="width:${pct}%;background:${over ? 'var(--bad)' : color}"></i></div></div>`;
}

/* ================= Stanje i iscrtavanje ================= */
const state = { tab: 'today', date: today(), week: weekStart(today()), wRange: 90 };
const APK_URL = 'https://github.com/hjelic-spec/porki/releases/latest';
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
let installEvt = null; // Chrome "Instaliraj aplikaciju" (samo web)

const VIEWS = { today: viewToday, food: viewFood, weight: viewWeight, ketones: viewKetones, analysis: viewAnalysis, recipes: viewRecipes };
function render() {
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === state.tab));
  const showDate = state.tab === 'today' || state.tab === 'food';
  $('#datebar').hidden = !showDate;
  if (showDate) {
    $('#dateLabel').textContent = (state.date === today() ? 'Danas · ' : '') + dayLabel(state.date);
    $('#nextDay').disabled = state.date >= today();
  }
  $('#view').innerHTML = VIEWS[state.tab]();
}

/* ---------- Danas ---------- */
function viewToday() {
  const d = state.date, s = db.settings;
  const t = totals(dayFood(d));
  const w = db.weights[d];
  const prev = latestWeight(addDays(d, -1));
  const a7 = avg7(d), a7prev = avg7(addDays(d, -7));
  const e = db.energy[d], burned = burnedOf(e);
  const kets = db.ketones.filter(k => k.date === d).sort((a, b) => a.time.localeCompare(b.time));
  const lastK = kets.at(-1);
  let out = banners();
  if (d === today()) out += fastCard();

  // Težina
  const diff = w != null && prev ? w - prev.kg : null;
  out += `<section class="card">
    <div class="card-h"><h2>Težina</h2><span class="muted">${a7 != null ? `7-dnevni prosjek ${fmt(a7, 1)} kg${a7prev != null ? ` (${sgn(a7 - a7prev)} kg/tj)` : ''}` : 'Važi se ujutro, nakon WC-a'}</span></div>
    <form class="row" data-form="weight">
      <input name="kg" inputmode="decimal" autocomplete="off" placeholder="${prev ? fmt(prev.kg, 1) : 'npr. 85,4'}" value="${w != null ? fmt(w, 1) : ''}" aria-label="Težina u kg">
      <span class="muted">kg</span>
      <button class="btn primary">${w != null ? 'Ažuriraj' : 'Spremi'}</button>
    </form>
    ${diff != null ? `<p class="muted small" style="margin:8px 0 0">${sgn(diff)} kg u odnosu na ${shortDate(prev.date)} · dnevne oscilacije su normalne, prati prosjek</p>` : ''}
  </section>`;

  // Makronutrijenti
  const kc = { c: t.net * 4, f: t.fat * 9, p: t.protein * 4 };
  const kTot = kc.c + kc.f + kc.p;
  const pct = v => kTot ? Math.round(v / kTot * 100) : 0;
  const carbLeft = s.carbLimit - t.net;
  out += `<section class="card">
    <div class="card-h"><h2>Makronutrijenti</h2><span class="muted">${t.n} unos${t.n === 1 ? '' : 'a'}</span></div>
    <div class="carb-hero">
      ${donut(Object.assign([{ v: kc.c, color: 'var(--c-carb)' }, { v: kc.f, color: 'var(--c-fat)' }, { v: kc.p, color: 'var(--c-prot)' }], { center: `<text x="50" y="49" text-anchor="middle" style="fill:var(--ink);font-size:17px;font-weight:700">${fmt(t.kcal)}</text><text x="50" y="63" text-anchor="middle" style="fill:var(--muted);font-size:9px">kcal</text>` }))}
      <div style="flex:1;min-width:0">
        <div class="muted small">Neto ugljikohidrati</div>
        <div class="big ${carbLeft < 0 ? 'bad' : ''}">${fmt(t.net, t.net < 10 ? 1 : 0)}<span class="unit"> / ${s.carbLimit} g</span></div>
        <div class="muted small">${carbLeft >= 0 ? `Preostalo ${fmt(carbLeft, 1)} g` : `<span class="bad">Prekoračeno za ${fmt(-carbLeft, 1)} g</span>`}</div>
        <div class="legend" style="margin-top:6px"><span><i style="background:var(--c-carb)"></i>UH ${pct(kc.c)}%</span><span><i style="background:var(--c-fat)"></i>M ${pct(kc.f)}%</span><span><i style="background:var(--c-prot)"></i>P ${pct(kc.p)}%</span></div>
      </div>
    </div>
    <div style="margin-top:12px">
      ${pbar('Neto UH', t.net, s.carbLimit, 'var(--c-carb)', lowCarb())}
      ${pbar('Proteini', t.protein, s.proteinTarget, 'var(--c-prot)')}
      ${pbar('Masti', t.fat, s.fatTarget, 'var(--c-fat)')}
    </div>
    <div class="btns" style="margin-top:12px"><button class="btn primary" style="flex:1" data-action="add-food">+ Dodaj hranu</button><button class="btn" data-action="scan">Skeniraj</button></div>
  </section>`;

  // Energija
  const bal = burned != null && t.n ? t.kcal - burned : null;
  const parts = [];
  if (e?.active != null) parts.push(`aktivno ${fmt(e.active)}`);
  if (e?.basal != null) parts.push(`mirovanje ${fmt(e.basal)} kcal`);
  if (e?.steps != null) parts.push(`${fmt(e.steps)} koraka`);
  if (d === today()) parts.push('dan još traje');
  out += `<section class="card">
    <div class="card-h"><h2>Potrošnja energije</h2><span class="muted">${e?.src === 'health' ? 'Health Connect' : e ? 'ručni unos' : ''}</span></div>
    ${burned != null || e?.steps != null ? `
      <div class="tiles">
        <div class="tile"><b>${fmt(burned)}</b><span>potrošeno kcal</span></div>
        <div class="tile"><b>${fmt(t.kcal)}</b><span>uneseno kcal</span></div>
        <div class="tile"><b class="${bal == null ? '' : bal <= 0 ? 'good' : 'bad'}">${bal == null ? '–' : sgn(bal, 0)}</b><span>${bal == null ? 'bilanca' : bal <= 0 ? 'deficit' : 'suficit'}</span></div>
      </div>
      <p class="muted small" style="margin:8px 0 0">${parts.join(' · ')}</p>`
    : `<p class="muted" style="margin:0">${NATIVE ? 'Još nema podataka iz Health Connecta za ovaj dan.' : 'Još nema podataka za ovaj dan. Upiši potrošene kalorije iz Health Connecta / Samsung Healtha ili koristi Android aplikaciju za automatski uvoz.'}</p>`}
    <div class="btns" style="margin-top:12px">${healthButtons()}<button class="btn" data-action="energy-edit">Ručno</button><button class="btn" data-action="energy-bulk">Unatrag</button></div>
  </section>`;

  // Ketoni
  out += `<section class="card">
    <div class="card-h"><h2>Keto-Diastix</h2><span class="muted">${kets.length ? kets.length + ' mjerenje' + (kets.length > 1 ? 'a' : '') : ''}</span></div>
    ${lastK ? `<div class="row"><span class="dot" style="width:34px;height:34px;border-radius:8px;background:${KET[lastK.ket].c}"></span>
      <div class="grow"><b>${KET[lastK.ket].l}</b> <span class="muted">(${KET[lastK.ket].mmol} mmol/L) u ${h(lastK.time)}</span><div class="muted small">${KET_TEXT[lastK.ket]}${lastK.glu > 0 ? ` · <span class="bad">glukoza: ${GLU[lastK.glu].l} mg/dL</span>` : ''}</div></div></div>`
    : `<p class="muted" style="margin:0">Nema mjerenja za ovaj dan.</p>`}
    <div class="btns" style="margin-top:12px"><button class="btn" data-action="add-ketone">+ Novo mjerenje</button></div>
  </section>`;
  return out;
}

function healthButtons() {
  if (!NATIVE) return '';
  if (hc.status === 'not_installed' || hc.status === 'update_required')
    return `<button class="btn primary" data-action="hc-open">${hc.status === 'update_required' ? 'Ažuriraj' : 'Instaliraj'} Health Connect</button>`;
  if (hc.status === 'unavailable') return '';
  if (hc.status === 'available' && !hc.granted.length) return `<button class="btn primary" data-action="hc-perm">Dopusti pristup</button>`;
  return `<button class="btn primary" data-action="hc-sync" ${hc.syncing ? 'disabled' : ''}>${hc.syncing ? 'Sinkroniziram…' : 'Sinkroniziraj'}</button>`;
}

function banners() {
  let out = '';
  if (!db.settings.dietChosen) out += `<div class="banner"><span>Odaberi način prehrane i izračunaj svoje dnevne ciljeve.</span><button class="btn primary sm" data-action="goals">Postavi</button></div>`;
  if (installEvt && !db.settings.hideInstall) {
    out += `<div class="banner"><span>Instaliraj aplikaciju na početni zaslon za brži pristup.</span><span class="btns"><button class="btn primary sm" data-action="install">Instaliraj</button><button class="x-btn" data-action="hide-install" aria-label="Zatvori">✕</button></span></div>`;
  }
  if (NATIVE && hc.status === 'available' && !hc.granted.length) {
    out += `<div class="banner"><span>Dopusti čitanje kalorija, koraka i težine iz Health Connecta.</span><button class="btn primary sm" data-action="hc-perm">Dopusti</button></div>`;
  }
  const first = [...weightDates(), ...db.foods.map(f => f.date)].sort()[0];
  const lb = db.settings.lastBackup;
  if (first && daysBetween(first, today()) >= 14 && (!lb || daysBetween(lb, today()) > 30)) {
    out += `<div class="banner warn"><span>Podaci su spremljeni samo na ovom uređaju. ${lb ? `Zadnja kopija: ${shortDate(lb)}` : 'Napravi sigurnosnu kopiju.'}</span><button class="btn sm" data-action="export">Izvezi</button></div>`;
  }
  return out;
}

/* ---------- Hrana ---------- */
function quickItems() {
  const favs = db.favorites.map(f => ({ ...f, fav: true }));
  const names = new Set(favs.map(f => f.name.toLowerCase()));
  const recent = [];
  for (const f of [...db.foods].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))) {
    const k = f.name.toLowerCase();
    if (names.has(k)) continue;
    names.add(k);
    recent.push(f.src ? { name: f.name, per100: true, grams: f.grams, ...f.src } : { name: f.name, carbs: f.carbs, fiber: f.fiber, fat: f.fat, protein: f.protein, grams: f.grams });
    if (recent.length >= 10) break;
  }
  return [...favs, ...recent];
}
// Obroci: unosi istog dana razmaknuti najviše 60 min čine jedan obrok
const toMin = t => { const [H, M] = String(t || '0:0').split(':').map(Number); return H * 60 + (M || 0); };
function mealsOf(date) {
  const meals = [];
  let cur = null, last = -1e9;
  for (const f of dayFood(date)) {
    const m = toMin(f.time);
    if (!cur || m - last > 60) { cur = { items: [], start: f.time, end: f.time }; meals.push(cur); }
    cur.items.push(f); cur.end = f.time; last = m;
  }
  return meals;
}
// Najčešće namirnice zadnjih 90 dana (vrijednosti iz zadnjeg unosa)
function frequentItems(limit = 10) {
  const from = addDays(today(), -89), map = new Map();
  for (const f of db.foods) {
    if (f.date < from) continue;
    const k = norm(f.name), cur = map.get(k);
    if (!cur) map.set(k, { f, n: 1 });
    else { cur.n++; if ((f.date + f.time) > (cur.f.date + cur.f.time)) cur.f = f; }
  }
  const favs = new Set(db.favorites.map(x => norm(x.name)));
  return [...map.entries()]
    .sort((a, b) => b[1].n - a[1].n || (b[1].f.date + b[1].f.time).localeCompare(a[1].f.date + a[1].f.time))
    .slice(0, limit)
    .map(([k, { f, n }]) => ({
      ...(f.src ? { name: f.name, per100: true, grams: f.grams, ...f.src } : { name: f.name, carbs: f.carbs, fiber: f.fiber, fat: f.fat, protein: f.protein, grams: f.grams }),
      inc: f.inc, n, fav: favs.has(k), net: netOf(f), kcal: kcalOf(f)
    }));
}
// Stanje dana u odnosu na ciljeve: kind 'limit' = ne smije se prijeći, 'target' = treba dosegnuti
function statusRow(label, val, goal, kind, unit = 'g') {
  if (!goal) return '';
  const pct = Math.min(100, val / goal * 100), diff = goal - val;
  let txt, cls, col;
  if (kind === 'limit') {
    if (diff >= 0) { txt = `preostalo ${fmt(diff, unit === 'g' ? 1 : 0)} ${unit}`; cls = 'good'; col = 'var(--c-carb)'; }
    else { txt = `preko za ${fmt(-diff, unit === 'g' ? 1 : 0)} ${unit}`; cls = 'bad'; col = 'var(--bad)'; }
  } else if (kind === 'target') {
    if (diff > 0) { txt = `nedostaje ${fmt(diff)} ${unit}`; cls = 'warn'; col = 'var(--c-prot)'; }
    else { txt = 'cilj dosegnut'; cls = 'good'; col = 'var(--good)'; }
  } else { // orijentacijski (masti, kalorije)
    if (diff >= 0) { txt = `preostalo ${fmt(diff)} ${unit}`; cls = 'muted'; col = label === 'Masti' ? 'var(--c-fat)' : 'var(--accent)'; }
    else { txt = `preko za ${fmt(-diff)} ${unit}`; cls = 'warn'; col = 'var(--warn)'; }
  }
  return `<div class="pbar"><div class="pbar-h"><span>${label} <b>${fmt(val, unit === 'g' && val < 10 ? 1 : 0)}</b> / ${fmt(goal)} ${unit}</span><span class="${cls} small"><b>${txt}</b></span></div>
    <div class="track"><i style="width:${pct}%;background:${col}"></i></div></div>`;
}
function lastMealCard() {
  const s = db.settings, meals = mealsOf(state.date), meal = meals.at(-1);
  if (!meal) return `<section class="card"><div class="card-h"><h2>Zadnji obrok</h2></div><p class="muted" style="margin:0">${state.date === today() ? 'Danas još nema obroka.' : 'Nema obroka za ovaj dan.'}</p></section>`;
  const m = totals(meal.items), day = totals(dayFood(state.date));
  const kc = m.net * 4 + m.protein * 4 + m.fat * 9;
  const pct = v => kc ? Math.round(v / kc * 100) : 0;
  const fatPct = pct(m.fat * 9), carbPct = pct(m.net * 4), protPct = pct(m.protein * 4);
  const notes = [];
  if (lowCarb() && s.carbLimit && m.net > s.carbLimit * 0.5) notes.push(['warn', `Ovaj obrok potrošio je ${fmt(m.net / s.carbLimit * 100)}% dnevnog limita UH.`]);
  if (m.protein < 20 && kc > 250) notes.push(['info', 'Malo proteina u obroku – ciljaj oko 25–40 g po glavnom obroku.']);
  if (lowCarb() && kc && carbPct > 10) notes.push(['warn', `UH čine ${carbPct}% kalorija obroka – za ketozu obično ispod 10%.`]);
  if (lowCarb() && kc && fatPct >= 60 && carbPct <= 10 && m.protein >= 20) notes.push(['good', 'Dobro složen LCHF obrok.']);
  if (!lowCarb() && kc && m.protein >= 25 && m.kcal <= (s.kcalTarget || 2000) * 0.45) notes.push(['good', 'Dobro uravnotežen obrok s dovoljno proteina.']);
  return `<section class="card">
    <div class="card-h"><h2>Zadnji obrok</h2><span class="muted">${meal.start === meal.end ? h(meal.start) : `${h(meal.start)}–${h(meal.end)}`}${meals.length > 1 ? ` · ${meals.length}. obrok` : ''}</span></div>
    <p class="muted small" style="margin:-4px 0 10px">${meal.items.map(f => h(f.name)).join(', ')}</p>
    <div class="tiles tiles4">
      <div class="tile"><b style="color:var(--c-carb)">${fmt(m.net, 1)} g</b><span>neto UH</span></div>
      <div class="tile"><b style="color:var(--c-prot)">${fmt(m.protein)} g</b><span>proteini</span></div>
      <div class="tile"><b style="color:var(--c-fat)">${fmt(m.fat)} g</b><span>masti</span></div>
      <div class="tile"><b>${fmt(m.kcal)}</b><span>kcal</span></div>
    </div>
    <div class="legend" style="margin-top:8px"><span><i style="background:var(--c-fat)"></i>masti ${fatPct}%</span><span><i style="background:var(--c-prot)"></i>proteini ${protPct}%</span><span><i style="background:var(--c-carb)"></i>UH ${carbPct}%</span></div>
    ${notes.length ? `<ul class="insights" style="margin-top:8px">${notes.map(([c, t]) => `<li class="${c}">${t}</li>`).join('')}</ul>` : ''}
    <h3>Stanje dana nakon obroka</h3>
    ${statusRow('Neto UH', day.net, s.carbLimit, lowCarb() ? 'limit' : 'soft')}
    ${statusRow('Proteini', day.protein, s.proteinTarget, 'target')}
    ${statusRow('Masti', day.fat, s.fatTarget, 'soft')}
    ${statusRow('Kalorije', day.kcal, s.kcalTarget, 'soft', 'kcal')}
  </section>`;
}
function viewFood() {
  const items = dayFood(state.date), t = totals(items);
  state.quick = frequentItems();
  const favNames = new Set(db.favorites.map(f => f.name.toLowerCase()));
  return `
  ${lastMealCard()}
  <section class="card">
    <div class="card-h"><h2>Najčešće namirnice</h2><button class="btn ghost sm" data-action="edit-favs">★ Favoriti${db.favorites.length ? ' (' + db.favorites.length + ')' : ''}</button></div>
    ${state.quick.length ? `<div class="freq">${state.quick.map((q, i) => `
      <button class="freq-item" data-action="quick" data-i="${i}">
        <span class="name">${q.fav ? '<span style="color:#e0a800">★</span> ' : ''}${h(q.name)}</span>
        <span class="muted small">UH ${fmt(q.net, 1)} g · ${fmt(q.kcal)} kcal</span>
        <span class="freq-n">${q.n}×</span>
      </button>`).join('')}</div>`
      : '<p class="muted" style="margin:0">Ovdje će se pojaviti namirnice koje najčešće unosiš – jednim dodirom ih dodaš ponovno.</p>'}
    <div class="btns" style="margin-top:10px"><button class="btn primary" style="flex:1" data-action="add-food">+ Dodaj hranu</button><button class="btn" data-action="scan">Skeniraj</button></div>
  </section>
  <section class="card">
    <div class="card-h"><h2>Unosi</h2><span class="muted">${fmt(t.kcal)} kcal</span></div>
    ${items.length ? `<ul class="list">${items.map(f => `
      <li>
        <button class="tap" data-action="edit-food" data-id="${f.id}">
          <div class="name">${h(f.name)}${f.grams ? ` <span class="muted">${fmt(f.grams)} g</span>` : ''}</div>
          <div class="muted small">${h(f.time || '')} · UH ${fmt(netOf(f), 1)} · M ${fmt(f.fat, 1)} · P ${fmt(f.protein, 1)} · ${fmt(kcalOf(f))} kcal</div>
        </button>
        <button class="star ${favNames.has(f.name.toLowerCase()) ? 'on' : ''}" data-action="fav-toggle" data-id="${f.id}" aria-label="Favorit">★</button>
      </li>`).join('')}</ul>` : '<p class="empty">Nema unosa za ovaj dan.</p>'}
  </section>`;
}

/* ---------- Težina ---------- */
function viewWeight() {
  const s = db.settings, ds = weightDates();
  const cur = ds.length ? db.weights[ds.at(-1)] : null;
  const start = ds.length ? db.weights[ds[0]] : null;
  const rate = weeklyRate();
  const bmi = cur && s.heightCm ? cur / (s.heightCm / 100) ** 2 : null;
  const goal = num(s.goalWeight);
  let eta = '';
  if (goal && cur && rate && rate < -0.05 && cur > goal) {
    const weeks = (cur - goal) / -rate;
    const d = addDays(today(), Math.round(weeks * 7));
    eta = `Uz trenutni tempo cilj ${fmt(goal, 1)} kg oko ${shortDate(d)}${d.slice(0, 4)}.`;
  }
  // Graf
  const end = today();
  let from = state.wRange === 0 ? (ds[0] || end) : addDays(end, -state.wRange + 1);
  if (ds[0] && from < ds[0] && state.wRange !== 0) from = ds[0] > addDays(end, -13) ? addDays(end, -13) : ds[0];
  const n = daysBetween(from, end) + 1, labels = [], pts = [], avg = [];
  for (let i = 0; i < n; i++) {
    const d = addDays(from, i);
    labels.push(shortDate(d)); pts.push(db.weights[d] ?? null);
    avg.push(db.weights[d] != null || i === n - 1 ? avg7(d) : null);
  }
  const ranges = [[30, '30 d'], [90, '3 mj'], [180, '6 mj'], [365, '1 g'], [0, 'Sve']];
  return `
  <section class="card">
    <div class="card-h"><h2>Kretanje težine</h2>
      <div class="seg">${ranges.map(([v, l]) => `<button class="${state.wRange === v ? 'on' : ''}" data-action="wrange" data-v="${v}">${l}</button>`).join('')}</div></div>
    ${chart({ labels, h: 190, title: 'Težina', series: [{ type: 'dots', values: pts, color: 'var(--muted)', opacity: .7, dec: 1, name: 'kg' }, { type: 'line', values: avg, color: 'var(--c-weight)', span: true, width: 2.5 }], refs: goal ? [{ y: goal, color: 'var(--accent)', label: 'cilj ' + fmt(goal, 1) }] : [], empty: 'Unesi težinu na kartici Danas ili ispod.' })}
    <div class="legend" style="margin-top:4px"><span><i style="background:var(--muted)"></i>dnevno mjerenje</span><span><i style="background:var(--c-weight)"></i>7-dnevni prosjek</span></div>
  </section>
  <section class="card">
    <div class="tiles">
      <div class="tile"><b>${fmt(cur, 1)}</b><span>trenutno kg</span></div>
      <div class="tile"><b class="${start && cur ? (cur - start <= 0 ? 'good' : 'bad') : ''}">${start && cur ? sgn(cur - start) : '–'}</b><span>od početka (${ds[0] ? shortDate(ds[0]) : '–'})</span></div>
      <div class="tile"><b class="${rate == null ? '' : rate <= 0 ? 'good' : 'bad'}">${rate == null ? '–' : sgn(rate, 2)}</b><span>kg/tjedan (3 tj)</span></div>
      <div class="tile"><b>${goal && cur ? fmt(Math.max(0, cur - goal), 1) : '–'}</b><span>do cilja kg</span></div>
      <div class="tile"><b>${fmt(bmi, 1)}</b><span>BMI${s.heightCm ? '' : ' (unesi visinu)'}</span></div>
      <div class="tile"><b>${ds.length}</b><span>mjerenja</span></div>
    </div>
    ${eta ? `<p class="muted small" style="margin:10px 0 0">${eta}</p>` : ''}
  </section>
  <section class="card">
    <div class="card-h"><h2>Unos</h2></div>
    <form class="row" data-form="weight-any">
      <input type="date" name="date" value="${state.date}" max="${today()}" style="flex:1.7">
      <input name="kg" inputmode="decimal" placeholder="kg" autocomplete="off" style="flex:1">
      <button class="btn primary">Spremi</button>
    </form>
    <h3>Zadnja mjerenja</h3>
    ${ds.length ? `<ul class="list">${ds.slice(-14).reverse().map((d, i, arr) => {
      const prevD = ds[ds.indexOf(d) - 1];
      const dd = prevD ? db.weights[d] - db.weights[prevD] : null;
      return `<li><div class="grow">${dayLabel(d)}</div><b>${fmt(db.weights[d], 1)} kg</b><span class="small ${dd == null ? 'muted' : dd <= 0 ? 'good' : 'bad'}" style="width:48px;text-align:right">${dd == null ? '' : sgn(dd)}</span><button class="x-btn" data-action="del-weight" data-d="${d}" aria-label="Obriši">✕</button></li>`;
    }).join('')}</ul>` : '<p class="empty">Još nema mjerenja.</p>'}
  </section>`;
}

/* ---------- Ketoni ---------- */
function viewKetones() {
  const end = today();
  const cells = [];
  for (let i = 29; i >= 0; i--) {
    const d = addDays(end, -i);
    const ks = db.ketones.filter(k => k.date === d);
    const m = ks.length ? Math.max(...ks.map(k => k.ket)) : null;
    cells.push(`<span class="${m == null ? 'none' : ''}" style="${m != null ? `background:${KET[m].c}` : ''}" title="${shortDate(d)}${m != null ? ': ' + KET[m].l : ''}"></span>`);
  }
  const recent = [...db.ketones].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 25);
  const last30 = db.ketones.filter(k => daysBetween(k.date, end) < 30);
  const daysIn = new Set(last30.filter(k => k.ket >= 1).map(k => k.date)).size;
  const daysMeasured = new Set(last30.map(k => k.date)).size;
  return `
  <section class="card">
    <div class="card-h"><h2>Zadnjih 30 dana</h2><span class="muted">${daysMeasured ? `u ketozi ${daysIn}/${daysMeasured} dana` : ''}</span></div>
    <div class="strip">${cells.join('')}</div>
    <div class="legend" style="margin-top:8px">${KET.map(k => `<span><i style="background:${k.c};outline:1px solid var(--line)"></i>${k.l}</span>`).join('')}</div>
    <button class="btn primary block" style="margin-top:12px" data-action="add-ketone">+ Novo mjerenje</button>
  </section>
  <section class="card">
    <div class="card-h"><h2>Mjerenja</h2></div>
    ${recent.length ? `<ul class="list">${recent.map(k => `
      <li><span class="dot" style="background:${KET[k.ket].c}"></span>
        <div class="grow"><div><b>${KET[k.ket].l}</b> <span class="muted small">${KET[k.ket].mmol} mmol/L</span>${k.glu > 0 ? ` <span class="bad small">· glukoza ${GLU[k.glu].l}</span>` : ''}</div>
        <div class="muted small">${dayLabel(k.date)} u ${h(k.time)}${k.note ? ' · ' + h(k.note) : ''}</div></div>
        <button class="x-btn" data-action="del-ketone" data-id="${k.id}" aria-label="Obriši">✕</button></li>`).join('')}</ul>`
      : '<p class="empty">Još nema mjerenja.</p>'}
  </section>
  <section class="card help">
    <h2>Savjeti za trakice</h2>
    <ol>
      <li>Mjeri uvijek u slično doba dana (npr. navečer ili prije doručka) – rezultati su tada usporedivi.</li>
      <li>Ketone očitaj nakon <b>15 sekundi</b>, glukozu nakon <b>30 sekundi</b>.</li>
      <li>Nakon nekoliko tjedana keto-adaptacije trakice često pokazuju manje – tijelo ketone bolje iskorištava. Negativan nalaz tada ne znači da si izašao iz ketoze.</li>
      <li>Puno vode razrjeđuje urin i snižava očitanje.</li>
      <li>Glukoza u urinu nije uobičajena. Ako se ponavlja – ili su ketoni visoki uz glukozu – javi se liječniku.</li>
    </ol>
  </section>`;
}

/* ---------- Analiza ---------- */
function weekData(ws) {
  return [...Array(7)].map((_, i) => {
    const d = addDays(ws, i), fl = dayFood(d), t = totals(fl), e = db.energy[d], burned = burnedOf(e);
    const ks = db.ketones.filter(k => k.date === d);
    return {
      d, logged: fl.length > 0, ...t, burned, steps: e?.steps ?? null,
      balance: fl.length && burned != null ? t.kcal - burned : null,
      weight: db.weights[d] ?? null,
      ket: ks.length ? Math.max(...ks.map(k => k.ket)) : null,
      glu: ks.length ? Math.max(...ks.map(k => k.glu || 0)) : null
    };
  });
}
function insights(wd, prev) {
  const s = db.settings, out = [], L = wd.filter(x => x.logged);
  const add = (type, text) => out.push({ type, text });
  if (!L.length) add('info', 'Ovaj tjedan još nema unosa hrane.');
  else {
    const within = L.filter(x => x.net <= s.carbLimit).length;
    add(within === L.length ? 'good' : within >= L.length * 0.7 ? 'warn' : 'bad',
      `Neto UH unutar limita (${s.carbLimit} g): ${within} od ${L.length} dana s unosom. Prosjek ${fmt(mean(L.map(x => x.net)), 1)} g/dan.`);
    const avgP = mean(L.map(x => x.protein));
    if (s.proteinTarget) {
      if (avgP < s.proteinTarget * 0.85) add('warn', `Proteini u prosjeku ${fmt(avgP)} g – ispod cilja ${s.proteinTarget} g. Dovoljno proteina čuva mišiće dok mršaviš.`);
      else add('good', `Proteini u prosjeku ${fmt(avgP)} g/dan – cilj je pokriven.`);
    }
    const kc = sum(L.map(x => x.kcal));
    const fatPct = kc ? sum(L.map(x => x.fat * 9)) / kc * 100 : 0;
    const carbPct = kc ? sum(L.map(x => x.net * 4)) / kc * 100 : 0;
    if (kc) {
      if (lowCarb() && carbPct > 10) add('warn', `Ugljikohidrati čine ${fmt(carbPct)}% kalorija – za ketozu obično ispod 5–10%.`);
      if (lowCarb()) add(fatPct >= 60 ? 'good' : 'info', `Raspodjela kalorija: masti ${fmt(fatPct)}%, proteini ${fmt(100 - fatPct - carbPct)}%, UH ${fmt(carbPct)}%.${fatPct < 60 ? ' Klasični LCHF je 65–75% masti; ako mršaviš bez gladi, manje masti je u redu.' : ''}`);
      else add('info', `Raspodjela kalorija: UH ${fmt(carbPct)}%, proteini ${fmt(100 - fatPct - carbPct)}%, masti ${fmt(fatPct)}%.`);
    }
    const avgK = mean(L.map(x => x.kcal));
    if (s.kcalTarget && avgK > s.kcalTarget * 1.1) add('warn', `Prosječan unos ${fmt(avgK)} kcal je iznad cilja od ${fmt(s.kcalTarget)} kcal.`);
    if (L.length < 5) add('info', `Hrana je unesena za ${L.length} od 7 dana – što je dnevnik potpuniji, analiza je točnija.`);
  }
  const B = wd.filter(x => x.balance != null);
  if (B.length) {
    const tot = sum(B.map(x => x.balance));
    add(tot <= 0 ? 'good' : 'warn', `Energetska bilanca za ${B.length} dana: ${sgn(tot, 0)} kcal ≈ ${sgn(tot / 7700, 2)} kg masnog tkiva.`);
  } else add('info', 'Za izračun bilance poveži potrošnju iz aplikacije Zdravlje (kartica Danas).');
  const aw = mean(wd.filter(x => x.weight != null).map(x => x.weight));
  const pw = mean(prev.filter(x => x.weight != null).map(x => x.weight));
  if (aw != null && pw != null) {
    const dd = aw - pw;
    add(dd <= 0 ? 'good' : 'warn', `Prosječna težina ${fmt(aw, 1)} kg (${sgn(dd)} kg u odnosu na prošli tjedan).`);
    if (dd < -1.5) add('info', 'Veliki pad u prvim tjednima LCHF-a većinom je voda (glikogen) – tempo će se usporiti, to je normalno.');
    if (dd > 0.5 && L.some(x => x.net > s.carbLimit)) add('info', 'Dani iznad limita UH vraćaju vodu u tijelo – skok na vagi ne znači odmah i više masti.');
  } else if (wd.filter(x => x.weight != null).length < 4) add('info', 'Važi se svakodnevno u isto vrijeme – tjedni prosjek pouzdaniji je od pojedinačnog mjerenja.');
  const K = wd.filter(x => x.ket != null);
  if (K.length) {
    const inK = K.filter(x => x.ket >= 1).length;
    add(inK === K.length ? 'good' : inK ? 'info' : 'warn', `Ketoni pozitivni ${inK} od ${K.length} dana mjerenja.`);
    if (K.some(x => x.ket >= 4)) add('warn', 'Bilo je visokih očitanja ketona – pij dovoljno vode i nadoknadi elektrolite (sol, magnezij, kalij).');
  }
  if (wd.some(x => x.glu > 0)) add('bad', 'Trakice su pokazale glukozu u urinu. Ako se ponavlja, javi se liječniku – osobito ako su i ketoni visoki.');
  return out;
}
/* ---------- Očekivani (iz kalorijske bilance) vs. stvarni gubitak ---------- */
const KCAL_PER_KG = 7700;
const tjedan = n => n % 10 === 1 && n % 100 !== 11 ? 'tjedan' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'tjedna' : 'tjedana';
// Za tjedan: očekivana promjena (kg) iz bilance i stvarna promjena (razlika tjednih prosjeka težine)
function weekEnergyVsScale(ws) {
  const wd = weekData(ws), prev = weekData(addDays(ws, -7));
  const B = wd.filter(x => x.balance != null);
  const sumBal = sum(B.map(x => x.balance));
  const expected = B.length ? sumBal / KCAL_PER_KG : null;                         // samo dani s podacima
  const expectedWeek = B.length >= 3 ? mean(B.map(x => x.balance)) * 7 / KCAL_PER_KG : null; // procjena za 7 dana
  const wNow = wd.filter(x => x.weight != null), wPrev = prev.filter(x => x.weight != null);
  let actual = null, actualHow = '';
  if (wNow.length && wPrev.length) { actual = mean(wNow.map(x => x.weight)) - mean(wPrev.map(x => x.weight)); actualHow = 'prosjek tjedna u odnosu na prošli tjedan'; }
  else if (wNow.length >= 2) { actual = wNow.at(-1).weight - wNow[0].weight; actualHow = `od ${shortDate(wNow[0].d)} do ${shortDate(wNow.at(-1).d)}`; }
  const avgBal = B.length ? sumBal / B.length : null;
  const avgW = mean([...wNow, ...wPrev].map(x => x.weight));
  return { ws, days: B.length, sumBal, avgBal, expected, expectedWeek, actual, actualHow, avgW, wd };
}
function energyVsScaleCard(ws) {
  const s = db.settings, e = weekEnergyVsScale(ws);
  const exp = e.expectedWeek ?? e.expected;
  const kg = v => v == null ? '–' : `${sgn(v, 2)} kg`;
  // 8 tjedana: očekivano vs stvarno
  const weeks = [...Array(8)].map((_, i) => weekEnergyVsScale(addDays(ws, -7 * (7 - i))));
  const both = weeks.filter(w => w.expectedWeek != null && w.actual != null);
  const cumExp = sum(both.map(w => w.expectedWeek)), cumAct = sum(both.map(w => w.actual));
  // Tumačenje tjedna
  const notes = [];
  const add = (type, text) => notes.push({ type, text });
  if (exp == null) add('info', 'Za izračun su potrebni dani s unesenom hranom i potrošnjom (Health Connect ili ručni unos) – barem 3 dana u tjednu.');
  if (exp != null && e.actual != null) {
    const d = e.actual - exp;
    if (Math.abs(d) <= 0.3) add('good', 'Stvarna promjena je u skladu s kalorijskom bilancom – unos i potrošnja su dobro procijenjeni.');
    else if (d < 0) add('info', `Stvarni gubitak je ${fmt(-d, 1)} kg veći nego što bilanca predviđa. Najčešće je to voda i glikogen (osobito u prvim tjednima LCHF-a ili nakon dana s više UH), a moguće je i da je unos hrane precijenjen ili potrošnja podcijenjena.`);
    else add('warn', `Gubitak je ${fmt(d, 1)} kg manji od očekivanog. Moguće je zadržavanje vode (sol, stres, loš san, novi trening, hormonski ciklus), neupisane kalorije (ulja, umaci, orašasti plodovi, „kušanje“) ili precijenjena potrošnja s pametnog sata.`);
  } else if (exp != null) add('info', 'Za usporedbu sa stvarnim gubitkom važi se barem 2 puta tjedno, a idealno svaki dan.');
  if (both.length >= 3 && cumAct - cumExp > 0.5) {
    const perDay = (cumAct - cumExp) * KCAL_PER_KG / (both.length * 7);
    add('warn', `Kroz ${both.length} ${tjedan(both.length)} stvarni gubitak zaostaje za očekivanim za ${fmt(cumAct - cumExp, 1)} kg – to odgovara razlici od oko ${fmt(perDay)} kcal dnevno. Provjeri točnost unosa ili računaj s manjom potrošnjom od one koju pokazuje sat.`);
  }
  // Zdravlje
  const health = [];
  const hAdd = (type, text) => health.push({ type, text });
  const bw = e.avgW || latestWeight(addDays(ws, 6))?.kg;
  if (e.avgBal != null && e.avgBal < -1000) hAdd('warn', `Prosječni deficit od ${fmt(-e.avgBal)} kcal dnevno je velik. Dugotrajno veliki deficit povećava rizik gubitka mišića, umora, opadanja kose i žučnih kamenaca.`);
  if (bw && exp != null && -exp > bw * 0.01) hAdd('warn', `Očekivani gubitak od ${fmt(-exp, 1)} kg tjedno veći je od 1 % tjelesne težine – za održiv gubitak masti preporučuje se 0,5–1 % tjedno.`);
  if (bw && e.actual != null && -e.actual > bw * 0.015) hAdd('info', 'Stvarni pad veći od 1,5 % težine u tjednu najčešće je voda – nije razlog za dodatno smanjivanje hrane.');
  const L = e.wd.filter(x => x.logged);
  if (L.length && s.proteinTarget && mean(L.map(x => x.protein)) < s.proteinTarget * 0.85) hAdd('warn', 'Unos proteina je ispod cilja – u deficitu je dovoljno proteina ključno za očuvanje mišića.');
  const lowDays = L.filter(x => x.kcal < 1200).length;
  if (lowDays >= 3) hAdd('warn', `${lowDays} dana s unosom ispod 1200 kcal – tako nizak unos teško pokriva potrebe za vitaminima i mineralima.`);
  if (!health.length) hAdd('good', 'Tempo i unos ovog tjedna izgledaju umjereno i održivo.');
  return `<section class="card">
    <div class="card-h"><h2>Očekivano vs. stvarno</h2><span class="muted">${e.days ? `${e.days} od 7 dana s bilancom` : ''}</span></div>
    <div class="tiles">
      <div class="tile"><b class="${exp == null ? '' : exp <= 0 ? 'good' : 'bad'}">${kg(exp)}</b><span>očekivano (bilanca${e.days && e.days < 7 && e.expectedWeek != null ? ', procjena 7 d' : ''})</span></div>
      <div class="tile"><b class="${e.actual == null ? '' : e.actual <= 0 ? 'good' : 'bad'}">${kg(e.actual)}</b><span>stvarno (vaga)</span></div>
      <div class="tile"><b>${exp != null && e.actual != null ? sgn(e.actual - exp, 2) + ' kg' : '–'}</b><span>razlika</span></div>
    </div>
    <p class="muted small" style="margin:8px 0 0">Bilanca tjedna ${e.days ? `${sgn(e.sumBal, 0)} kcal (Ø ${sgn(e.avgBal, 0)} kcal/dan)` : '–'}${e.actualHow ? ` · stvarno: ${e.actualHow}` : ''}</p>
    <ul class="insights" style="margin-top:8px">${notes.map(n => `<li class="${n.type}">${n.text}</li>`).join('')}</ul>
    <h3>Zadnjih 8 tjedana</h3>
    ${chart({ labels: weeks.map(w => shortDate(w.ws)), h: 160, zero: true, maxLabels: 8,
      series: [
        { type: 'bar', values: weeks.map(w => w.expectedWeek != null ? Math.round(w.expectedWeek * 100) / 100 : null), color: 'color-mix(in srgb, var(--accent) 45%, transparent)', dec: 2, name: 'kg očekivano' },
        { type: 'line', values: weeks.map(w => w.actual != null ? Math.round(w.actual * 100) / 100 : null), color: 'var(--ink)', width: 2 },
        { type: 'dots', values: weeks.map(w => w.actual != null ? Math.round(w.actual * 100) / 100 : null), color: 'var(--ink)', dec: 2, name: 'kg stvarno' }
      ], empty: 'Još nema dovoljno podataka o bilanci i težini.' })}
    <div class="legend" style="margin-top:4px"><span><i style="background:color-mix(in srgb, var(--accent) 45%, transparent)"></i>očekivano iz bilance</span><span><i style="background:var(--ink)"></i>stvarno na vagi</span></div>
    ${both.length ? `<p class="small" style="margin:8px 0 0">Ukupno za ${both.length} ${tjedan(both.length)} s podacima: očekivano <b>${sgn(cumExp, 1)} kg</b>, stvarno <b>${sgn(cumAct, 1)} kg</b>.</p>` : ''}
    <h3>Zdravlje</h3>
    <ul class="insights">${health.map(n => `<li class="${n.type}">${n.text}</li>`).join('')}</ul>
    <details class="explain">
      <summary>Kako se računa i na što pripaziti</summary>
      <div class="help">
        <p><b>Očekivani gubitak</b> = zbroj dnevne bilance (unos hrane − potrošnja) ÷ 7700 kcal, koliko otprilike sadrži 1 kg masnog tkiva. Računaju se samo dani s unesenom hranom i poznatom potrošnjom; ako ih je manje od 7, prosjek se preračuna na cijeli tjedan.</p>
        <p><b>Stvarna promjena</b> = prosjek težine ovog tjedna minus prosjek prošlog tjedna. Prosjeci su pouzdaniji od pojedinačnih mjerenja jer težina dnevno oscilira 0,5–1,5 kg.</p>
        <p><b>Zašto se razlikuju:</b> vaga mjeri i vodu, glikogen (1 g glikogena veže oko 3 g vode), sadržaj crijeva i sol. Na početku LCHF-a pad je brži od bilance jer se troši glikogen; nakon dana s više UH težina skoči iako masti nije više. Pametni satovi potrošnju često precijene za 10–30 %, a unos hrane se lako podcijeni. Zato gledaj trend kroz 3–4 tjedna, a ne pojedini tjedan.</p>
        <p><b>Na što pripaziti radi zdravlja:</b></p>
        <ol>
          <li>Ciljaj gubitak 0,5–1 % tjelesne težine tjedno; prebrzo mršavljenje povećava rizik gubitka mišića i žučnih kamenaca.</li>
          <li>Dovoljno proteina (oko 1,2–1,6 g po kg ciljne težine) i trening snage čuvaju mišiće.</li>
          <li>Pij dovoljno vode i nadoknadi elektrolite – posebno sol (natrij), magnezij i kalij – osobito u prvim tjednima (glavobolja, umor i grčevi znak su „keto gripe“).</li>
          <li>Jedi dovoljno povrća s malo UH zbog vlakana, vitamina i probave.</li>
          <li>San i stres utječu na zadržavanje vode i apetit.</li>
          <li>Važi se u isto vrijeme (ujutro, nakon WC-a), a povremeno izmjeri i opseg struka – mijenja se i kad vaga stoji.</li>
          <li>Ako uzimaš lijekove za šećer ili tlak, LCHF može zahtijevati prilagodbu doze – dogovori se s liječnikom. Povremeno provjeri krvne nalaze (masnoće, glukoza, jetra, bubrezi).</li>
        </ol>
        <p class="muted small">Ovo su opće smjernice, a ne medicinski savjet.</p>
      </div>
    </details>
  </section>`;
}
function viewAnalysis() {
  const ws = state.week, we = addDays(ws, 6), s = db.settings;
  const wd = weekData(ws), prev = weekData(addDays(ws, -7));
  const L = wd.filter(x => x.logged);
  const labels = wd.map(x => DAYS[parseISO(x.d).getDay()]);
  const tbl = wd.map(x => `<tr><td>${DAYS[parseISO(x.d).getDay()]} ${shortDate(x.d)}</td>
      <td class="${x.logged && x.net > s.carbLimit ? 'bad' : ''}">${x.logged ? fmt(x.net, 1) : '–'}</td><td>${x.logged ? fmt(x.fat) : '–'}</td><td>${x.logged ? fmt(x.protein) : '–'}</td>
      <td>${x.logged ? fmt(x.kcal) : '–'}</td><td>${fmt(x.burned)}</td><td class="${x.balance == null ? '' : x.balance <= 0 ? 'good' : 'bad'}">${x.balance == null ? '–' : sgn(x.balance, 0)}</td>
      <td>${fmt(x.weight, 1)}</td><td>${x.ket == null ? '–' : `<span class="dot" style="background:${KET[x.ket].c};width:11px;height:11px"></span>`}</td></tr>`).join('');
  const avgOf = k => mean(L.map(x => x[k]));
  // trend 8 tjedana
  const weeks = [...Array(8)].map((_, i) => addDays(ws, -7 * (7 - i)));
  const wk = weeks.map(w => {
    const d = weekData(w), l = d.filter(x => x.logged), b = d.filter(x => x.balance != null);
    return { w, weight: mean(d.filter(x => x.weight != null).map(x => x.weight)), net: mean(l.map(x => x.net)), bal: b.length ? sum(b.map(x => x.balance)) : null };
  });
  const thisWeek = ws === weekStart(today());
  return `
  <section class="card">
    <div class="card-h" style="align-items:center;margin:0">
      <button class="icon-btn" data-action="prev-week" aria-label="Prethodni tjedan">‹</button>
      <div style="text-align:center"><b>${shortDate(ws)} – ${shortDate(we)}${we.slice(0, 4)}</b><div class="muted small">${thisWeek ? 'ovaj tjedan' : 'tjedni pregled'}</div></div>
      <button class="icon-btn" data-action="next-week" ${thisWeek ? 'disabled' : ''} aria-label="Sljedeći tjedan">›</button>
    </div>
  </section>
  <section class="card">
    <div class="tiles">
      <div class="tile"><b>${fmt(avgOf('net'), 1)}</b><span>Ø neto UH g</span></div>
      <div class="tile"><b>${fmt(avgOf('fat'))}</b><span>Ø masti g</span></div>
      <div class="tile"><b>${fmt(avgOf('protein'))}</b><span>Ø proteini g</span></div>
      <div class="tile"><b>${fmt(avgOf('kcal'))}</b><span>Ø unos kcal</span></div>
      <div class="tile"><b>${fmt(mean(wd.filter(x => x.burned != null).map(x => x.burned)))}</b><span>Ø potrošnja kcal</span></div>
      <div class="tile"><b>${fmt(mean(wd.filter(x => x.steps != null).map(x => x.steps)))}</b><span>Ø koraka</span></div>
    </div>
  </section>
  <section class="card"><div class="card-h"><h2>Uvidi</h2></div>
    <ul class="insights">${insights(wd, prev).map(i => `<li class="${i.type}">${i.text}</li>`).join('')}</ul>
  </section>
  ${energyVsScaleCard(ws)}
  <section class="card"><div class="card-h"><h2>Neto ugljikohidrati</h2><span class="muted">g/dan</span></div>
    ${chart({ labels, h: 150, zero: true, series: [{ type: 'bar', values: wd.map(x => x.logged ? r1(x.net) : null), color: v => v > s.carbLimit ? 'var(--bad)' : 'var(--c-carb)', dec: 1, name: 'g' }], refs: [{ y: s.carbLimit, color: 'var(--bad)', label: 'limit ' + s.carbLimit }], empty: 'Nema unosa hrane ovaj tjedan.' })}
  </section>
  <section class="card"><div class="card-h"><h2>Kalorije: unos i potrošnja</h2></div>
    ${chart({ labels, h: 170, zero: true, series: [
      { type: 'bar', stack: true, values: wd.map(x => x.logged ? Math.round(x.net * 4) : null), color: 'var(--c-carb)', name: 'kcal iz UH' },
      { type: 'bar', stack: true, values: wd.map(x => x.logged ? Math.round(x.protein * 4) : null), color: 'var(--c-prot)', name: 'kcal iz proteina' },
      { type: 'bar', stack: true, values: wd.map(x => x.logged ? Math.round(x.fat * 9) : null), color: 'var(--c-fat)', name: 'kcal iz masti' },
      { type: 'line', values: wd.map(x => x.burned), color: 'var(--c-burn)', width: 2 },
      { type: 'dots', values: wd.map(x => x.burned), color: 'var(--c-burn)', name: 'kcal potrošeno' }
    ], refs: s.kcalTarget ? [{ y: s.kcalTarget, color: 'var(--muted)', label: 'cilj' }] : [] })}
    <div class="legend" style="margin-top:4px"><span><i style="background:var(--c-fat)"></i>masti</span><span><i style="background:var(--c-prot)"></i>proteini</span><span><i style="background:var(--c-carb)"></i>UH</span><span><i style="background:var(--c-burn)"></i>potrošeno</span></div>
  </section>
  <section class="card"><div class="card-h"><h2>Po danima</h2></div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Dan</th><th>UH</th><th>M</th><th>P</th><th>kcal</th><th>Potr.</th><th>Bil.</th><th>kg</th><th>Ket</th></tr></thead>
      <tbody>${tbl}</tbody></table></div>
  </section>
  ${fastWeekCard(ws, we)}
  <section class="card"><div class="card-h"><h2>Trend zadnjih 8 tjedana</h2></div>
    ${chart({ labels: wk.map(x => shortDate(x.w)), h: 150, maxLabels: 8, series: [{ type: 'line', values: wk.map(x => x.weight), color: 'var(--c-weight)', span: true }, { type: 'dots', values: wk.map(x => x.weight), color: 'var(--c-weight)', dec: 1, name: 'kg' }], empty: 'Premalo mjerenja težine.' })}
    <div class="tbl-wrap"><table class="tbl" style="margin-top:8px">
      <thead><tr><th>Tjedan</th><th>Ø kg</th><th>Ø neto UH</th><th>Bilanca kcal</th></tr></thead>
      <tbody>${wk.slice().reverse().map(x => `<tr><td>${shortDate(x.w)}</td><td>${fmt(x.weight, 1)}</td><td>${fmt(x.net, 1)}</td><td class="${x.bal == null ? '' : x.bal <= 0 ? 'good' : 'bad'}">${x.bal == null ? '–' : sgn(x.bal, 0)}</td></tr>`).join('')}</tbody>
    </table></div>
  </section>`;
}

/* ================= Dijalozi ================= */
const dlg = $('#dlg');
let dlgSubmit = null;
function openDialog(html, onSubmit, onReady) {
  dlg.innerHTML = `<form class="sheet" method="dialog" novalidate>${html}</form>`;
  // Gornja traka koja ostaje vidljiva pri pomicanju: naslov, zatvori i glavni gumb (kopija donjeg)
  const form = dlg.querySelector('form'), title = form.querySelector('h2');
  if (title) {
    const submit = [...form.querySelectorAll('button')].filter(b => b.type === 'submit').at(-1);
    const head = document.createElement('div');
    head.className = 'sheet-head';
    head.innerHTML = `<span class="sheet-actions">${submit ? `<button class="btn primary sm">${h(submit.textContent.trim())}</button>` : ''}<button type="button" class="icon-btn" data-action="close" aria-label="Zatvori">✕</button></span>`;
    title.replaceWith(head);
    head.prepend(title);
  }
  dlgSubmit = onSubmit;
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  onReady && onReady(dlg.querySelector('form'));
}
function closeDialog() { dlg.close(); dlg.innerHTML = ''; }
dlg.addEventListener('submit', ev => {
  ev.preventDefault();
  if (!dlgSubmit) return closeDialog();
  const fd = Object.fromEntries(new FormData(ev.target));
  if (dlgSubmit(fd, ev.target) !== false) { closeDialog(); render(); }
});
dlg.addEventListener('click', ev => { if (ev.target === dlg) closeDialog(); });

/* Hrana */
function openFood(pre = {}, editId = null) {
  const per100 = !!pre.per100;
  const v = k => pre[k] != null && pre[k] !== '' ? fmt(pre[k], 1).replace(/\s/g, '') : '';
  const inc = editId ? pre.inc : db.settings.carbsIncludeFiber;
  openDialog(`
    <h2>${editId ? 'Uredi unos' : 'Dodaj hranu'}</h2>${pre.code ? `<p class="muted small" style="margin:-6px 0 10px">Barkod ${h(pre.code)}</p>` : ''}
    <div class="stack">
      <label>Naziv<input name="name" required value="${h(pre.name || '')}" placeholder="npr. Jaja, slanina, avokado" autocomplete="off"></label>
      <div class="grid2">
        <label class="chk" style="align-self:end;padding-bottom:10px"><input type="checkbox" name="per100" ${per100 ? 'checked' : ''}> Vrijednosti na 100 g</label>
        <label>Količina (g)<input name="grams" inputmode="decimal" value="${pre.grams ? Math.round(pre.grams) : ''}" placeholder="${per100 ? '100' : 'neobavezno'}"></label>
      </div>
      <div class="grid4">
        <label>UH (g)<input name="carbs" inputmode="decimal" value="${v('carbs')}" placeholder="0"></label>
        <label>Vlakna (g)<input name="fiber" inputmode="decimal" value="${v('fiber')}" placeholder="0"></label>
        <label>Masti (g)<input name="fat" inputmode="decimal" value="${v('fat')}" placeholder="0"></label>
        <label>Proteini (g)<input name="protein" inputmode="decimal" value="${v('protein')}" placeholder="0"></label>
      </div>
      <p class="muted small" style="margin:0">${inc ? 'Postavka: UH uključuju vlakna (US deklaracije) – neto = UH − vlakna.' : 'EU deklaracije: "ugljikohidrati" već ne uključuju vlakna, pa je to ujedno neto UH.'}</p>
      <div class="preview" id="fprev"></div>
      <div class="grid2">
        <label>Vrijeme<input type="time" name="time" value="${h(pre.time || nowTime())}"></label>
        <label class="chk" style="align-self:end;padding-bottom:10px"><input type="checkbox" name="fav" ${!editId && pre.fav ? 'checked' : ''}> Spremi u favorite</label>
      </div>
      <div class="btns end">
        ${editId ? '<button type="button" class="btn danger" data-action="del-food" data-id="' + editId + '" style="margin-right:auto">Obriši</button>' : ''}
        <button type="button" class="btn" data-action="close">Odustani</button>
        ${editId ? '' : '<button type="button" class="btn" data-action="fav-only">★ Samo u favorite</button>'}
        <button class="btn primary">${editId ? 'Spremi' : 'Dodaj'}</button>
      </div>
    </div>`,
    fd => {
      const name = fd.name.trim();
      if (!name) { toast('Upiši naziv'); return false; }
      const vals = { carbs: num(fd.carbs) || 0, fiber: num(fd.fiber) || 0, fat: num(fd.fat) || 0, protein: num(fd.protein) || 0 };
      const isPer = !!fd.per100, g = num(fd.grams);
      const old = editId ? db.foods.find(f => f.id === editId) : null;
      const code = pre.code || old?.code || null;
      let item = { id: editId || uid(), date: old ? old.date : state.date, time: fd.time || nowTime(), name, inc: old ? !!old.inc : !!db.settings.carbsIncludeFiber, ...(code ? { code } : {}) };
      if (isPer) {
        const grams = g || 100, k = grams / 100;
        item = { ...item, carbs: r1(vals.carbs * k), fiber: r1(vals.fiber * k), fat: r1(vals.fat * k), protein: r1(vals.protein * k), grams, src: vals };
      } else item = { ...item, ...vals, grams: g || null };
      if (old) db.foods[db.foods.indexOf(old)] = item; else db.foods.push(item);
      if (fd.fav) saveFavorite(item);
      if (code && isPer) db.products[code] = { name, ...vals, grams: g || 100, inc: item.inc };
      save();
      toast(editId ? 'Spremljeno' : `Dodano: ${name}`);
    },
    form => {
      const upd = () => {
        const fd = Object.fromEntries(new FormData(form));
        const k = fd.per100 ? (num(fd.grams) || 100) / 100 : 1;
        const f = { carbs: (num(fd.carbs) || 0) * k, fiber: (num(fd.fiber) || 0) * k, fat: (num(fd.fat) || 0) * k, protein: (num(fd.protein) || 0) * k, inc };
        const left = db.settings.carbLimit - totals(dayFood(state.date).filter(x => x.id !== editId)).net - netOf(f);
        $('#fprev').innerHTML = `<b>${fmt(kcalOf(f))} kcal</b> · neto UH ${fmt(netOf(f), 1)} g · M ${fmt(f.fat, 1)} g · P ${fmt(f.protein, 1)} g<br><span class="${left < 0 ? 'bad' : 'muted'}">Nakon ovoga: ${left >= 0 ? `preostaje ${fmt(left, 1)} g UH za dan` : `limit UH prekoračen za ${fmt(-left, 1)} g`}</span>`;
        form.grams.placeholder = fd.per100 ? '100' : 'neobavezno';
      };
      form.addEventListener('input', upd);
      upd();
      if (!pre.name) form.name.focus();
    });
}
const isFav = name => db.favorites.some(f => f.name.toLowerCase() === String(name).toLowerCase());
// Favorit iz stavke pretrage / baze / ručnog unosa (bez dodavanja u obrok)
function toggleFavorite(it) {
  if (isFav(it.name)) {
    db.favorites = db.favorites.filter(f => f.name.toLowerCase() !== it.name.toLowerCase());
    save();
    return false;
  }
  db.favorites.push({
    id: uid(), name: it.name, per100: !!it.per100, grams: it.grams || null,
    carbs: it.carbs || 0, fiber: it.fiber || 0, fat: it.fat || 0, protein: it.protein || 0,
    inc: it.inc ?? !!db.settings.carbsIncludeFiber
  });
  db.favorites.sort((a, b) => a.name.localeCompare(b.name, 'hr'));
  save();
  return true;
}
function saveFavorite(item) {
  const fav = item.src
    ? { id: uid(), name: item.name, per100: true, grams: item.grams, ...item.src, inc: item.inc }
    : { id: uid(), name: item.name, per100: false, grams: item.grams, carbs: item.carbs, fiber: item.fiber, fat: item.fat, protein: item.protein, inc: item.inc };
  db.favorites = db.favorites.filter(f => f.name.toLowerCase() !== item.name.toLowerCase());
  db.favorites.push(fav);
  db.favorites.sort((a, b) => a.name.localeCompare(b.name, 'hr'));
}
function openFavs() {
  openDialog(`<h2>Favoriti</h2>
    <ul class="list">${db.favorites.map(f => `<li><div class="grow"><div class="name">${h(f.name)}</div>
      <div class="muted small">${f.per100 ? 'na 100 g' : 'porcija'}${f.grams ? ` · ${fmt(f.grams)} g` : ''} · UH ${fmt(netOf(f), 1)} · M ${fmt(f.fat, 1)} · P ${fmt(f.protein, 1)}</div></div>
      <button type="button" class="x-btn" data-action="del-fav" data-id="${f.id}" aria-label="Obriši">✕</button></li>`).join('') || '<p class="empty">Nema favorita.</p>'}</ul>
    <p class="muted small" style="margin:10px 0 0">Favorit dodaješ i zvjezdicom ★ u pretrazi i popisu namirnica – bez unosa u obrok.</p>
    <div class="btns end" style="margin-top:12px"><button type="button" class="btn" data-action="fav-new" style="margin-right:auto">+ Novi favorit</button><button type="button" class="btn" data-action="close">Zatvori</button></div>`);
}

/* Ketoni */
function openKetone() {
  const sw = (arr, name, sel, sub) => arr.map((k, i) => `<label class="sw"><input type="radio" name="${name}" value="${i}" ${i === sel ? 'checked' : ''}><span style="background:${k.c}"></span><small>${k.l}${sub ? '<br>' + sub(k) : ''}</small></label>`).join('');
  openDialog(`<h2>Keto-Diastix mjerenje</h2>
    <div class="stack">
      <fieldset><legend>Ketoni – očitaj nakon 15 s</legend><div class="swatches">${sw(KET, 'ket', 1, k => k.mmol + ' mmol')}</div></fieldset>
      <fieldset><legend>Glukoza – očitaj nakon 30 s (mg/dL)</legend><div class="swatches">${sw(GLU, 'glu', 0)}</div></fieldset>
      <p class="muted small" style="margin:0">Boje na ekranu su orijentacijske – uspoređuj s tablicom na bočici.</p>
      <div class="grid2">
        <label>Datum<input type="date" name="date" value="${state.date}" max="${today()}"></label>
        <label>Vrijeme<input type="time" name="time" value="${nowTime()}"></label>
      </div>
      <label>Bilješka<input name="note" placeholder="npr. nakon treninga, natašte" autocomplete="off"></label>
      <div class="btns end"><button type="button" class="btn" data-action="close">Odustani</button><button class="btn primary">Spremi</button></div>
    </div>`,
    fd => {
      const k = { id: uid(), date: fd.date || state.date, time: fd.time || nowTime(), ket: +fd.ket || 0, glu: +fd.glu || 0, note: (fd.note || '').trim() };
      db.ketones.push(k); save();
      if (k.glu > 0) toast('Glukoza u urinu – ako se ponovi, javi se liječniku');
      else toast(`Spremljeno: ${KET[k.ket].l}`);
    });
}

/* Energija */
function openEnergy() {
  const e = db.energy[state.date] || {};
  openDialog(`<h2>Potrošnja – ${dayLabel(state.date)}</h2>
    <div class="stack">
      <label>Ukupno potrošeno (kcal)<input name="total" inputmode="numeric" value="${e.total ?? ''}" placeholder="ili popuni aktivno + mirovanje"></label>
      <div class="grid2">
        <label>Aktivne kalorije<input name="active" inputmode="numeric" value="${e.active ?? ''}"></label>
        <label>Mirovanje (BMR)<input name="basal" inputmode="numeric" value="${e.basal ?? ''}"></label>
      </div>
      <label>Koraci<input name="steps" inputmode="numeric" value="${e.steps ?? ''}"></label>
      <p class="muted small" style="margin:0">Podatke nađeš u Health Connectu (Postavke → Health Connect → Podaci i pristup → Aktivnost), Samsung Healthu ili Google Fitu. Ako upišeš samo aktivno i mirovanje, ukupno se zbroji.${NATIVE ? ' Ručni unos ima prednost pred sinkronizacijom.' : ''}</p>
      <div class="btns end">
        ${db.energy[state.date] ? '<button type="button" class="btn danger" data-action="del-energy" style="margin-right:auto">Obriši</button>' : ''}
        <button type="button" class="btn" data-action="close">Odustani</button><button class="btn primary">Spremi</button>
      </div>
    </div>`,
    fd => {
      const n = v => { const x = cleanNum(v, true); return x == null ? null : Math.round(x); };
      const en = { total: n(fd.total), active: n(fd.active), basal: n(fd.basal), steps: n(fd.steps), src: 'manual' };
      if (en.total == null && en.active == null && en.basal == null && en.steps == null) { toast('Upiši barem jednu vrijednost'); return false; }
      db.energy[state.date] = en;
      save(); toast('Spremljeno');
    });
}

/* Potrošnja za više dana unatrag */
function openEnergyBulk(days = 30) {
  const dates = [...Array(days)].map((_, i) => addDays(today(), -i));
  const val = v => v == null ? '' : Math.round(v);
  openDialog(`<h2>Potrošnja unatrag</h2>
    <div class="seg" style="margin-bottom:10px">${[30, 60, 90].map(n => `<button type="button" class="${n === days ? 'on' : ''}" data-action="energy-bulk" data-days="${n}">${n} dana</button>`).join('')}</div>
    <p class="muted small" style="margin:0 0 10px">Upiši ukupno potrošene kalorije (i po želji korake) za svaki dan. Prazna polja se preskaču, a obrisana vrijednost briše dan.${NATIVE ? ' Ručni unos ima prednost pred Health Connectom.' : ''}</p>
    <div class="row" style="margin-bottom:12px">
      <input name="fill" inputmode="numeric" placeholder="npr. 2200" autocomplete="off" aria-label="Kalorije za prazne dane">
      <button type="button" class="btn" data-action="energy-fill">Popuni prazne dane</button>
    </div>
    <div class="bulk-head muted small"><span>Dan</span><span>Potrošeno kcal</span><span>Koraci</span></div>
    <div class="bulk">${dates.map(d => {
      const e = db.energy[d];
      return `<div class="bulk-row">
        <label for="t_${d}"><b>${DAYS[parseISO(d).getDay()]}</b> ${shortDate(d)}${e ? `<small class="muted">${e.src === 'health' ? 'HC' : 'ručno'}</small>` : ''}</label>
        <input id="t_${d}" name="t_${d}" inputmode="numeric" value="${val(burnedOf(e))}" autocomplete="off">
        <input name="s_${d}" inputmode="numeric" value="${val(e?.steps)}" autocomplete="off" aria-label="Koraci ${shortDate(d)}">
      </div>`;
    }).join('')}</div>
    <div class="btns end" style="margin-top:12px"><button type="button" class="btn" data-action="close">Odustani</button><button class="btn primary">Spremi</button></div>`,
    fd => {
      const n = v => { const x = cleanNum(v, true); return x == null ? null : Math.round(x); };
      let changed = 0;
      for (const d of dates) {
        const e = db.energy[d], t = n(fd['t_' + d]), s = n(fd['s_' + d]);
        const oldT = burnedOf(e) == null ? null : Math.round(burnedOf(e)), oldS = e?.steps == null ? null : Math.round(e.steps);
        if (t === oldT && s === oldS) continue;
        changed++;
        if (t == null && s == null) { delete db.energy[d]; continue; }
        const keepParts = e && t === oldT; // ukupno nepromijenjeno – zadrži aktivno/mirovanje
        db.energy[d] = { total: t, active: keepParts ? e.active ?? null : null, basal: keepParts ? e.basal ?? null : null, steps: s, src: 'manual' };
      }
      save();
      toast(changed ? `Spremljeno za ${changed} ${changed === 1 ? 'dan' : 'dana'}` : 'Nema promjena');
    });
}
function fillEmptyEnergy() {
  const f = dlg.querySelector('[name=fill]'), v = cleanNum(f && f.value, true);
  if (v == null || v < 500 || v > 10000) { toast('Upiši kalorije između 500 i 10 000'); return; }
  let n = 0;
  dlg.querySelectorAll('.bulk input[name^="t_"]').forEach(inp => { if (!inp.value.trim()) { inp.value = Math.round(v); n++; } });
  toast(n ? `Popunjeno ${n} dana – spremi za potvrdu` : 'Nema praznih dana');
}

/* Postavke */
function openSettings() {
  const s = db.settings;
  openDialog(`<h2>Postavke</h2>
    <div class="stack">
      <div class="grid2">
        <label>Visina (cm)<input name="heightCm" inputmode="decimal" value="${s.heightCm ?? ''}"></label>
        <label>Ciljna težina (kg)<input name="goalWeight" inputmode="decimal" value="${s.goalWeight ?? ''}"></label>
      </div>
      <h3 style="margin:6px 0 0;font-size:13px;color:var(--muted)">Prehrana</h3>
      <button type="button" class="btn block" data-action="goals">${h(dietOf(s.diet).name)} · izračunaj ciljeve ›</button>
      <h3 style="margin:6px 0 0;font-size:13px;color:var(--muted)">Dnevni ciljevi</h3>
      <div class="grid2">
        <label>Limit neto UH (g)<input name="carbLimit" inputmode="numeric" value="${s.carbLimit}"></label>
        <label>Proteini (g)<input name="proteinTarget" inputmode="numeric" value="${s.proteinTarget}"></label>
        <label>Masti (g)<input name="fatTarget" inputmode="numeric" value="${s.fatTarget}"></label>
        <label>Kalorije (kcal)<input name="kcalTarget" inputmode="numeric" value="${s.kcalTarget}"></label>
      </div>
      <p class="muted small" style="margin:0">Okvirno: strogi keto ≤ 20–25 g, LCHF ≤ 50 g, umjereni low-carb ≤ 100 g neto UH. Proteini oko 1,2–1,6 g po kg ciljne težine. Za automatski izračun koristi „Prehrana“ iznad.</p>
      <label class="chk"><input type="checkbox" name="carbsIncludeFiber" ${s.carbsIncludeFiber ? 'checked' : ''}> UH na deklaracijama uključuju vlakna (US proizvodi)</label>
      <h3 style="margin:6px 0 0;font-size:13px;color:var(--muted)">Health Connect</h3>
      ${NATIVE ? `
        <p class="muted small" style="margin:0">Status: ${{ available: hc.granted.length ? `povezano (${hc.granted.length} dozvole)` : 'dostupno, nema dozvola', not_installed: 'nije instaliran', update_required: 'potrebno ažuriranje', unavailable: 'nije podržan na ovom uređaju', error: 'greška' }[hc.status] || 'provjeravam…'}${hc.lastSync ? ` · zadnja sinkronizacija ${new Date(hc.lastSync).toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
        <label class="chk"><input type="checkbox" name="healthWeight" ${s.healthWeight ? 'checked' : ''}> Uvozi težinu iz Health Connecta (za dane bez unosa)</label>
        <div class="btns"><button type="button" class="btn" data-action="hc-perm">Dozvole</button><button type="button" class="btn" data-action="hc-open">Otvori Health Connect</button></div>`
      : `<p class="muted small" style="margin:0">Web-verzija ne može čitati Health Connect – potrošnju upiši ručno ili instaliraj <a href="${APK_URL}" target="_blank" rel="noopener">Android aplikaciju</a> koja je čita automatski. Web i Android aplikacija imaju odvojene podatke (prenesi ih izvozom/uvozom).</p>
        <input type="hidden" name="healthWeight" value="${s.healthWeight ? 'on' : ''}">`}
      <h3 style="margin:6px 0 0;font-size:13px;color:var(--muted)">Podaci</h3>
      <p class="muted small" style="margin:0">Svi podaci su spremljeni samo na ovom uređaju. Zadnja kopija: ${s.lastBackup ? shortDate(s.lastBackup) + s.lastBackup.slice(0, 4) : 'nikad'}.</p>
      <div class="btns">
        <button type="button" class="btn" data-action="reports">✉ Izvještaji e-mailom</button>
        <button type="button" class="btn" data-action="export">Izvezi kopiju</button>
        <button type="button" class="btn" data-action="import">Uvezi kopiju</button>
        <button type="button" class="btn danger" data-action="wipe">Obriši sve</button>
      </div>
      <div class="btns end"><button type="button" class="btn" data-action="close">Odustani</button><button class="btn primary">Spremi</button></div>
    </div>`,
    fd => {
      const n = (v, d) => { const x = num(v); return x == null ? d : x; };
      Object.assign(db.settings, {
        heightCm: n(fd.heightCm, null), goalWeight: n(fd.goalWeight, null),
        carbLimit: n(fd.carbLimit, 25), proteinTarget: n(fd.proteinTarget, 100), fatTarget: n(fd.fatTarget, 130), kcalTarget: n(fd.kcalTarget, 0),
        carbsIncludeFiber: !!fd.carbsIncludeFiber, healthWeight: !!fd.healthWeight
      });
      save(); toast('Postavke spremljene');
    });
}
/* ================= Zdravlje (uvoz) ================= */
function cleanNum(v, integer = false) {
  if (v == null) return null;
  let s = String(v).replace(/[^\d.,-]/g, '');
  if (!s || s === '-') return null;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = integer && /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  else if (integer && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}
function parseHealth(text) {
  const out = {};
  text = String(text || '').trim();
  try {
    const j = JSON.parse(text);
    if (j && typeof j === 'object') { for (const [k, v] of Object.entries(j)) out[k.toLowerCase()] = v; return out; }
  } catch { /* nije JSON */ }
  const q = text.includes('?') ? text.slice(text.indexOf('?') + 1) : text;
  for (const part of q.split(/[&;\n]/)) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    let v = part.slice(i + 1).trim();
    try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch { /* ostavi */ }
    out[part.slice(0, i).trim().toLowerCase()] = v;
  }
  return out;
}
// Uvoz preko URL-a (npr. iz automatizacije): ?date=2026-10-04&total=2300&active=520&steps=8000&weight=84.2
function applyHealth(text) {
  const p = parseHealth(text);
  let date = today();
  if (p.date) {
    const m = String(p.date).match(/(\d{4})-(\d{1,2})-(\d{1,2})/) || String(p.date).match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
    if (m) date = m[1].length === 4 ? `${m[1]}-${pad(m[2])}-${pad(m[3])}` : `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  }
  const int = v => { const x = cleanNum(v, true); return x == null ? null : Math.round(x); };
  const total = int(p.total), active = int(p.active), basal = int(p.basal ?? p.resting), steps = int(p.steps);
  const weight = cleanNum(p.weight);
  if (total == null && active == null && basal == null && steps == null && weight == null) return false;
  if (total != null || active != null || basal != null || steps != null) {
    const e = db.energy[date] || {};
    db.energy[date] = { total: total ?? e.total ?? null, active: active ?? e.active ?? null, basal: basal ?? e.basal ?? null, steps: steps ?? e.steps ?? null, src: 'health' };
  }
  if (weight != null && weight > 20 && weight < 400) db.weights[date] = r1(weight);
  save();
  state.date = date;
  toast(`Uvezeno za ${shortDate(date)}`);
  return true;
}

/* ================= Health Connect (Android aplikacija) ================= */
const HB = NATIVE ? (window.Capacitor.Plugins && window.Capacitor.Plugins.HealthBridge) || window.Capacitor.registerPlugin('HealthBridge') : null;
const hc = { status: null, granted: [], syncing: false, lastSync: 0 };
async function hcRefresh() {
  try { const r = await HB.status(); hc.status = r.status; hc.granted = r.granted || []; }
  catch (e) { hc.status = 'error'; console.error(e); }
}
async function hcRequest() {
  try {
    const r = await HB.requestAccess();
    hc.granted = r.granted || [];
    if (!hc.granted.length) toast('Pristup nije odobren');
  } catch (e) { toast('Dozvole: ' + e.message); }
}
async function hcSync(manual = false, days = 7) {
  if (!HB || hc.syncing) return;
  hc.syncing = true;
  if (manual) render();
  try {
    await hcRefresh();
    if (hc.status !== 'available') { if (manual) toast('Health Connect nije dostupan'); return; }
    if (!hc.granted.length) {
      if (!manual) return;
      await hcRequest();
      if (!hc.granted.length) return;
    }
    const r = await HB.readDays({ from: addDays(today(), -(days - 1)), to: today() });
    const rnd = v => v == null ? null : Math.round(v);
    for (const x of r.days || []) {
      const e = db.energy[x.date];
      if (!(e && e.src === 'manual') && (x.total != null || x.active != null || x.steps != null)) {
        db.energy[x.date] = {
          total: rnd(x.total), active: rnd(x.active),
          basal: x.total != null && x.active != null ? Math.max(0, Math.round(x.total - x.active)) : null,
          steps: rnd(x.steps), src: 'health'
        };
      }
      if (db.settings.healthWeight && x.weight != null && db.weights[x.date] == null) db.weights[x.date] = r1(x.weight);
    }
    hc.lastSync = Date.now();
    save();
    if (manual) toast('Sinkronizirano s Health Connectom');
  } catch (e) {
    console.error(e);
    if (manual) toast('Sinkronizacija nije uspjela: ' + e.message);
  } finally {
    hc.syncing = false;
    if (!dlg.open) render();
  }
}

/* ================= Baza namirnica i pretraga ================= */
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const dbItem = ([name, carbs, fiber, fat, protein, grams, level, section]) => ({ name, carbs, fiber, fat, protein, grams, per100: true, level, section, tag: 'db' });
function searchItems(q) {
  // svaka riječ upita mora se pojaviti; zadnje slovo duljih riječi se zanemaruje (orah → orasi)
  const words = norm(q).split(/\s+/).filter(Boolean).map(w => w.length >= 4 ? w.slice(0, -1) : w);
  const out = [], seen = new Set();
  const push = (it, tag) => {
    const k = norm(it.name);
    if (seen.has(k) || !words.every(w => k.includes(w))) return;
    seen.add(k); out.push({ ...it, tag });
  };
  db.favorites.forEach(f => push(f, 'fav'));
  Object.entries(db.products).forEach(([code, p]) => push({ ...p, code, per100: true }, 'code'));
  quickItems().filter(x => !x.fav).forEach(r => push(r, 'recent'));
  if (!words.length) return out.slice(0, 12); // bez upita: samo moje namirnice, ispod je popis po sekcijama
  FOOD_DB.forEach(row => push(dbItem(row), 'db'));
  return out.slice(0, 40);
}
const TAGS = { fav: '★', code: '▥', recent: '↺', db: '', off: '' };
const LEVELS = { limit: ['ograničeno', 'limit'], avoid: ['izbjegavati', 'avoid'] };
const levelPill = l => lowCarb() && LEVELS[l] ? `<span class="pill ${LEVELS[l][1]}">${LEVELS[l][0]}</span>` : '';
function itemRow(it, src, i, sub = true) {
  return `<li><button type="button" class="tap" data-action="pick" data-src="${src}" data-i="${i}">
    <div class="name">${TAGS[it.tag] ? `<span class="tag">${TAGS[it.tag]}</span> ` : ''}${h(it.name)} ${levelPill(it.level)}</div>
    <div class="muted small">${it.per100 ? 'na 100 g' : 'porcija'} · UH ${fmt(netOf(it), 1)} · M ${fmt(it.fat, 1)} · P ${fmt(it.protein, 1)} · ${fmt(kcalOf(it))} kcal${sub && it.section ? ` · ${h(it.section)}` : ''}</div>
  </button><button type="button" class="star ${isFav(it.name) ? 'on' : ''}" data-action="fav-item" data-src="${src}" data-i="${i}" aria-label="Dodaj u favorite">★</button></li>`;
}
const resultRows = (list, src) => list.map((it, i) => itemRow(it, src, i)).join('');
function foodSections() {
  let idx = 0;
  return FOOD_SECTIONS.map((s, si) => `<details class="fsec">
    <summary><span>${si + 1}. ${h(s.title)}</span><span class="muted small">${s.groups.reduce((n, g) => n + g.items.length, 0)}</span></summary>
    <p class="muted small fsec-intro">${h(s.intro)}</p>
    ${s.groups.map(g => `<h4 class="fgrp">${h(g.title)} ${levelPill(g.level)}</h4>
      <ul class="list">${g.items.map(row => itemRow(dbItem(row), 'd', idx++, false)).join('')}</ul>`).join('')}
  </details>`).join('');
}
function openFoodSearch() {
  state.offres = [];
  openDialog(`<h2>Dodaj hranu</h2>
    <div class="row">
      <input name="q" type="search" placeholder="Traži namirnicu…" autocomplete="off" enterkeyhint="search">
      <button type="button" class="btn" data-action="scan">Skeniraj</button>
    </div>
    <div id="sbody" style="margin-top:6px"></div>
    <div id="offres"></div>
    <div class="btns" style="margin-top:10px">
      <button type="button" class="btn" data-action="off-search">Traži online</button>
      <button type="button" class="btn" data-action="food-manual">Ručni unos</button>
      <button type="button" class="btn ghost" data-action="close" style="margin-left:auto">Zatvori</button>
    </div>
    <p class="muted small" style="margin:8px 0 0">★ favoriti · ▥ skenirani proizvodi · ↺ nedavno. Vrijednosti su na 100 g i orijentacijske. Online pretraga koristi bazu Open Food Facts.</p>`,
    () => { offSearch(); return false; },
    form => {
      const upd = () => {
        const q = form.q.value.trim();
        state.sres = searchItems(q);
        $('#sbody').innerHTML = q
          ? `<ul class="list">${state.sres.length ? resultRows(state.sres, 's') : '<li class="muted small">Nema rezultata u lokalnoj bazi – probaj online pretragu ili ručni unos.</li>'}</ul>`
          : `${state.sres.length ? `<h3 class="fhead">Moje namirnice</h3><ul class="list">${resultRows(state.sres, 's')}</ul>` : ''}
             <h3 class="fhead">Popis LCHF namirnica</h3>${foodSections()}`;
      };
      form.q.addEventListener('input', upd);
      upd();
    });
}

/* Open Food Facts */
const OFF_FIELDS = 'code,product_name,product_name_hr,generic_name,brands,nutriments,serving_quantity';
async function offFetch(url) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
function offToItem(p, code) {
  const n = p.nutriments || {};
  const v = k => { const x = n[k + '_100g']; return x == null || x === '' || isNaN(+x) ? null : +x; };
  if (v('carbohydrates') == null && v('fat') == null && v('proteins') == null) return null;
  const brand = p.brands ? String(p.brands).split(',')[0].trim() : '';
  const name = [p.product_name_hr || p.product_name || p.generic_name || 'Proizvod', brand].filter(Boolean).join(' – ');
  return { name, carbs: r1(v('carbohydrates') || 0), fiber: r1(v('fiber') || 0), fat: r1(v('fat') || 0), protein: r1(v('proteins') || 0),
    grams: +p.serving_quantity > 0 ? Math.round(+p.serving_quantity) : 100, per100: true, code: code || p.code || null, tag: 'off' };
}
const offErr = e => e.name === 'AbortError' ? 'isteklo vrijeme' : navigator.onLine === false ? 'nema interneta' : e.message;
async function offSearch() {
  const q = (dlg.querySelector('[name=q]') || {}).value?.trim();
  const box = $('#offres');
  if (!box) return;
  if (!q || q.length < 2) { toast('Upiši barem 2 slova'); return; }
  box.innerHTML = '<p class="muted small">Tražim online…</p>';
  try {
    const j = await offFetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=${OFF_FIELDS}`);
    state.offres = (j.products || []).map(p => offToItem(p)).filter(Boolean);
    if (!$('#offres')) return;
    $('#offres').innerHTML = state.offres.length
      ? `<h3 style="font-size:13px;color:var(--muted);margin:12px 0 0">Open Food Facts</h3><ul class="list">${resultRows(state.offres, 'o')}</ul>`
      : '<p class="muted small">Online nema rezultata.</p>';
  } catch (e) {
    if ($('#offres')) $('#offres').innerHTML = `<p class="muted small">Online pretraga nije uspjela (${h(offErr(e))}).</p>`;
  }
}
async function lookupBarcode(code) {
  const known = db.products[code];
  if (known) return openFood({ ...known, code, per100: true });
  const msg = $('#scanmsg');
  if (msg) msg.textContent = `Tražim proizvod ${code}…`;
  try {
    const j = await offFetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`);
    const it = j.status === 1 && j.product ? offToItem(j.product, code) : null;
    if (it) return openFood(it);
    toast('Proizvod nije u bazi – upiši vrijednosti s deklaracije');
  } catch (e) {
    toast('Pretraga nije uspjela (' + offErr(e) + ')');
  }
  openFood({ code, per100: true });
}

/* ================= Skener barkoda ================= */
const scan = { stream: null, timer: 0, reader: null, done: true };
function stopScanner() {
  scan.done = true;
  clearTimeout(scan.timer);
  try { scan.reader && scan.reader.reset(); } catch { /* ignore */ }
  scan.reader = null;
  if (scan.stream) scan.stream.getTracks().forEach(t => t.stop());
  scan.stream = null;
}
dlg.addEventListener('close', stopScanner);
const loadScript = src => new Promise((ok, fail) => {
  const s = document.createElement('script');
  s.src = src; s.onload = ok; s.onerror = () => fail(new Error('Ne mogu učitati ' + src));
  document.head.appendChild(s);
});
async function openScanner() {
  stopScanner();
  openDialog(`<h2>Skeniraj barkod</h2>
    <div class="scanbox"><video id="scanv" playsinline muted></video><i></i></div>
    <p class="muted small" id="scanmsg">Pokrećem kameru…</p>
    <div class="row">
      <input name="code" inputmode="numeric" placeholder="ili upiši barkod" autocomplete="off">
      <button class="btn">Traži</button>
    </div>
    <div class="btns end" style="margin-top:10px"><button type="button" class="btn" data-action="close">Odustani</button></div>`,
    fd => {
      const c = (fd.code || '').replace(/\D/g, '');
      if (c.length < 8) { toast('Barkod ima 8–14 znamenki'); return false; }
      stopScanner(); lookupBarcode(c);
      return false;
    });
  scan.done = false;
  const msg = t => { const m = $('#scanmsg'); if (m) m.textContent = t; };
  if (!navigator.mediaDevices?.getUserMedia) return msg('Kamera nije dostupna u ovom pregledniku – upiši barkod ručno.');
  try {
    scan.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  } catch (e) {
    return msg(e.name === 'NotAllowedError' ? 'Pristup kameri nije dopušten – dopusti ga u postavkama ili upiši barkod.' : 'Kamera nije dostupna – upiši barkod ručno.');
  }
  const video = $('#scanv');
  if (scan.done || !video) return stopScanner();
  video.srcObject = scan.stream;
  await video.play().catch(() => {});
  msg('Usmjeri kameru prema barkodu…');
  const found = code => {
    if (scan.done) return;
    stopScanner();
    if (navigator.vibrate) navigator.vibrate(60);
    lookupBarcode(code);
  };
  if ('BarcodeDetector' in window) {
    try {
      const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
      const tick = async () => {
        if (scan.done) return;
        try { const r = await det.detect(video); if (r.length) return found(r[0].rawValue); } catch { /* sljedeći okvir */ }
        scan.timer = setTimeout(tick, 200);
      };
      return tick();
    } catch { /* format nije podržan – ZXing */ }
  }
  try {
    if (!window.ZXing) await loadScript('vendor/zxing.min.js');
  } catch (e) { return msg('Skener se nije učitao – upiši barkod ručno.'); }
  if (scan.done) return;
  const F = ZXing.BarcodeFormat, hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128]);
  scan.reader = new ZXing.BrowserMultiFormatReader(hints);
  scan.reader.decodeFromStream(scan.stream, video, r => { if (r) found(r.getText()); }).catch(() => {});
}

/* ================= Post (intermitentni post) ================= */
const FAST_GOALS = [12, 14, 16, 18, 20, 24];
const FAST_PHASES = [
  [0, 'Probava zadnjeg obroka'],
  [4, 'Razina inzulina pada, tijelo troši zalihe glikogena'],
  [12, 'Pojačano sagorijevanje masti i stvaranje ketona'],
  [18, 'Duboka ketoza'],
  [24, 'Produženi post – pij vodu i nadoknadi elektrolite (sol, magnezij, kalij)']
];
const durTxt = ms => { const m = Math.max(0, Math.floor(ms / 60000)); return `${Math.floor(m / 60)} h ${pad(m % 60)} min`; };
const clockTxt = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
const hmTxt = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const whenTxt = t => { const d = iso(new Date(t)); return (d === today() ? '' : d === addDays(today(), -1) ? 'jučer ' : shortDate(d) + ' ') + hmTxt(t); };
const toLocalInput = t => { const d = new Date(t); return `${iso(d)}T${hmTxt(t)}`; };
function lastMealTime() {
  const f = db.foods.filter(x => x.time).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0];
  if (!f) return null;
  const d = parseISO(f.date), [H, M] = f.time.split(':').map(Number);
  d.setHours(H, M, 0, 0);
  const t = d.getTime();
  return t <= Date.now() && Date.now() - t < 48 * 3600e3 ? t : null;
}
function fastState(f = db.fast) {
  const el = Date.now() - f.start, goalMs = f.goal * 3600e3, end = f.start + goalMs;
  const phase = FAST_PHASES.filter(p => el / 3600e3 >= p[0]).at(-1)[1];
  const info = el < goalMs
    ? `Početak ${whenTxt(f.start)} · cilj u ${whenTxt(end)} (još ${durTxt(end - Date.now())})`
    : `Cilj od ${f.goal} h postignut u ${whenTxt(end)} · +${durTxt(el - goalMs)}`;
  return { el, pct: Math.min(1, el / goalMs), done: el >= goalMs, phase, info };
}
function fastRing(pct, done) {
  const r = 40, c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 100 100" width="92" height="92" class="donut"><circle cx="50" cy="50" r="${r}" fill="none" style="stroke:var(--soft)" stroke-width="10"/>
    <circle id="fastRing" cx="50" cy="50" r="${r}" fill="none" style="stroke:${done ? 'var(--good)' : 'var(--accent)'}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 50 50)"/>
    <text id="fastPct" x="50" y="55" text-anchor="middle" style="fill:var(--ink);font-size:16px;font-weight:700">${Math.round(pct * 100)}%</text></svg>`;
}
function fastCard() {
  if (db.fast) {
    const st = fastState();
    return `<section class="card" id="fastcard">
      <div class="card-h"><h2>Post</h2><span class="muted">cilj ${db.fast.goal} h</span></div>
      <div class="carb-hero">${fastRing(st.pct, st.done)}
        <div style="flex:1;min-width:0">
          <div class="big" id="fastClock">${clockTxt(st.el)}</div>
          <div class="muted small" id="fastInfo">${st.info}</div>
          <div class="small" id="fastPhase" style="margin-top:4px">${st.phase}</div>
        </div></div>
      <div class="btns" style="margin-top:12px"><button class="btn primary" style="flex:1" data-action="fast-end">Završi post</button><button class="btn" data-action="fast-edit">Uredi</button></div>
    </section>`;
  }
  const last = db.fasts.at(-1), meal = lastMealTime(), g = db.settings.fastGoal;
  return `<section class="card">
    <div class="card-h"><h2>Post</h2><span class="muted">${last ? `zadnji: ${durTxt(last.end - last.start)}` : ''}</span></div>
    <div class="seg" style="display:flex;overflow-x:auto">${FAST_GOALS.map(v => `<button class="${g === v ? 'on' : ''}" data-action="fast-goal" data-v="${v}">${v === 24 ? '24 h' : `${v}:${24 - v}`}</button>`).join('')}</div>
    <div class="btns" style="margin-top:12px">
      <button class="btn primary" style="flex:1" data-action="fast-start" data-from="now">Započni sada</button>
      ${meal ? `<button class="btn" data-action="fast-start" data-from="meal">Od zadnjeg obroka (${whenTxt(meal)})</button>` : ''}
    </div>
  </section>`;
}
function tickFast() {
  if (!db.fast) return;
  const c = $('#fastClock');
  if (!c) return;
  const st = fastState(), r = $('#fastRing'), c2 = 2 * Math.PI * 40;
  c.textContent = clockTxt(st.el);
  $('#fastInfo').textContent = st.info;
  $('#fastPhase').textContent = st.phase;
  $('#fastPct').textContent = Math.round(st.pct * 100) + '%';
  r.setAttribute('stroke-dasharray', `${(c2 * st.pct).toFixed(1)} ${c2.toFixed(1)}`);
  r.style.stroke = st.done ? 'var(--good)' : 'var(--accent)';
  if (st.done && !db.fast.notified) { db.fast.notified = true; save(); toast(`Cilj od ${db.fast.goal} h je ostvaren!`); }
}
setInterval(tickFast, 1000);

const LN = NATIVE ? (window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) || window.Capacitor.registerPlugin('LocalNotifications') : null;
const FAST_NOTIF = 1601;
async function cancelFastNotif() {
  if (LN) try { await LN.cancel({ notifications: [{ id: FAST_NOTIF }] }); } catch { /* nema zakazane */ }
}
async function scheduleFastNotif() {
  if (!LN || !db.fast) return;
  try {
    let p = await LN.checkPermissions();
    if (p.display !== 'granted') p = await LN.requestPermissions();
    if (p.display !== 'granted') return;
    await cancelFastNotif();
    const at = new Date(db.fast.start + db.fast.goal * 3600e3);
    if (at <= new Date()) return;
    await LN.schedule({ notifications: [{ id: FAST_NOTIF, title: 'Post je završen', body: `Cilj od ${db.fast.goal} h je ostvaren. Vrijeme za obrok!`, schedule: { at, allowWhileIdle: true }, isExactNotification: false }] });
  } catch (e) { console.error(e); }
}
function startFast(from) {
  const start = from === 'meal' ? lastMealTime() || Date.now() : Date.now();
  db.fast = { start, goal: db.settings.fastGoal };
  save(); render(); scheduleFastNotif();
  toast(`Post započet · cilj ${db.fast.goal} h`);
}
function endFast() {
  const f = db.fast;
  if (!f) return;
  const el = Date.now() - f.start;
  if (el < f.goal * 3600e3 && !confirm(`Prošlo je ${durTxt(el)} od ciljanih ${f.goal} h. Završiti post?`)) return;
  if (el >= 10 * 60e3) db.fasts.push({ id: uid(), start: f.start, end: Date.now(), goal: f.goal });
  db.fast = null;
  save(); cancelFastNotif(); render();
  toast(`Post: ${durTxt(el)}`);
}
function openFastEdit() {
  if (!db.fast) return;
  openDialog(`<h2>Uredi post</h2>
    <div class="stack">
      <label>Početak<input type="datetime-local" name="start" value="${toLocalInput(db.fast.start)}" max="${toLocalInput(Date.now())}"></label>
      <label>Cilj (sati)<input name="goal" inputmode="numeric" value="${db.fast.goal}"></label>
      <div class="btns end">
        <button type="button" class="btn danger" data-action="fast-cancel" style="margin-right:auto">Poništi post</button>
        <button type="button" class="btn" data-action="close">Odustani</button><button class="btn primary">Spremi</button>
      </div>
    </div>`,
    fd => {
      const t = new Date(fd.start).getTime(), g = num(fd.goal);
      if (!t || t > Date.now()) { toast('Početak ne može biti u budućnosti'); return false; }
      if (!g || g < 1 || g > 120) { toast('Cilj mora biti između 1 i 120 h'); return false; }
      db.fast = { start: t, goal: g };
      save(); scheduleFastNotif();
    });
}
function fastWeekCard(ws, we) {
  const wf = db.fasts.filter(f => { const d = iso(new Date(f.end)); return d >= ws && d <= we; });
  if (!wf.length && !db.fast) return '';
  const hours = [...Array(7)].map((_, i) => {
    const d = addDays(ws, i), l = wf.filter(f => iso(new Date(f.end)) === d);
    return l.length ? r1(Math.max(...l.map(f => (f.end - f.start) / 3600e3))) : null;
  });
  const durs = wf.map(f => f.end - f.start), reached = wf.filter(f => f.end - f.start >= f.goal * 3600e3).length;
  return `<section class="card"><div class="card-h"><h2>Post</h2><span class="muted">${wf.length ? `cilj ostvaren ${reached}/${wf.length}` : ''}</span></div>
    ${wf.length ? `<div class="tiles">
      <div class="tile"><b>${wf.length}</b><span>postova</span></div>
      <div class="tile"><b>${fmt(mean(durs) / 3600e3, 1)} h</b><span>Ø trajanje</span></div>
      <div class="tile"><b>${fmt(Math.max(...durs) / 3600e3, 1)} h</b><span>najduži</span></div></div>
    ${chart({ labels: [...Array(7)].map((_, i) => DAYS[parseISO(addDays(ws, i)).getDay()]), h: 140, zero: true, series: [{ type: 'bar', values: hours, color: 'var(--accent)', dec: 1, name: 'h' }], refs: [{ y: db.settings.fastGoal, color: 'var(--muted)', label: 'cilj ' + db.settings.fastGoal + ' h' }] })}
    <ul class="list">${wf.slice().reverse().map(f => `<li><div class="grow"><b>${durTxt(f.end - f.start)}</b> <span class="muted small">cilj ${f.goal} h</span><div class="muted small">${dayLabel(iso(new Date(f.start)))} ${hmTxt(f.start)} → ${hmTxt(f.end)}</div></div>
      <button class="x-btn" data-action="del-fast" data-id="${f.id}" aria-label="Obriši">✕</button></li>`).join('')}</ul>`
    : '<p class="muted" style="margin:0">Ovaj tjedan još nema završenih postova.</p>'}
  </section>`;
}

/* ================= Android widget ================= */
const WB = NATIVE ? (window.Capacitor.Plugins && window.Capacitor.Plugins.WidgetBridge) || window.Capacitor.registerPlugin('WidgetBridge') : null;
if (WB) WB.addListener('widgetAction', () => widgetAction()).catch?.(() => {});
if (WB) WB.addListener('backupShared', () => { db.settings.lastBackup = today(); save(); if (!dlg.open) render(); toast('Kopija je spremljena'); }).catch?.(() => {});
let widgetTimer = 0, widgetReady = false, nativeTimer = 0;
// Android: trajna kopija u datoteci aplikacije (WebView localStorage na disk zapisuje s odgodom)
function nativeSave(now = false) {
  if (!WB) return;
  clearTimeout(nativeTimer);
  const write = () => WB.saveData({ json: JSON.stringify(db) }).catch(e => console.error(e));
  if (now) write(); else nativeTimer = setTimeout(write, 250);
}
async function nativeRestore() {
  if (!WB) return;
  try {
    const r = await WB.loadData();
    const d = r && r.json ? JSON.parse(r.json) : null;
    if (d && (d.savedAt || 0) > (db.savedAt || 0)) {
      const e = emptyDb();
      db = { ...e, ...d, settings: { ...e.settings, ...(d.settings || {}) } };
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ignore */ }
    } else if (!d) nativeSave(true);
  } catch (e) { console.error(e); }
}
function widgetSync() {
  if (!WB || !widgetReady) return; // najprije preuzmi radnje s widgeta (npr. post pokrenut na widgetu)
  clearTimeout(widgetTimer);
  widgetTimer = setTimeout(() => {
    const lw = latestWeight(today()), rate = weeklyRate();
    // promjena u odnosu na prethodno mjerenje
    const ds = weightDates().filter(d => d <= today()), last = ds.at(-1), prevD = ds.at(-2);
    const diff = last && prevD ? r1(db.weights[last] - db.weights[prevD]) : null;
    // kalorijska bilanca: danas i zadnjih 7 dana (samo dani s unosom hrane i poznatom potrošnjom)
    const balOf = d => { const fl = dayFood(d), b = burnedOf(db.energy[d]); return fl.length && b != null ? totals(fl).kcal - b : null; };
    const balToday = balOf(today());
    const week = [...Array(7)].map((_, i) => balOf(addDays(today(), -i))).filter(v => v != null);
    const lk = [...db.ketones].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0];
    const tt = totals(dayFood(today()));
    WB.update({
      ...(diff != null ? { weightDiff: diff, weightDiffRef: prevD === addDays(last, -1) ? 'jučer' : shortDate(prevD) } : {}),
      ...(balToday != null ? { balToday: Math.round(balToday) } : {}),
      ...(week.length ? { balWeek: Math.round(sum(week)), balWeekDays: week.length } : {}),
      balDate: today(),
      protein: Math.round(tt.protein),
      proteinTarget: db.settings.proteinTarget || 0,
      ...(lk ? { ketText: KET[lk.ket].l, ketColor: KET[lk.ket].c, ketDate: lk.date, ketTime: lk.time || '', gluWarn: lk.glu > 0 } : {}),
      fastStart: db.fast ? db.fast.start : 0,
      fastGoal: db.fast ? db.fast.goal : db.settings.fastGoal,
      weight: lw ? lw.kg : 0,
      weightDate: lw ? lw.date : '',
      ...(rate != null ? { rate: Math.round(rate * 100) / 100 } : {}),
      carbs: Math.round(totals(dayFood(today())).net * 10) / 10,
      carbLimit: db.settings.carbLimit,
      carbDate: today()
    }).catch(e => console.error(e));
  }, 300);
}
async function widgetAction() {
  if (!WB) return;
  let r = {};
  try { r = (await WB.consumeAction()) || {}; } catch { /* nema radnje */ }
  if (r.fastStart && !db.fast) {
    // obavijest o cilju šalje widget, pa je aplikacija ne zakazuje ponovno
    db.fast = { start: r.fastStart, goal: db.settings.fastGoal };
    save();
    toast(`Post je pokrenut na widgetu u ${hmTxt(r.fastStart)}`);
    if (!dlg.open) render();
  }
  widgetReady = true;
  widgetSync();
  if (!r.action) return;
  if (dlg.open) closeDialog();
  state.date = today();
  if (r.action === 'food') { state.tab = 'food'; render(); openFoodSearch(); }
  else if (r.action === 'weight') { state.tab = 'today'; render(); openWeightQuick(); }
  else if (r.action === 'today') { state.tab = 'today'; render(); scrollTo(0, 0); }
  else if (r.action === 'ketones') { state.tab = 'ketones'; render(); scrollTo(0, 0); }
  else if (r.action === 'fast_end') { state.tab = 'today'; render(); scrollTo(0, 0); if (db.fast) setTimeout(endFast, 350); }
  else if (r.action === 'fast') {
    state.tab = 'today'; render(); scrollTo(0, 0);
    if (!db.fast) setTimeout(() => { if (!db.fast && confirm(`Započeti post sada (cilj ${db.settings.fastGoal} h)?`)) startFast('now'); }, 350);
  }
}
function openWeightQuick() {
  const d = today(), w = db.weights[d], prev = latestWeight(addDays(d, -1));
  openDialog(`<h2>Težina danas</h2>
    <div class="row">
      <input name="kg" inputmode="decimal" autocomplete="off" value="${w != null ? fmt(w, 1) : ''}" placeholder="${prev ? fmt(prev.kg, 1) : 'npr. 85,4'}" style="font-size:28px;font-weight:700" aria-label="Težina u kg">
      <span class="muted">kg</span>
    </div>
    <p class="muted small" style="margin:8px 0 0">${prev ? `Zadnje mjerenje: ${fmt(prev.kg, 1)} kg (${shortDate(prev.date)})` : 'Važi se ujutro, nakon WC-a.'}</p>
    <div class="btns end" style="margin-top:12px"><button type="button" class="btn" data-action="close">Odustani</button><button class="btn primary">Spremi</button></div>`,
    fd => {
      const kg = num(fd.kg);
      if (kg == null || kg < 20 || kg > 400) { toast('Unesi težinu u kg, npr. 85,4'); return false; }
      db.weights[d] = r1(kg);
      save();
      toast(`Spremljeno ${fmt(kg, 1)} kg${prev ? ` (${sgn(kg - prev.kg)})` : ''}`);
    },
    form => setTimeout(() => form.kg.focus(), 150));
}

/* ================= Način prehrane i dnevni ciljevi ================= */
const DIETS = [
  { id: 'keto', name: 'Keto (strogi)', desc: 'Do 20 g neto UH dnevno, puno masti, umjereno proteina. Cilj je stalna ketoza.' },
  { id: 'lchf', name: 'LCHF', desc: 'Do 50 g neto UH, prirodne masti i proteini. Fleksibilnija od strogog ketoa.' },
  { id: 'lowcarb', name: 'Umjereni low-carb', desc: 'Do 100 g neto UH – manje škroba i šećera, ali bez ketoze.' },
  { id: 'medit', name: 'Mediteranska', desc: 'Povrće, riba, maslinovo ulje, mahunarke i cjelovite žitarice; oko 45 % kalorija iz UH.' },
  { id: 'protein', name: 'Visokoproteinska', desc: 'Oko 2 g proteina po kg ciljne težine – za očuvanje mišića i trening snage.' },
  { id: 'balanced', name: 'Uravnotežena', desc: 'Klasična raspodjela (oko 50 % UH, 20 % proteina, 30 % masti) uz kalorijski deficit.' }
];
const dietOf = id => DIETS.find(d => d.id === id) || DIETS[1];
const lowCarb = () => ['keto', 'lchf', 'lowcarb'].includes(db.settings.diet || 'lchf');
const ACTIVITY = [[1.2, 'Sjedilački (malo kretanja)'], [1.375, 'Lagana aktivnost (1–3 treninga tjedno)'], [1.55, 'Umjerena aktivnost (3–5 treninga)'], [1.725, 'Visoka aktivnost (6–7 treninga)']];
const PACE = [[0, 'Održavanje težine'], [0.25, 'Polako (0,25 kg tjedno)'], [0.5, 'Umjereno (0,5 kg tjedno)'], [0.75, 'Brže (0,75 kg tjedno)']];

// Mifflin-St Jeor + raspodjela makronutrijenata prema prehrani
function calcTargets(p) {
  const w = p.weight, h = p.height, age = p.age;
  if (!w || !h || !age || !p.sex) return null;
  const bmr = 10 * w + 6.25 * h - 5 * age + (p.sex === 'm' ? 5 : -161);
  const tdee = bmr * p.activity;
  const floor = p.sex === 'm' ? 1500 : 1200;
  const kcal = Math.round(Math.max(floor, tdee - p.pace * 7700 / 7) / 10) * 10;
  const refW = p.goal && p.goal < w ? Math.max(p.goal, w * 0.8) : w; // proteini prema ciljnoj težini
  let P, C, F;
  const rest = (k, used) => Math.max(0, (k - used));
  switch (p.diet) {
    case 'keto': P = 1.5 * refW; C = 20; F = rest(kcal, 4 * P + 4 * C) / 9; break;
    case 'lchf': P = 1.5 * refW; C = 50; F = rest(kcal, 4 * P + 4 * C) / 9; break;
    case 'lowcarb': P = 1.4 * refW; C = 100; F = rest(kcal, 4 * P + 4 * C) / 9; break;
    case 'medit': P = 1.2 * refW; F = kcal * 0.35 / 9; C = rest(kcal, 4 * P + 9 * F) / 4; break;
    case 'protein': P = 2.0 * refW; F = kcal * 0.30 / 9; C = rest(kcal, 4 * P + 9 * F) / 4; break;
    default: P = 1.2 * refW; F = kcal * 0.30 / 9; C = rest(kcal, 4 * P + 9 * F) / 4;
  }
  F = Math.max(F, 30);
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, protein: Math.round(P), carbs: Math.round(C), fat: Math.round(F) };
}
function openGoals() {
  const s = db.settings, lw = latestWeight(today());
  const opt = (arr, v) => arr.map(([val, l]) => `<option value="${val}" ${+v === val ? 'selected' : ''}>${l}</option>`).join('');
  openDialog(`<h2>Prehrana i ciljevi</h2>
    <div class="stack">
      <label>Način prehrane<select name="diet">${DIETS.map(d => `<option value="${d.id}" ${(s.diet || 'lchf') === d.id ? 'selected' : ''}>${d.name}</option>`).join('')}</select></label>
      <p class="muted small" id="dietDesc" style="margin:0"></p>
      <fieldset><legend>Spol</legend><div class="seg" style="display:flex">
        <label class="segopt"><input type="radio" name="sex" value="z" ${s.sex === 'z' ? 'checked' : ''}><span>Žensko</span></label>
        <label class="segopt"><input type="radio" name="sex" value="m" ${s.sex === 'm' ? 'checked' : ''}><span>Muško</span></label></div></fieldset>
      <div class="grid2">
        <label>Dob (godine)<input name="age" inputmode="numeric" value="${s.age ?? ''}"></label>
        <label>Visina (cm)<input name="height" inputmode="numeric" value="${s.heightCm ?? ''}"></label>
        <label>Težina (kg)<input name="weight" inputmode="decimal" value="${lw ? fmt(lw.kg, 1) : ''}"></label>
        <label>Ciljna težina (kg)<input name="goal" inputmode="decimal" value="${s.goalWeight ?? ''}"></label>
      </div>
      <label>Aktivnost<select name="activity">${opt(ACTIVITY, s.activity || 1.375)}</select></label>
      <label>Tempo<select name="pace">${opt(PACE, s.pace ?? 0.5)}</select></label>
      <div class="preview" id="goalPrev"></div>
      <p class="muted small" style="margin:0">Izračun: Mifflin-St Jeor × aktivnost − deficit za odabrani tempo (7700 kcal ≈ 1 kg). Kalorije ne idu ispod 1200 (Ž) / 1500 (M). Vrijednosti možeš kasnije ručno promijeniti u Postavkama.</p>
      <div class="btns end"><button type="button" class="btn" data-action="close">Odustani</button><button class="btn primary">Primijeni</button></div>
    </div>`,
    fd => {
      const p = goalInput(fd), t = calcTargets(p);
      if (!t) { toast('Upiši spol, dob, visinu i težinu'); return false; }
      Object.assign(db.settings, {
        diet: p.diet, dietChosen: true, sex: p.sex, age: p.age, heightCm: p.height, goalWeight: p.goal || db.settings.goalWeight,
        activity: p.activity, pace: p.pace, kcalTarget: t.kcal, carbLimit: t.carbs, proteinTarget: t.protein, fatTarget: t.fat
      });
      if (p.weight && db.weights[today()] == null && !latestWeight(today())) db.weights[today()] = r1(p.weight);
      save();
      toast(`${dietOf(p.diet).name}: ${fmt(t.kcal)} kcal · UH ${t.carbs} g · P ${t.protein} g · M ${t.fat} g`);
    },
    form => {
      const upd = () => {
        const fd = Object.fromEntries(new FormData(form)), p = goalInput(fd), t = calcTargets(p);
        $('#dietDesc').textContent = dietOf(p.diet).desc;
        $('#goalPrev').innerHTML = t
          ? `<b>${fmt(t.kcal)} kcal</b> dnevno · neto UH <b>${t.carbs} g</b> · proteini <b>${t.protein} g</b> · masti <b>${t.fat} g</b><br><span class="muted">Bazalni metabolizam ${fmt(t.bmr)} kcal · ukupna potrošnja ≈ ${fmt(t.tdee)} kcal</span>`
          : '<span class="muted">Upiši spol, dob, visinu i težinu za izračun.</span>';
      };
      form.addEventListener('input', upd);
      form.addEventListener('change', upd);
      upd();
    });
}
const goalInput = fd => ({
  diet: fd.diet || 'lchf', sex: fd.sex || '', age: num(fd.age), height: num(fd.height), weight: num(fd.weight), goal: num(fd.goal),
  activity: num(fd.activity) || 1.375, pace: num(fd.pace) ?? 0.5
});

/* ================= Recepti ================= */
const RECIPE_CATS = ['Sve', 'Doručak', 'Ručak i večera', 'Juhe', 'Prilozi i salate', 'Pekarski', 'Užine i slastice'];
function recipeMacros(r, portions = 1) {
  const by = recipeMacros.map || (recipeMacros.map = new Map(FOOD_DB.map(x => [x[0], x])));
  const t = { carbs: 0, fiber: 0, fat: 0, protein: 0, grams: 0 };
  for (const [name, g] of r.ingredients) {
    const x = by.get(name);
    if (!x) continue;
    const k = g / 100;
    t.carbs += x[1] * k; t.fiber += x[2] * k; t.fat += x[3] * k; t.protein += x[4] * k; t.grams += g;
  }
  const f = portions / r.servings;
  const out = { carbs: r1(t.carbs * f), fiber: r1(t.fiber * f), fat: r1(t.fat * f), protein: r1(t.protein * f), grams: Math.round(t.grams * f), inc: false };
  out.net = netOf(out); out.kcal = kcalOf(out);
  return out;
}
function viewRecipes() {
  const d = dietOf(db.settings.diet), mine = (state.rFilter || 'mine') === 'mine', cat = state.rCat || 'Sve';
  const list = RECIPES.filter(r => (!mine || r.diets.includes(d.id)) && (cat === 'Sve' || r.cat === cat));
  return `
  <section class="card">
    <div class="card-h"><h2>Recepti</h2><button class="btn ghost sm" data-action="goals">${h(d.name)} ›</button></div>
    <div class="seg" style="display:flex;margin-bottom:10px">
      <button class="${mine ? 'on' : ''}" data-action="r-filter" data-v="mine" style="flex:1">Za moju prehranu</button>
      <button class="${!mine ? 'on' : ''}" data-action="r-filter" data-v="all" style="flex:1">Svi recepti</button>
    </div>
    <div class="chips">${RECIPE_CATS.map(c => `<button class="chip ${c === cat ? 'on' : ''}" data-action="r-cat" data-v="${h(c)}">${h(c)}</button>`).join('')}</div>
  </section>
  ${list.length ? list.map(r => {
    const m = recipeMacros(r), fits = r.diets.includes(d.id);
    const over = lowCarb() && db.settings.carbLimit && m.net > db.settings.carbLimit * 0.5;
    return `<button class="card recipe" data-action="recipe" data-id="${r.id}">
      <div class="card-h" style="margin-bottom:4px"><h2>${h(r.name)}</h2></div>
      <div class="muted small">${h(r.cat)} · ${r.time} min · ${r.servings} ${r.servings === 1 ? 'porcija' : r.servings < 5 ? 'porcije' : 'porcija'}${!fits ? ` · <span class="warn">nije za ${h(d.name)}</span>` : ''}</div>
      <div class="rmac"><span><b class="${over ? 'bad' : ''}" style="color:var(--c-carb)">${fmt(m.net, 1)}</b> g UH</span><span><b style="color:var(--c-prot)">${fmt(m.protein)}</b> g P</span><span><b style="color:var(--c-fat)">${fmt(m.fat)}</b> g M</span><span><b>${fmt(m.kcal)}</b> kcal</span><span class="muted">po porciji</span></div>
    </button>`;
  }).join('') : '<section class="card"><p class="empty">Nema recepata za ovaj odabir.</p></section>'}`;
}
function openRecipe(id) {
  const r = RECIPES.find(x => x.id === id);
  if (!r) return;
  const m = recipeMacros(r), s = db.settings;
  const share = (v, goal) => goal ? ` <span class="muted">(${fmt(v / goal * 100)}% dnevnog)</span>` : '';
  openDialog(`<h2>${h(r.name)}</h2>
    <p class="muted small" style="margin:0 0 10px">${h(r.cat)} · ${r.time} min · ${r.servings} ${r.servings === 1 ? 'porcija' : r.servings < 5 ? 'porcije' : 'porcija'} · ${r.diets.map(x => dietOf(x).name).join(', ')}</p>
    <div class="tiles tiles4">
      <div class="tile"><b style="color:var(--c-carb)">${fmt(m.net, 1)} g</b><span>neto UH</span></div>
      <div class="tile"><b style="color:var(--c-prot)">${fmt(m.protein)} g</b><span>proteini</span></div>
      <div class="tile"><b style="color:var(--c-fat)">${fmt(m.fat)} g</b><span>masti</span></div>
      <div class="tile"><b>${fmt(m.kcal)}</b><span>kcal</span></div>
    </div>
    <p class="muted small" style="margin:6px 0 0">Po porciji (≈ ${fmt(m.grams)} g). UH${share(m.net, s.carbLimit)}, proteini${share(m.protein, s.proteinTarget)}.</p>
    <h3>Sastojci (za ${r.servings} ${r.servings === 1 ? 'porciju' : r.servings < 5 ? 'porcije' : 'porcija'})</h3>
    <ul class="list">${r.ingredients.map(([n, g]) => `<li><span class="grow">${h(n)}</span><b>${fmt(g)} g</b></li>`).join('')}</ul>
    <p class="muted small" style="margin:4px 0 0">Sol, papar i začini po želji.</p>
    <h3>Priprema</h3>
    <ol class="steps">${r.steps.map(t => `<li>${h(t)}</li>`).join('')}</ol>
    <div class="row" style="margin-top:12px"><label style="flex:1">Broj porcija za unos<input name="portions" inputmode="decimal" value="1"></label></div>
    <div class="btns end" style="margin-top:10px">
      <button type="button" class="btn" data-action="recipe-fav" data-id="${r.id}">${isFav(r.name) ? '★ U favoritima' : '☆ U favorite'}</button>
      <button class="btn primary">Dodaj u obrok</button>
    </div>`,
    fd => {
      const p = num(fd.portions) || 1, mm = recipeMacros(r, p);
      db.foods.push({ id: uid(), date: state.date, time: nowTime(), name: r.name, carbs: mm.carbs, fiber: mm.fiber, fat: mm.fat, protein: mm.protein, grams: mm.grams, inc: false });
      save();
      toast(`Dodano: ${r.name}${p !== 1 ? ` × ${fmt(p, 1)}` : ''}`);
    });
}

/* ================= Izvještaji e-mailom ================= */
const REPORT_NOTIF = 1700;
const WEEKDAYS = ['Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota', 'Nedjelja'];
function firstDataDate() {
  const ds = [...weightDates(), ...db.foods.map(f => f.date), ...Object.keys(db.energy), ...db.ketones.map(k => k.date)].filter(Boolean).sort();
  return ds[0] || today();
}
const reportFrom = () => db.settings.reportFrom || firstDataDate();
const esc = h;
const postova = n => n % 10 === 1 && n % 100 !== 11 ? 'post' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'posta' : 'postova';

function reportSummaryText(ws) {
  const we = addDays(ws, 6), wd = weekData(ws), e = weekEnergyVsScale(ws);
  const L = wd.filter(x => x.logged), W = wd.filter(x => x.weight != null);
  const parts = [`Porki – izvještaj za tjedan ${shortDate(ws)}–${shortDate(we)}${we.slice(0, 4)}`];
  if (W.length) parts.push(`Težina: ${fmt(W.at(-1).weight, 1)} kg${e.actual != null ? ` (${sgn(e.actual, 2)} kg u odnosu na prošli tjedan)` : ''}`);
  if (L.length) parts.push(`Ø neto UH ${fmt(mean(L.map(x => x.net)), 1)} g · proteini ${fmt(mean(L.map(x => x.protein)))} g · masti ${fmt(mean(L.map(x => x.fat)))} g · ${fmt(mean(L.map(x => x.kcal)))} kcal`);
  if (e.days) parts.push(`Kalorijska bilanca ${sgn(e.sumBal, 0)} kcal – očekivano ${sgn(e.expectedWeek ?? e.expected, 2)} kg`);
  const from = reportFrom(), fw = weightDates().filter(d => d >= from), lw = latestWeight(today());
  if (fw.length && lw) parts.push(`Od ${shortDate(from)}${from.slice(0, 4)}: ${sgn(lw.kg - db.weights[fw[0]], 1)} kg`);
  parts.push('', 'Detaljan izvještaj s grafovima je u privitku (HTML – otvori u pregledniku).');
  return parts.join('\n');
}

function buildReportHtml() {
  const s = db.settings, ws = addDays(weekStart(today()), -7), we = addDays(ws, 6);
  const wd = weekData(ws), prev = weekData(addDays(ws, -7)), e = weekEnergyVsScale(ws);
  const L = wd.filter(x => x.logged);
  const from = reportFrom(), to = today();
  const expV = e.expectedWeek ?? e.expected;
  const tile = (v, l, cls = '') => `<div class="tile"><b class="${cls}">${v}</b><span>${l}</span></div>`;
  const avgOf = k => mean(L.map(x => x[k]));
  // tjedni podaci
  const dayRows = wd.map(x => `<tr><td>${DAYS[parseISO(x.d).getDay()]} ${shortDate(x.d)}</td><td class="${x.logged && lowCarb() && x.net > s.carbLimit ? 'bad' : ''}">${x.logged ? fmt(x.net, 1) : '–'}</td><td>${x.logged ? fmt(x.protein) : '–'}</td><td>${x.logged ? fmt(x.fat) : '–'}</td><td>${x.logged ? fmt(x.kcal) : '–'}</td><td>${fmt(x.burned)}</td><td class="${x.balance == null ? '' : x.balance <= 0 ? 'good' : 'bad'}">${x.balance == null ? '–' : sgn(x.balance, 0)}</td><td>${fmt(x.weight, 1)}</td><td>${x.ket == null ? '–' : esc(KET[x.ket].l)}</td></tr>`).join('');
  const labels = wd.map(x => DAYS[parseISO(x.d).getDay()]);
  const weekFasts = db.fasts.filter(f => { const d = iso(new Date(f.end)); return d >= ws && d <= we; });
  // kumulativno
  const weeks = [];
  for (let w = weekStart(from); w <= weekStart(today()); w = addDays(w, 7)) weeks.push(weekEnergyVsScale(w));
  const both = weeks.filter(w => w.expectedWeek != null && w.actual != null);
  const fwd = weightDates().filter(d => d >= from && d <= to);
  const startW = fwd.length ? db.weights[fwd[0]] : null, endW = fwd.length ? db.weights[fwd.at(-1)] : null;
  const span = Math.max(1, daysBetween(from, to) + 1);
  const cumFoods = new Set(db.foods.filter(f => f.date >= from && f.date <= to).map(f => f.date)).size;
  const cumBal = [];
  for (let i = 0; i < span; i++) { const d = addDays(from, i), fl = dayFood(d), b = burnedOf(db.energy[d]); if (fl.length && b != null) cumBal.push(totals(fl).kcal - b); }
  const cumKet = db.ketones.filter(k => k.date >= from && k.date <= to);
  const cumKetDays = new Set(cumKet.map(k => k.date)), cumInK = new Set(cumKet.filter(k => k.ket >= 1).map(k => k.date));
  const cumFasts = db.fasts.filter(f => iso(new Date(f.end)) >= from && iso(new Date(f.end)) <= to);
  const wLabels = [], wPts = [], wAvg = [];
  for (let i = 0; i < span; i++) { const d = addDays(from, i); wLabels.push(shortDate(d)); wPts.push(db.weights[d] ?? null); wAvg.push(db.weights[d] != null ? avg7(d) : null); }
  const goal = num(s.goalWeight);
  const weekRows = weeks.slice().reverse().map(w => {
    const d = weekData(w.ws), l = d.filter(x => x.logged), ww = d.filter(x => x.weight != null);
    return `<tr><td>${shortDate(w.ws)}</td><td>${fmt(mean(ww.map(x => x.weight)), 1)}</td><td class="${w.actual == null ? '' : w.actual <= 0 ? 'good' : 'bad'}">${w.actual == null ? '–' : sgn(w.actual, 2)}</td><td>${w.expectedWeek == null ? '–' : sgn(w.expectedWeek, 2)}</td><td>${fmt(mean(l.map(x => x.net)), 1)}</td><td>${fmt(mean(l.map(x => x.protein)))}</td><td>${w.days ? sgn(w.sumBal, 0) : '–'}</td></tr>`;
  }).join('');
  const css = `:root{--bg:#fff6f8;--card:#fff;--ink:#2a1d22;--muted:#7a6870;--line:#f0dde3;--soft:#fceaf0;--accent:#c2406a;--c-carb:#d9822b;--c-fat:#7f9c2c;--c-prot:#3f72af;--c-burn:#c2553a;--c-weight:#c2406a;--good:#2f7d4f;--warn:#b7791f;--bad:#c0392b;--info:#3f72af;--grid:#f5e6eb}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 -apple-system,"Segoe UI",Roboto,Arial,sans-serif}main{max-width:760px;margin:0 auto;padding:20px 16px}
h1{font-size:24px;margin:0 0 4px;color:var(--accent)}h2{font-size:18px;margin:0 0 10px}h3{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:16px 0 6px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin:14px 0}.muted{color:var(--muted);font-size:13px}
.tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.tile{background:var(--soft);border-radius:10px;padding:8px 10px}.tile b{display:block;font-size:18px}.tile span{font-size:12px;color:var(--muted)}
.good{color:var(--good)}.bad{color:var(--bad)}.warn{color:var(--warn)}
table{border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums}th,td{padding:6px 5px;text-align:right;border-top:1px solid var(--line);white-space:nowrap}th{color:var(--muted);border-top:0}th:first-child,td:first-child{text-align:left}
.wrap{overflow-x:auto}ul.ins{list-style:none;padding:0;margin:0}ul.ins li{background:var(--soft);border-radius:10px;padding:8px 10px;margin-top:6px;font-size:14px}
ul.ins li.good{border-left:4px solid var(--good)}ul.ins li.warn{border-left:4px solid var(--warn)}ul.ins li.bad{border-left:4px solid var(--bad)}ul.ins li.info{border-left:4px solid var(--info)}ul.ins li{color:var(--ink)}
.chart{width:100%;max-width:560px;height:auto;display:block;margin:0 auto}.chart .grid{stroke:var(--grid)}.chart .ax{fill:var(--muted);font-size:9px}.chart .ref{stroke-width:1.2;stroke-dasharray:4 3}.chart .reflbl{font-size:9px;font-weight:600}
.legend{font-size:12px;color:var(--muted)}.legend span{margin-right:10px}.legend i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:4px}.card-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:10px}.card-h h2{margin:0}.small{font-size:12px}ul.insights{list-style:none;padding:0;margin:0}ul.insights li{background:var(--soft);border-radius:10px;padding:8px 10px;margin-top:6px;font-size:14px}ul.insights li.good{border-left:4px solid var(--good)}ul.insights li.warn{border-left:4px solid var(--warn)}ul.insights li.bad{border-left:4px solid var(--bad)}ul.insights li.info{border-left:4px solid var(--info)}details.explain{margin-top:12px;border-top:1px solid var(--line);padding-top:10px}details.explain summary{cursor:pointer;font-weight:600;color:var(--accent)}.help p,.help li{font-size:14px}footer{font-size:12px;color:var(--muted);margin:20px 0}
@media(max-width:520px){.tiles{grid-template-columns:1fr 1fr}}`;
  const ins = insights(wd, prev);
  return `<!doctype html><html lang="hr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Porki – izvještaj ${shortDate(ws)}–${shortDate(we)}${we.slice(0, 4)}</title><style>${css}</style></head><body><main>
<h1>Porki – izvještaj</h1>
<p class="muted">Prehrana: ${esc(dietOf(s.diet).name)} · ciljevi: ${fmt(s.kcalTarget)} kcal, UH ${s.carbLimit} g, proteini ${s.proteinTarget} g, masti ${s.fatTarget} g · izrađeno ${shortDate(today())}${today().slice(0, 4)}</p>

<section class="card"><h2>Prošli tjedan: ${shortDate(ws)}–${shortDate(we)}${we.slice(0, 4)}</h2>
<div class="tiles">
${tile(fmt(avgOf('net'), 1) + ' g', 'Ø neto UH')}${tile(fmt(avgOf('protein')) + ' g', 'Ø proteini')}${tile(fmt(avgOf('fat')) + ' g', 'Ø masti')}
${tile(fmt(avgOf('kcal')), 'Ø unos kcal')}${tile(fmt(mean(wd.filter(x => x.burned != null).map(x => x.burned))), 'Ø potrošnja kcal')}${tile(fmt(mean(wd.filter(x => x.steps != null).map(x => x.steps))), 'Ø koraka')}
${tile(expV != null ? sgn(expV, 2) + ' kg' : '–', 'očekivano iz bilance', expV != null && expV <= 0 ? 'good' : expV != null ? 'bad' : '')}${tile(e.actual != null ? sgn(e.actual, 2) + ' kg' : '–', 'stvarno (vaga)', e.actual == null ? '' : e.actual <= 0 ? 'good' : 'bad')}${tile(e.days ? sgn(e.sumBal, 0) : '–', 'bilanca kcal (' + e.days + ' d)')}
</div>
<h3>Uvidi</h3><ul class="ins">${ins.map(i => `<li class="${i.type}">${esc(i.text)}</li>`).join('')}</ul>
<h3>Neto ugljikohidrati (g)</h3>${chart({ labels, h: 150, zero: true, series: [{ type: 'bar', values: wd.map(x => x.logged ? r1(x.net) : null), color: v => lowCarb() && v > s.carbLimit ? 'var(--bad)' : 'var(--c-carb)', dec: 1, name: 'g' }], refs: [{ y: s.carbLimit, color: 'var(--bad)', label: 'cilj ' + s.carbLimit }], empty: 'Nema unosa hrane.' })}
<h3>Kalorije: unos i potrošnja</h3>${chart({ labels, h: 160, zero: true, series: [
    { type: 'bar', stack: true, values: wd.map(x => x.logged ? Math.round(x.net * 4) : null), color: 'var(--c-carb)' },
    { type: 'bar', stack: true, values: wd.map(x => x.logged ? Math.round(x.protein * 4) : null), color: 'var(--c-prot)' },
    { type: 'bar', stack: true, values: wd.map(x => x.logged ? Math.round(x.fat * 9) : null), color: 'var(--c-fat)' },
    { type: 'line', values: wd.map(x => x.burned), color: 'var(--c-burn)' }, { type: 'dots', values: wd.map(x => x.burned), color: 'var(--c-burn)' }] })}
<p class="legend">■ masti · ■ proteini · ■ UH · ● potrošeno</p>
<h3>Po danima</h3><div class="wrap"><table><tr><th>Dan</th><th>UH</th><th>P</th><th>M</th><th>kcal</th><th>Potr.</th><th>Bilanca</th><th>kg</th><th>Ketoni</th></tr>${dayRows}</table></div>
${weekFasts.length ? `<h3>Post</h3><p>${weekFasts.length} ${postova(weekFasts.length)} · Ø ${fmt(mean(weekFasts.map(f => f.end - f.start)) / 3600e3, 1)} h · najduži ${fmt(Math.max(...weekFasts.map(f => f.end - f.start)) / 3600e3, 1)} h</p>` : ''}
</section>

${energyVsScaleCard(ws)}

<section class="card"><h2>Kumulativno od ${shortDate(from)}${from.slice(0, 4)} do ${shortDate(to)}${to.slice(0, 4)}</h2>
<div class="tiles">
${tile(fmt(startW, 1) + ' kg', 'početna težina')}${tile(fmt(endW, 1) + ' kg', 'zadnja težina')}${tile(startW != null && endW != null ? sgn(endW - startW, 1) + ' kg' : '–', 'promjena', startW == null || endW == null ? '' : endW <= startW ? 'good' : 'bad')}
${tile(startW != null && endW != null ? sgn((endW - startW) / (span / 7), 2) : '–', 'kg tjedno (prosjek)')}${tile(cumBal.length ? sgn(sum(cumBal) / KCAL_PER_KG, 1) + ' kg' : '–', `očekivano iz bilance (${cumBal.length} d)`)}${tile(goal && endW ? fmt(Math.max(0, endW - goal), 1) + ' kg' : '–', 'do cilja')}
${tile(`${cumFoods}/${span}`, 'dana s unosom hrane')}${tile(cumKetDays.size ? `${cumInK.size}/${cumKetDays.size}` : '–', 'dana u ketozi (mjereno)')}${tile(cumFasts.length ? `${cumFasts.length} · Ø ${fmt(mean(cumFasts.map(f => f.end - f.start)) / 3600e3, 1)} h` : '–', 'postova · prosjek')}
</div>
${both.length ? `<p style="margin:10px 0 0">Tjedni s potpunim podacima (${both.length}): očekivano <b>${sgn(sum(both.map(w => w.expectedWeek)), 1)} kg</b>, stvarno <b>${sgn(sum(both.map(w => w.actual)), 1)} kg</b>.</p>` : ''}
<h3>Kretanje težine</h3>${chart({ labels: wLabels, h: 190, series: [{ type: 'dots', values: wPts, color: 'var(--muted)', dec: 1 }, { type: 'line', values: wAvg, color: 'var(--c-weight)', span: true, width: 2.5 }], refs: goal ? [{ y: goal, color: 'var(--good)', label: 'cilj ' + fmt(goal, 1) }] : [], empty: 'Nema mjerenja težine.' })}
<p class="legend">● dnevno mjerenje · — 7-dnevni prosjek</p>
<h3>Po tjednima</h3><div class="wrap"><table><tr><th>Tjedan</th><th>Ø kg</th><th>Promjena</th><th>Očekivano</th><th>Ø UH</th><th>Ø P</th><th>Bilanca kcal</th></tr>${weekRows}</table></div>
</section>
<footer>Izvještaj je izradila aplikacija Porki iz podataka spremljenih na uređaju. Očekivana promjena računa se kao kalorijska bilanca ÷ 7700 kcal. Opće smjernice, ne medicinski savjet.</footer>
</main></body></html>`;
}

async function sendReport() {
  const s = db.settings, ws = addDays(weekStart(today()), -7);
  const html = buildReportHtml(), text = reportSummaryText(ws);
  const subject = `Porki – izvještaj ${shortDate(ws)}–${shortDate(addDays(ws, 6))}${addDays(ws, 6).slice(0, 4)}`;
  const filename = `porki-izvjestaj-${addDays(ws, 6)}.html`;
  if (NATIVE && WB) {
    try { await WB.shareReport({ html, filename, email: s.reportEmail || '', subject, text }); }
    catch (e) { toast('Slanje nije uspjelo: ' + e.message); }
    return;
  }
  // web: preuzmi izvještaj i otvori e-mail sa sažetkom
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  location.href = `mailto:${encodeURIComponent(s.reportEmail || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text + '\n\n(Priloži preuzetu datoteku ' + filename + ')')}`;
}
function previewReport() {
  // u aplikaciji, s gumbom za zatvaranje (window.open u Android aplikaciji nema povratka)
  openDialog(`<h2>Pregled izvještaja</h2>
    <iframe class="report-frame" title="Izvještaj" sandbox="allow-same-origin"></iframe>
    <div class="btns end" style="margin-top:10px"><button type="button" class="btn" data-action="reports">‹ Natrag</button><button type="button" class="btn primary" data-action="report-send">Pošalji</button></div>`,
    null, () => { dlg.querySelector('.report-frame').srcdoc = buildReportHtml(); });
}
// vrijednosti iz obrasca izvještaja vrijede odmah (i bez dodira na Spremi)
function readReportForm() {
  const f = dlg.open && dlg.querySelector('form');
  if (!f || !f.reportDay) return;
  const fd = Object.fromEntries(new FormData(f));
  Object.assign(db.settings, { reportEmail: (fd.reportEmail || '').trim(), reportFrom: fd.reportFrom || '', reportDay: +fd.reportDay || 0, reportTime: fd.reportTime || '08:00' });
  save();
}
async function scheduleReportNotif() {
  if (!LN) return;
  try {
    await LN.cancel({ notifications: [{ id: REPORT_NOTIF }] }).catch(() => {});
    const d = +db.settings.reportDay;
    if (!d) return;
    let p = await LN.checkPermissions();
    if (p.display !== 'granted') p = await LN.requestPermissions();
    if (p.display !== 'granted') { toast('Obavijesti nisu dopuštene'); return; }
    const [hh, mm] = String(db.settings.reportTime || '08:00').split(':').map(Number);
    await LN.schedule({ notifications: [{
      id: REPORT_NOTIF, title: 'Tjedni izvještaj je spreman',
      body: 'Dodirni za slanje izvještaja za prošli tjedan na e-mail.',
      schedule: { on: { weekday: (d % 7) + 1, hour: hh || 0, minute: mm || 0 }, allowWhileIdle: true }, isExactNotification: false
    }] });
  } catch (e) { console.error(e); }
}
if (LN) LN.addListener('localNotificationActionPerformed', a => {
  if (a && a.notification && a.notification.id === REPORT_NOTIF) setTimeout(sendReport, 600);
}).catch?.(() => {});

function openReports() {
  const s = db.settings;
  openDialog(`<h2>Izvještaji e-mailom</h2>
    <div class="stack">
      <label>E-mail adresa<input name="reportEmail" type="email" inputmode="email" autocomplete="email" value="${h(s.reportEmail || '')}" placeholder="ime@primjer.hr"></label>
      <label>Kumulativno od<input name="reportFrom" type="date" value="${h(s.reportFrom || '')}" max="${today()}"></label>
      <p class="muted small" style="margin:0">Prazno = od početka (prvi unos: ${shortDate(firstDataDate())}${firstDataDate().slice(0, 4)}).</p>
      <div class="grid2">
        <label>Podsjetnik<select name="reportDay"><option value="0">Isključen</option>${WEEKDAYS.map((d, i) => `<option value="${i + 1}" ${+s.reportDay === i + 1 ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        <label>Vrijeme<input name="reportTime" type="time" value="${h(s.reportTime || '08:00')}"></label>
      </div>
      <p class="muted small" style="margin:0">Izvještaj sadrži prošli (završeni) tjedan i kumulativni pregled: težinu, makronutrijente, kalorijsku bilancu, očekivani i stvarni gubitak, ketone, post, grafove i tablice. ${NATIVE ? 'Otvara se aplikacija za e-mail s upisanom adresom i izvještajem u privitku – samo dodirni Pošalji.' : 'U web-verziji se izvještaj preuzme, a e-mail se otvori sa sažetkom – priloži preuzetu datoteku.'}</p>
      <div class="btns">
        <button type="button" class="btn" data-action="report-preview">Pregledaj</button>
        <button type="button" class="btn" data-action="report-send">Pošalji sada</button>
      </div>
      <div class="btns end"><button type="button" class="btn" data-action="close">Odustani</button><button class="btn primary">Spremi</button></div>
    </div>`,
    fd => {
      Object.assign(db.settings, { reportEmail: (fd.reportEmail || '').trim(), reportFrom: fd.reportFrom || '', reportDay: +fd.reportDay || 0, reportTime: fd.reportTime || '08:00' });
      save();
      scheduleReportNotif();
      toast(db.settings.reportDay ? `Podsjetnik: ${WEEKDAYS[db.settings.reportDay - 1].toLowerCase()} u ${db.settings.reportTime}` : 'Postavke izvještaja spremljene');
    });
}

/* ================= Sigurnosna kopija ================= */
function exportData() {
  if (NATIVE && WB) {
    // Android: izbornik Dijeli (Google disk, Datoteke, e-mail…); datum kopije tek kad je odredište odabrano
    WB.shareBackup({ json: JSON.stringify(db, null, 1), filename: `porki-${today()}.json` })
      .then(() => toast('Odaberi Google disk ili drugo mjesto za kopiju'))
      .catch(e => toast('Izvoz nije uspio: ' + e.message));
    return;
  }
  db.settings.lastBackup = today(); save();
  const blob = new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `porki-${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Kopija izvezena');
}
function importData() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = async () => {
    try {
      const d = JSON.parse(await inp.files[0].text());
      if (!d || typeof d !== 'object' || !('weights' in d || 'foods' in d)) throw new Error('Nepoznat format');
      if (!confirm('Uvoz će zamijeniti sve trenutne podatke. Nastaviti?')) return;
      const e = emptyDb();
      db = { ...e, ...d, settings: { ...e.settings, ...(d.settings || {}) } };
      save(); closeDialog(); render(); toast('Podaci uvezeni');
    } catch (err) { toast('Uvoz nije uspio: ' + err.message); }
  };
  inp.click();
}

/* ================= Događaji ================= */
const actions = {
  close: closeDialog,
  settings: openSettings,
  'prev-day': () => { state.date = addDays(state.date, -1); render(); },
  'next-day': () => { if (state.date < today()) { state.date = addDays(state.date, 1); render(); } },
  'pick-day': () => {
    const p = $('#datePicker'); p.max = today(); p.value = state.date;
    if (p.showPicker) { try { p.showPicker(); return; } catch { /* fallback */ } }
    p.click();
  },
  'prev-week': () => { state.week = addDays(state.week, -7); render(); },
  'next-week': () => { state.week = addDays(state.week, 7); render(); },
  'add-food': openFoodSearch,
  'food-manual': () => openFood({ name: (dlg.querySelector('[name=q]') || {}).value || '' }),
  scan: openScanner,
  'off-search': offSearch,
  pick: el => { const i = +el.dataset.i, src = el.dataset.src; const it = src === 'd' ? (FOOD_DB[i] && dbItem(FOOD_DB[i])) : (src === 'o' ? state.offres : state.sres)[i]; if (it) openFood({ ...it, fav: false, time: undefined }); },
  'fast-goal': el => { db.settings.fastGoal = +el.dataset.v; save(); render(); },
  'fast-start': el => startFast(el.dataset.from),
  'fast-end': endFast,
  'fast-edit': openFastEdit,
  'fast-cancel': () => { if (confirm('Poništiti trenutni post bez spremanja?')) { db.fast = null; cancelFastNotif(); save(); closeDialog(); render(); } },
  'del-fast': el => { if (confirm('Obrisati ovaj post?')) { db.fasts = db.fasts.filter(f => f.id !== el.dataset.id); save(); render(); } },
  'edit-food': el => { const f = db.foods.find(x => x.id === el.dataset.id); if (f) openFood(f.src ? { ...f, ...f.src, per100: true } : f, f.id); },
  'del-food': el => { db.foods = db.foods.filter(f => f.id !== el.dataset.id); save(); closeDialog(); render(); toast('Obrisano'); },
  quick: el => { const q = state.quick[+el.dataset.i]; if (q) openFood({ ...q, fav: false, time: undefined }); },
  'fav-toggle': el => {
    const f = db.foods.find(x => x.id === el.dataset.id); if (!f) return;
    const k = f.name.toLowerCase();
    if (db.favorites.some(x => x.name.toLowerCase() === k)) { db.favorites = db.favorites.filter(x => x.name.toLowerCase() !== k); toast('Uklonjeno iz favorita'); }
    else { saveFavorite(f); toast('Dodano u favorite'); }
    save(); render();
  },
  'edit-favs': openFavs,
  reports: () => { if (dlg.open) closeDialog(); openReports(); },
  'report-send': () => { readReportForm(); sendReport(); },
  'report-preview': () => { readReportForm(); scheduleReportNotif(); previewReport(); },
  goals: () => { if (dlg.open) closeDialog(); openGoals(); },
  'r-filter': el => { state.rFilter = el.dataset.v; render(); },
  'r-cat': el => { state.rCat = el.dataset.v; render(); },
  recipe: el => openRecipe(el.dataset.id),
  'recipe-fav': el => {
    const r = RECIPES.find(x => x.id === el.dataset.id); if (!r) return;
    const m = recipeMacros(r);
    const on = toggleFavorite({ name: r.name, per100: false, grams: m.grams, carbs: m.carbs, fiber: m.fiber, fat: m.fat, protein: m.protein, inc: false });
    el.textContent = on ? '★ U favoritima' : '☆ U favorite';
    toast(on ? 'Recept dodan u favorite (1 porcija)' : 'Uklonjeno iz favorita');
  },
  'fav-new': () => openFood({ per100: true }),
  'fav-item': el => {
    const i = +el.dataset.i, src = el.dataset.src;
    const it = src === 'd' ? (FOOD_DB[i] && dbItem(FOOD_DB[i])) : (src === 'o' ? state.offres : state.sres)[i];
    if (!it) return;
    const on = toggleFavorite(it);
    el.classList.toggle('on', on);
    toast(on ? `★ ${it.name} dodano u favorite` : 'Uklonjeno iz favorita');
  },
  'fav-only': () => {
    const fd = Object.fromEntries(new FormData(dlg.querySelector('form')));
    const name = (fd.name || '').trim();
    if (!name) { toast('Upiši naziv'); return; }
    const it = { name, per100: !!fd.per100, grams: num(fd.grams), carbs: num(fd.carbs) || 0, fiber: num(fd.fiber) || 0, fat: num(fd.fat) || 0, protein: num(fd.protein) || 0 };
    db.favorites = db.favorites.filter(f => f.name.toLowerCase() !== name.toLowerCase());
    toggleFavorite(it);
    closeDialog(); render();
    toast(`★ ${name} spremljeno u favorite`);
  },
  'del-fav': el => { db.favorites = db.favorites.filter(f => f.id !== el.dataset.id); save(); el.closest('li').remove(); render(); },
  'add-ketone': openKetone,
  'del-ketone': el => { if (confirm('Obrisati mjerenje?')) { db.ketones = db.ketones.filter(k => k.id !== el.dataset.id); save(); render(); } },
  'del-weight': el => { if (confirm(`Obrisati mjerenje za ${shortDate(el.dataset.d)}?`)) { delete db.weights[el.dataset.d]; save(); render(); } },
  wrange: el => { state.wRange = +el.dataset.v; render(); },
  'energy-edit': openEnergy,
  'energy-bulk': el => openEnergyBulk(+el.dataset.days || 30),
  'energy-fill': fillEmptyEnergy,
  'del-energy': () => { delete db.energy[state.date]; save(); closeDialog(); render(); },
  'hc-sync': () => hcSync(true, 30),
  'hc-perm': async () => { if (dlg.open) closeDialog(); await hcRequest(); await hcSync(); },
  'hc-open': () => HB && HB.openHealthConnect().catch(e => toast(e.message)),
  install: async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; render(); },
  'hide-install': () => { db.settings.hideInstall = true; save(); render(); },
  export: exportData,
  import: importData,
  wipe: () => {
    if (confirm('Trajno obrisati SVE podatke s ovog uređaja?') && confirm('Sigurno? Ovo se ne može poništiti.')) {
      db = emptyDb(); save(); closeDialog(); render(); toast('Podaci obrisani');
    }
  }
};
document.addEventListener('click', ev => {
  const tabBtn = ev.target.closest('.nav button[data-tab]');
  if (tabBtn) { state.tab = tabBtn.dataset.tab; render(); scrollTo(0, 0); return; }
  const el = ev.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) { ev.preventDefault(); actions[el.dataset.action](el, ev); }
});
document.addEventListener('submit', ev => {
  const f = ev.target;
  if (f.dataset.form === 'weight' || f.dataset.form === 'weight-any') {
    ev.preventDefault();
    const date = f.date ? f.date.value || state.date : state.date;
    const raw = f.kg.value.trim();
    if (!raw && f.dataset.form === 'weight') {
      if (db.weights[date] != null && confirm('Obrisati težinu za ovaj dan?')) { delete db.weights[date]; save(); render(); }
      return;
    }
    const kg = num(raw);
    if (kg == null || kg < 20 || kg > 400) { toast('Unesi težinu u kg, npr. 85,4'); return; }
    db.weights[date] = r1(kg); save();
    const prev = latestWeight(addDays(date, -1));
    toast(`Spremljeno ${fmt(kg, 1)} kg${prev ? ` (${sgn(kg - prev.kg)})` : ''}`);
    render();
  }
});
$('#datePicker').addEventListener('change', ev => {
  if (ev.target.value) { state.date = ev.target.value > today() ? today() : ev.target.value; render(); }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') { if (NATIVE) nativeSave(true); return; }
  // novi dan dok je aplikacija bila otvorena
  if (state.lastSeen && state.lastSeen !== today() && state.date === state.lastSeen) state.date = today();
  state.lastSeen = today();
  if (!dlg.open) render();
  if (NATIVE && Date.now() - hc.lastSync > 60e3) hcSync();
  if (NATIVE) { widgetAction(); widgetSync(); }
});
addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); installEvt = ev; render(); });
state.lastSeen = today();

/* ================= Pokretanje ================= */
(async function init() {
  if (NATIVE) await nativeRestore();
  const qs = location.search;
  if (qs && /(total|active|basal|steps|weight)=/.test(qs)) {
    applyHealth(qs);
    history.replaceState(null, '', location.pathname);
  }
  render();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if (NATIVE) { hcSync(); widgetSync(); widgetAction(); if (db.settings.reportDay) scheduleReportNotif(); }
  else if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
