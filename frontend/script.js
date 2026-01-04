// frontend/script.js
const API_BASE = "http://127.0.0.1:8000";
const el = (id) => document.getElementById(id);
const num = (id) => Number(el(id).value || 0);

let confChart, historyChart, autoTimer = null;
let lastAnnounceLevel = "waiting…", lastAnnounceAt = 0;

// -------------------- PRESETS --------------------
const presets = {
  rush:  { Junction:2, Vehicles:220, Vehicles_lag1:210, Vehicles_lag2:205, Vehicles_lag3:198, Vehicles_lag6:160, Vehicles_lag24:240, roll3_mean:211, roll24_mean:230, hour:18, dayofweek:3, is_weekend:0 },
  mid:   { Junction:1, Vehicles:90,  Vehicles_lag1:88,  Vehicles_lag2:85,  Vehicles_lag3:82,  Vehicles_lag6:70,  Vehicles_lag24:95,  roll3_mean:88,  roll24_mean:92,  hour:12, dayofweek:2, is_weekend:0 },
  night: { Junction:3, Vehicles:25,  Vehicles_lag1:24,  Vehicles_lag2:22,  Vehicles_lag3:20,  Vehicles_lag6:18,  Vehicles_lag24:30,  roll3_mean:23,  roll24_mean:28,  hour:2,  dayofweek:4, is_weekend:0 },
  event: { Junction:4, Vehicles:260, Vehicles_lag1:250, Vehicles_lag2:245, Vehicles_lag3:240, Vehicles_lag6:200, Vehicles_lag24:150, roll3_mean:252, roll24_mean:170, hour:21, dayofweek:6, is_weekend:1 },
};

// -------------------- HELPERS --------------------
function levelColor(level) {
  if (level === "High")   return ["#fee2e2","#ef4444"];
  if (level === "Medium") return ["#fef3c7","#d97706"];
  if (level === "Low")    return ["#dcfce7","#16a34a"];
  return ["#e5e7eb","#374151"];
}
function setBadge(level) {
  const b = el("badge");
  const [bg, fg] = levelColor(level);
  b.style.background = bg; b.style.color = fg; b.textContent = level;
  b.classList.add("pulse"); setTimeout(()=>b.classList.remove("pulse"), 1000);
}
function setBtnBusy(isBusy) {
  const btn = el("predictBtn");
  btn.disabled = isBusy; btn.textContent = isBusy ? "Predicting…" : "Predict";
}
function setStatus(text, spinning=false) {
  const s = el("status");
  s.innerHTML = spinning ? `&nbsp;<span class="spin inline-block">🔄</span> ${text}` : text;
}
function payloadFromInputs() {
  return {
    Junction: num("Junction"), Vehicles: num("Vehicles"),
    Vehicles_lag1: num("Vehicles_lag1"), Vehicles_lag2: num("Vehicles_lag2"),
    Vehicles_lag3: num("Vehicles_lag3"), Vehicles_lag6: num("Vehicles_lag6"),
    Vehicles_lag24: num("Vehicles_lag24"), roll3_mean: num("roll3_mean"),
    roll24_mean: num("roll24_mean"), hour: num("hour"),
    dayofweek: num("dayofweek"), is_weekend: num("is_weekend"),
  };
}
function applyInputs(p) { Object.entries(p).forEach(([k, v]) => { const n = el(k); if (n !== null) n.value = v; }); }
function validate(p) {
  const errs = [];
  if (!Number.isFinite(p.Junction) || p.Junction < 1) errs.push("Junction ID must be 1 or higher");
  if (!Number.isFinite(p.hour) || p.hour < 0 || p.hour > 23) errs.push("Hour of Day must be between 0–23");
  if (!Number.isFinite(p.dayofweek) || p.dayofweek < 0 || p.dayofweek > 6) errs.push("Day of Week must be between 0–6");
  if (![0,1].includes(p.is_weekend)) errs.push("Weekend must be 0 (No) or 1 (Yes)");
  return errs;
}

// -------------------- SAFETY UI + VOICE --------------------
function safetyText(level) {
  if (level === "High")   return "⚠️ Alert! High traffic ahead. Keep distance and consider alternate routes.";
  if (level === "Medium") return "⚠️ Slow down! Traffic ahead. Stay alert and maintain a safe gap.";
  if (level === "Low")    return "✅ Have a happy journey. Roads are clear — drive safe!";
  return "ℹ️ Waiting for prediction…";
}
function renderSafety(level) {
  const node = el("safetyMsg");
  const [bg, fg] = levelColor(level);
  node.style.background = bg;
  node.style.color = fg;
  node.textContent = safetyText(level);
}
function speak(text) {
  try {
    if (!("speechSynthesis" in window)) return;
    const now = Date.now();
    if (lastAnnounceLevel === text && now - lastAnnounceAt < 4000) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1; u.pitch = 1; u.lang = "en-US";
    window.speechSynthesis.speak(u);
    lastAnnounceLevel = text;
    lastAnnounceAt = now;
  } catch {}
}
function announceFor(level) {
  const phrase =
    level === "High"   ? "Alert! High traffic ahead."
  : level === "Medium" ? "Slow down! Traffic ahead."
  : level === "Low"    ? "Have a happy journey."
  : null;
  if (phrase) speak(phrase);
}

// -------------------- CHARTS --------------------
function renderConfChart(conf = 0) {
  const ctx = el("confChart").getContext("2d");
  const pct = Math.round((conf || 0) * 100); const rest = 100 - pct;
  if (confChart) confChart.destroy();
  confChart = new Chart(ctx, {
    type: "doughnut",
    data: { labels: ["Confidence", "Remainder"], datasets: [{ data: [pct, rest] }] },
    options: { cutout: "70%", plugins: { legend: { display: false }, tooltip: { enabled: false } } }
  });
}
function getHistory() {
  try { return JSON.parse(localStorage.getItem("traffic_history") || "[]"); }
  catch { return []; }
}
function saveHistory(item) {
  try {
    const key = "traffic_history";
    const arr = JSON.parse(localStorage.getItem(key) || "[]");
    arr.unshift(item);
    localStorage.setItem(key, JSON.stringify(arr.slice(0, 30)));
  } catch {}
}
function renderHistoryChart() {
  const arr = getHistory().map(d => d.congestion).reverse();
  const labels = arr.map((_, i)=> i+1);
  const mapVal = (c) => c === "High" ? 2 : c === "Medium" ? 1 : 0;
  const ctx = el("historyChart").getContext("2d");
  if (historyChart) historyChart.destroy();
  historyChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label:"Congestion (0–2)", data: arr.map(mapVal) }] },
    options: { plugins:{legend:{display:false}}, scales:{y:{min:0,max:2,ticks:{stepSize:1}}} }
  });
}

// -------------------- FUN EFFECTS --------------------
function emojiRain() { /* intentionally disabled */ }
function playDing(level) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    const f = level==="Low"? 880 : level==="Medium"? 660 : 440;
    o.frequency.value = f; g.gain.value = 0.0001; o.start();
    g.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    o.stop(ctx.currentTime + 0.25);
  } catch {}
}

// -------------------- SHARE LINK --------------------
function shareLink(p) {
  const params = new URLSearchParams(p);
  return `${location.origin}${location.pathname}?${params.toString()}`;
}
function loadFromURL() {
  const q = Object.fromEntries(new URLSearchParams(location.search).entries());
  const nums = Object.fromEntries(Object.entries(q).map(([k,v])=>[k, Number(v)]));
  if (Object.keys(nums).length) applyInputs(nums);
}

// -------------------- API --------------------
async function callApi(path, payload) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    const msg = typeof data === "string" ? data : (data.detail || JSON.stringify(data));
    throw new Error(`${res.status} ${res.statusText}: ${msg}`);
  }
  return data;
}

// -------------------- CONGESTION ANIMATION --------------------
const trafficAnim = (() => {
  const cfgByLevel = {
    Low:    { lanes: 3, cars: 10, speed: [2.5, 4.0], color: "#16a34a" },
    Medium: { lanes: 4, cars: 22, speed: [1.6, 2.8], color: "#d97706" },
    High:   { lanes: 5, cars: 40, speed: [0.6, 1.2], color: "#ef4444" },
    "waiting…": { lanes: 3, cars: 0, speed: [0,0], color: "#64748b" }
  };

  let canvas, ctx, W, H, cars = [], lanes = 3, color="#16a34a", speedRange=[2,3];
  function resize() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 520;
    const cssH = canvas.clientHeight || 160;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = cssW; H = cssH;
  }
  function rand(a,b){ return a + Math.random()*(b-a); }
  function hexToRgb(hex){
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? { r:parseInt(m[1],16), g:parseInt(m[2],16), b:parseInt(m[3],16) } : {r:22,g:163,b:74};
  }
  function shade(hex, k){
    const {r,g,b} = hexToRgb(hex);
    const mix = (c)=> Math.round(c*k + 255*(1-k));
    return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
  }
  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (w < 2*r) r = w/2; if (h < 2*r) r = h/2;
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y,   x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x,   y+h, r);
    ctx.arcTo(x,   y+h, x,   y,   r);
    ctx.arcTo(x,   y,   x+w, y,   r);
    if (fill) ctx.fill(); if (stroke) ctx.stroke();
  }
  function makeCar(laneY) {
    const len = Math.max(28, Math.min(40, 28 + Math.random()*12));
    const h   = Math.max(10, Math.min(14, 10 + Math.random()*4));
    const y   = laneY - h/2 + (Math.random()*4 - 2);
    const v   = speedRange[0] + Math.random()*(speedRange[1]-speedRange[0]);
    const shadeK = Math.max(0.7, Math.min(1, 0.7 + Math.random()*0.3));
    return { x: -Math.random()*W, y, w: len, h, v, tint: shadeK };
  }
  function rebuild(pop) {
    cars = [];
    const laneGap = H / (lanes + 1);
    for (let i=0; i<pop; i++){
      const laneIdx = Math.floor(1 + Math.random()*lanes);
      const laneY = laneGap * laneIdx;
      cars.push(makeCar(laneY));
    }
  }
  function drawLaneLines() {
    const laneGap = H / (lanes + 1);
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = "rgba(100,116,139,0.25)";
    for (let i=1;i<=lanes;i++){
      const y = laneGap * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  function draw() {
    ctx.clearRect(0,0,W,H);
    drawLaneLines();
    for (const c of cars) {
      ctx.fillStyle = shade(color, c.tint);
      roundRect(ctx, c.x, c.y, c.w, c.h, 4, true, false);
      ctx.fillStyle = "rgba(15,23,42,0.9)";
      const wy = c.y + c.h - 2;
      ctx.beginPath(); ctx.arc(c.x + c.w*0.25, wy, 2, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(c.x + c.w*0.75, wy, 2, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "rgba(253, 230, 138, 0.5)";
      ctx.fillRect(c.x + c.w - 3, c.y + 3, 2, 3);
    }
  }
  function step() {
    for (const c of cars) {
      c.x += c.v;
      if (c.x - c.w > W) {
        const laneGap = H / (lanes + 1);
        const laneIdx = Math.floor(1 + Math.random()*lanes);
        c.x = - (20 + Math.random() * (W*0.4));
        c.y = laneGap * laneIdx - c.h/2 + (Math.random()*4 - 2);
        c.v = speedRange[0] + Math.random()*(speedRange[1]-speedRange[0]);
        c.w = Math.max(28, Math.min(40, 28 + Math.random()*12));
        c.h = Math.max(10, Math.min(14, 10 + Math.random()*4));
        c.tint = Math.max(0.7, Math.min(1, 0.7 + Math.random()*0.3));
      }
    }
  }
  function loop() { step(); draw(); requestAnimationFrame(loop); }
  function init() {
    const canvasEl = el("trafficCanvas");
    if (!canvasEl) return;
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    resize(); window.addEventListener("resize", resize);
    setLevel("waiting…");
    let running = true;
    const toggle = el("animToggle");
    toggle?.addEventListener("click", ()=>{
      running = !running;
      toggle.textContent = running ? "⏸ Pause" : "▶ Play";
    });
    (function raf(){ if (running) { step(); draw(); } requestAnimationFrame(raf); })();
  }
  function setLevel(level){
    const cfg = cfgByLevel[level] || cfgByLevel["waiting…"];
    lanes = cfg.lanes; color = cfg.color; speedRange = cfg.speed;
    rebuild(cfg.cars);
  }
  return { init, setLevel };
})();

// -------------------- ACTIONS --------------------
export async function predict() {
  const p = payloadFromInputs();
  const errs = validate(p);
  const out = el("out");
  if (errs.length) { out.textContent = "Fix inputs:\n- " + errs.join("\n- "); return; }

  setBtnBusy(true); setStatus("Talking to model…", true);
  out.textContent = "Predicting…";

  try {
    const data = await callApi("/predict_classification", p);
    out.textContent = JSON.stringify(data, null, 2);
    setBadge(data.congestion);
    renderConfChart(data.confidence || 0);
    trafficAnim.setLevel(data.congestion);

    // Safety banner + voice
    renderSafety(data.congestion);
    announceFor(data.congestion);

    // Effects
    if (data.congestion === "Low") {
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 }});
    }
    playDing(data.congestion);

    saveHistory({ congestion: data.congestion, ts: Date.now() });
    renderHistoryChart();
    setStatus(`Done • ${new Date().toLocaleTimeString()}`);
  } catch (e) {
    out.textContent = `Error: ${e.message}`;
    setStatus("Failed (see error below)");
  } finally {
    setBtnBusy(false);
  }
}

// -------------------- RANDOMIZER (smaller overall again) --------------------
export function randomizeInputs() {
  const p = payloadFromInputs();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Bias small: multiply by ~0.55 instead of 0.65
  const baseSeed = p.Vehicles || 80;
  const base = Math.max(5, Math.round(baseSeed * 0.55));

  // Tight randomness (±15%)
  const rnd = (x) => Math.round(x + (Math.random()-0.5) * x * 0.15);

  const rp = {
    Junction: clamp(Math.round((p.Junction || 2) + (Math.random()*2 - 1)), 1, 4),
    Vehicles: rnd(base),
    Vehicles_lag1: rnd(base * 0.97),
    Vehicles_lag2: rnd(base * 0.94),
    Vehicles_lag3: rnd(base * 0.91),
    Vehicles_lag6: rnd(base * 0.70),
    Vehicles_lag24: rnd(base * 1.02),
    roll3_mean: rnd(base * 0.92),
    roll24_mean: rnd(base * 1.01),
    hour: clamp(Math.round(Math.random() * 23), 0, 23),
    dayofweek: clamp(Math.round(Math.random() * 6), 0, 6),
    is_weekend: Math.random() < 0.25 ? 1 : 0
  };

  applyInputs(rp);
  return rp;
}

// -------------------- SMART QUICK-FILL (auto-tunes via API) --------------------
const rank = (lvl) => lvl === "Low" ? 0 : (lvl === "Medium" ? 1 : (lvl === "High" ? 2 : -1));

function buildPayloadFromBase(base, opts = {}) {
  const {
    junc = 2,
    hour = 17,
    dow = 3,
    wknd = 0,
    longBias = 1.10,
    sixBias  = 0.72,
    r3Bias   = 0.93,
    r24Bias  = 1.02,
  } = opts;

  const p = {
    Junction: junc,
    Vehicles: Math.round(base),
    Vehicles_lag1: Math.round(base * 0.97),
    Vehicles_lag2: Math.round(base * 0.94),
    Vehicles_lag3: Math.round(base * 0.91),
    Vehicles_lag6: Math.round(base * sixBias),
    Vehicles_lag24: Math.round(base * longBias),
    roll3_mean: Math.round(base * r3Bias),
    roll24_mean: Math.round(base * r24Bias),
    hour, dayofweek: dow, is_weekend: wknd
  };
  return p;
}

async function smartFill(target, seedBase) {
  const targetR = rank(target);
  let base = seedBase;
  let best = null;
  const maxIter = 6;

  setStatus(`Tuning for ${target}…`, true);
  el("out").textContent = `Auto-tuning to ${target}…`;

  for (let i = 0; i < maxIter; i++) {
    const payload = buildPayloadFromBase(base, {
      junc: 2,
      hour: target === "Low" ? 2 : (target === "High" ? 18 : 17),
      dow:  target === "Low" ? 2 : (target === "High" ? 5 : 3),
      wknd: 0,
      longBias: target === "High" ? 1.15 : target === "Low" ? 1.05 : 1.10,
      sixBias:  target === "High" ? 0.78 : target === "Low" ? 0.66 : 0.72,
      r3Bias:   target === "High" ? 0.96 : target === "Low" ? 0.90 : 0.93,
      r24Bias:  target === "High" ? 1.06 : target === "Low" ? 0.98 : 1.02,
    });

    let data;
    try {
      data = await callApi("/predict_classification", payload);
    } catch (e) {
      setStatus("Tuning failed: API error"); 
      el("out").textContent = `Error during tuning: ${e.message}`;
      applyInputs(payload);
      return;
    }

    const curR = rank(data.congestion);
    const diff = Math.abs(curR - targetR);
    if (!best || diff < best.diff) best = { payload, data, diff };

    if (curR === targetR) {
      applyInputs(payload);
      el("out").textContent = JSON.stringify(data, null, 2);
      setBadge(data.congestion);
      renderConfChart(data.confidence || 0);
      trafficAnim.setLevel(data.congestion);
      renderSafety(data.congestion);
      announceFor(data.congestion);
      playDing(data.congestion);
      saveHistory({ congestion: data.congestion, ts: Date.now() });
      renderHistoryChart();
      setStatus(`Ready • tuned to ${target}`);
      return;
    }

    if (curR > targetR) {
      base = Math.max(5, Math.round(base * (target === "Low" ? 0.80 : 0.87)));
    } else {
      base = Math.round(base * (target === "High" ? 1.18 : 1.12));
    }
  }

  applyInputs(best.payload);
  el("out").textContent = JSON.stringify(best.data, null, 2);
  setBadge(best.data.congestion);
  renderConfChart(best.data.confidence || 0);
  trafficAnim.setLevel(best.data.congestion);
  renderSafety(best.data.congestion);
  announceFor(best.data.congestion);
  playDing(best.data.congestion);
  saveHistory({ congestion: best.data.congestion, ts: Date.now() });
  renderHistoryChart();
  setStatus(`Tuned close to ${target} (got ${best.data.congestion})`);
}

// Public wrappers used by buttons
export function fillHighTraffic()  { smartFill("High",   260); }
export function fillLowTraffic()   { smartFill("Low",     10); }

// -------------------- TABS / AUTOPLAY --------------------
export function setTab(id) {
  ["tab-play","tab-sim","tab-about"].forEach(t => {
    const sec = el(t); if (!sec) return;
    sec.classList.toggle("hidden", t !== id);
  });
  document.querySelectorAll(".tabbtn").forEach(btn=>{
    btn.classList.toggle("bg-white", btn.dataset.tab===id);
    btn.classList.toggle("dark:bg-slate-900", btn.dataset.tab===id);
  });
}

function toggleAutoPlay() {
  const btn = el("autoBtn");
  const status = el("autoStatus");
  if (autoTimer) {
    clearInterval(autoTimer); autoTimer = null;
    btn.textContent = "▶ Play"; status.textContent = "Paused";
    return;
  }
  btn.textContent = "⏸ Pause"; status.textContent = "Running…";
  randomizeInputs(); predict();
  autoTimer = setInterval(()=>{ randomizeInputs(); predict(); }, 2000);
}

// -------------------- INIT --------------------
export function initUI() {
  // Tabs
  document.querySelectorAll(".tabbtn").forEach(b => b.addEventListener("click", ()=> setTab(b.dataset.tab)));
  setTab("tab-play");

  // Theme
  const applyTheme = (d)=> document.documentElement.classList.toggle("dark", d==="dark");
  const saved = localStorage.getItem("theme") || "auto";
  if (saved==="dark" || (saved==="auto" && matchMedia("(prefers-color-scheme: dark)").matches)) applyTheme("dark");
  el("themeBtn").addEventListener("click", ()=>{
    const isDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("theme", isDark? "dark":"light");
  });

  // Presets & Buttons
  el("preset").addEventListener("change", (e)=> { const k = e.target.value; if (k) applyInputs(presets[k]); });
  el("randBtn").addEventListener("click", ()=> randomizeInputs());
  el("copyBtn").addEventListener("click", ()=>{
    try { navigator.clipboard.writeText(el("out").textContent || ""); setStatus("Copied result ✅"); } catch { setStatus("Copy failed"); }
  });
  el("shareBtn").addEventListener("click", ()=>{
    const link = shareLink(payloadFromInputs());
    navigator.clipboard.writeText(link).then(()=> setStatus("Share link copied 🔗"));
  });
  el("autoBtn")?.addEventListener("click", toggleAutoPlay);

  // Quick-fill buttons -> smart auto-tune
  el("fillHigh")?.addEventListener("click", fillHighTraffic);
  el("fillLow")?.addEventListener("click", fillLowTraffic);

  // Shortcuts
  window.addEventListener("keydown", (e)=>{
    if (e.target.tagName === "INPUT") return;
    const k = e.key.toLowerCase();
    if (k==="r") randomizeInputs();
    if (k==="p") predict();
    if (k==="a") toggleAutoPlay();
  });

  // Charts & URL state
  renderConfChart(0);
  renderHistoryChart();
  loadFromURL();

  // Start animation
  trafficAnim.init();
  trafficAnim.setLevel("waiting…");

  // Start badge + safety
  setBadge("waiting…");
  renderSafety("waiting…");
}
