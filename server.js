const express = require("express");
const fs = require("fs");
const crypto = require("crypto");
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Auth ───────────────────────────────────────────────────────────────────────
const LOGIN_USER = "Lunar3HP";
const LOGIN_PASS = "MrBlock12344";
const authSessions = new Set();

app.use((req, res, next) => {
  const raw = req.headers.cookie || "";
  req.cookies = {};
  raw.split(";").forEach(part => {
    const [k, ...v] = part.trim().split("=");
    if (k) req.cookies[k.trim()] = v.join("=").trim();
  });
  next();
});

function requireLogin(req, res, next) {
  if (req.path.startsWith("/v2/") || req.path === "/update-tokens" || req.path === "/try-refresh") return next();
  if (req.path === "/login" || req.path === "/do-login") return next();
  const token = req.cookies?.auth;
  if (token && authSessions.has(token)) return next();
  res.redirect("/login");
}
app.use(requireLogin);

const PORT = process.env.PORT || 3000;
const NAKAMA_SERVER = "https://animalcompany.us-east1.nakamacloud.io";
const SERVER_KEY = "6URuTSlDKKfYbuDW";
const SESSIONS_FILE = "./sessions.json";

let sessions = {};

function saveSessions() {
  try { fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), "utf8"); } catch (e) { console.log(`[Save] Failed: ${e.message}`); }
}
function loadSessions() {
  try { const raw = fs.readFileSync(SESSIONS_FILE, "utf8"); sessions = JSON.parse(raw); console.log(`[Load] Loaded ${Object.keys(sessions).length} session(s).`); } catch { console.log("[Load] No sessions.json, starting fresh."); }
}

function getExp(token) {
  try { return JSON.parse(Buffer.from(token.split(".")[1], "base64").toString()).exp; } catch { return 0; }
}
function timeLeft(token) {
  if (!token) return "No token";
  const secs = getExp(token) - Math.floor(Date.now() / 1000);
  if (secs <= 0) return "EXPIRED";
  const m = Math.floor(secs / 60), h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m ${secs % 60}s`;
}
function isExpired(token) {
  if (!token) return true;
  return getExp(token) - Math.floor(Date.now() / 1000) <= 0;
}

async function tryRefresh(session) {
  if (!session.refresh_token) return { success: false };
  const tok = session.refresh_token;
  const attempts = [
    {
      ep: "/v2/account/session/refresh",
      auth: "Basic " + Buffer.from(`${SERVER_KEY}:`).toString("base64"),
      body: JSON.stringify({ token: tok, vars: { authID: "9d5dca5eb2674de2a2204e31f1f7a1f8", clientUserAgent: "SteamFrame 1.67.3.2345_6f43a8db", deviceID: "a8319933d25f331503835aa71ec12f55", loginType: "1234", idType: "1234" } }),
    },
    { ep: "/v2/session/refresh", auth: "Bearer " + tok, body: JSON.stringify({ token: tok }) },
  ];
  for (const { ep, auth, body } of attempts) {
    try {
      const r = await fetch(`${NAKAMA_SERVER}${ep}`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": auth, "User-Agent": "UnityPlayer/6000.3.12f1 (UnityWebRequest/1.0, libcurl/8.10.1-DEV)", "x-unity-version": "6000.3.12f1" }, body });
      const text = await r.text();
      console.log(`[Refresh:${session.id}] ${ep} -> ${r.status}: ${text.substring(0, 200)}`);
      if (r.status === 200) {
        const data = JSON.parse(text);
        session.token = data.token;
        session.refresh_token = data.refresh_token;
        session.lastRefresh = Date.now();
        saveSessions();
        console.log(`[Refresh:${session.id}] Success! Expires: ${new Date(getExp(data.token) * 1000).toISOString()}`);
        return { success: true, endpoint: ep };
      }
    } catch (e) { console.log(`[Refresh:${session.id}] ${ep} error: ${e.message}`); }
  }
  return { success: false };
}

(async () => {
  loadSessions();
  for (const s of Object.values(sessions)) {
    if (s.refresh_token && isExpired(s.token)) { console.log(`[Startup] Refreshing: ${s.name || s.id}`); await tryRefresh(s); }
  }
})();

setInterval(async () => {
  const threshold = Math.floor(Date.now() / 1000) + 300;
  for (const s of Object.values(sessions)) {
    if (!s.refresh_token) continue;
    if (!s.token || getExp(s.token) < threshold) { console.log(`[Timer] Refreshing: ${s.name || s.id}`); await tryRefresh(s); }
  }
}, 60 * 60 * 1000);

// ── Login ──────────────────────────────────────────────────────────────────────

app.get("/login", (req, res) => {
  res.send(`<!DOCTYPE html>
<html><head><title>AC Auth Backend</title><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',monospace;background:#050508;display:flex;align-items:center;justify-content:center;min-height:100vh;overflow:hidden}
body::before{content:'';position:fixed;inset:0;background:radial-gradient(ellipse 80% 60% at 50% 0%,#7c3aed12 0%,transparent 70%);pointer-events:none}
.card{background:linear-gradient(135deg,#0e0e14 0%,#111118 100%);border:1px solid #a855f730;border-radius:20px;padding:44px 40px;width:360px;box-shadow:0 0 60px #a855f715,0 20px 60px #00000080;text-align:center;position:relative}
.card::before{content:'';position:absolute;inset:0;border-radius:20px;background:linear-gradient(135deg,#a855f708,transparent 60%);pointer-events:none}
.lock{font-size:36px;margin-bottom:16px;filter:drop-shadow(0 0 12px #a855f766)}
.brand{font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px;margin-bottom:2px}
.brand span{color:#a855f7}
.byline{font-size:11px;color:#a855f788;letter-spacing:3px;text-transform:uppercase;margin-bottom:28px;font-weight:600}
.field{position:relative;margin-bottom:12px}
.field input{width:100%;background:#0a0a10;color:#fff;border:1px solid #ffffff18;border-radius:10px;padding:13px 16px;font-family:'Inter',monospace;font-size:14px;outline:none;transition:border-color .2s}
.field input:focus{border-color:#a855f766;box-shadow:0 0 0 3px #7c3aed12}
.field input::placeholder{color:#333}
button[type=submit]{width:100%;background:linear-gradient(135deg,#a855f7,#7c3aed);color:#000;border:none;border-radius:10px;padding:14px;font-size:15px;font-weight:700;cursor:pointer;margin-top:6px;font-family:'Inter',monospace;letter-spacing:0.3px;transition:opacity .2s,transform .1s;box-shadow:0 4px 20px #a855f740}
button[type=submit]:hover{opacity:.92;transform:translateY(-1px)}
button[type=submit]:active{transform:translateY(0)}
.error{background:#ff333318;border:1px solid #ff333340;color:#ff6666;font-size:12px;padding:9px 12px;border-radius:8px;margin-bottom:14px}
</style></head><body>
<div class="card">
  <div class="lock">🔐</div>
  <div class="brand">AC Auth <span>Backend</span></div>
  <div class="byline">Made by Lunar3HP</div>
  ${req.query.err ? '<div class="error">Invalid username or password.</div>' : ''}
  <form method="POST" action="/do-login">
    <div class="field"><input type="text" name="username" placeholder="Username" autocomplete="off" required></div>
    <div class="field"><input type="password" name="password" placeholder="Password" required></div>
    <button type="submit">Sign In</button>
  </form>
</div>
</body></html>`);
});

app.post("/do-login", (req, res) => {
  const { username, password } = req.body;
  if (username === LOGIN_USER && password === LOGIN_PASS) {
    const token = crypto.randomBytes(32).toString("hex");
    authSessions.add(token);
    res.setHeader("Set-Cookie", `auth=${token}; Path=/; HttpOnly`);
    res.redirect("/");
  } else {
    res.redirect("/login?err=1");
  }
});

app.post("/logout", (req, res) => {
  const token = req.cookies?.auth;
  if (token) authSessions.delete(token);
  res.setHeader("Set-Cookie", "auth=; Path=/; Max-Age=0");
  res.redirect("/login");
});

// ── UI ─────────────────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  const total = Object.keys(sessions).length;
  const active = Object.values(sessions).filter(s => !isExpired(s.token)).length;
  const totalConns = Object.values(sessions).reduce((a, s) => a + (s.connections || 0), 0);

  const cards = Object.values(sessions).map(s => {
    const expired = isExpired(s.token);
    const connUrl = `https://${req.get("host")}/v2/account/authenticate/custom/${s.id}`;
    const tokenExp = getExp(s.token);
    const refreshExp = getExp(s.refresh_token);
    const now = Math.floor(Date.now() / 1000);
    const tokenSecs = Math.max(0, tokenExp - now);
    const refreshSecs = Math.max(0, refreshExp - now);
    return `
<div class="card" id="card-${s.id}">
  <div class="card-header">
    <div class="status-dot ${expired ? 'red' : 'green'}"></div>
    <span class="session-name">${escHtml(s.name || s.id)}</span>
    <button class="btn-sm" onclick="copyText('${s.id}')">Copy ID</button>
    <button class="btn-sm" onclick="copyText('${connUrl}')">Copy URL</button>
  </div>
  <div class="card-meta">
    <b>ID</b><code class="hideable">${s.id}</code>
    <b>URL</b><code class="hideable">${connUrl}</code>
    <b>Connections</b><span style="color:#e0e0e0">${s.connections || 0}</span>
  </div>
  <div class="timer-row">
    <div class="timer-box">
      <div class="timer-label">Token expires</div>
      <div class="timer-value ${tokenSecs < 300 ? 'warn' : ''}" id="tk-${s.id}" data-secs="${tokenSecs}" data-max="3600">${timeLeft(s.token)}</div>
      <div class="timer-bar"><div class="timer-fill ${tokenSecs < 300 ? 'warn' : ''}" id="tb-${s.id}" style="width:${Math.min(100, tokenSecs/3600*100).toFixed(1)}%"></div></div>
    </div>
    <div class="timer-box">
      <div class="timer-label">Refresh expires</div>
      <div class="timer-value" id="rk-${s.id}" data-secs="${refreshSecs}" data-max="21600">${timeLeft(s.refresh_token)}</div>
      <div class="timer-bar"><div class="timer-fill" id="rb-${s.id}" style="width:${Math.min(100, refreshSecs/21600*100).toFixed(1)}%"></div></div>
    </div>
  </div>
  <div class="token-section">
    <div class="token-row">
      <span class="token-label">Token</span>
      <div class="token-box">${escHtml(s.token || "")}</div>
    </div>
    <div class="token-row">
      <span class="token-label">Refresh Token</span>
      <div class="token-box">${escHtml(s.refresh_token || "")}</div>
    </div>
  </div>
  <div class="card-actions">
    <div class="update-form" style="width:100%">
      <form method="POST" action="/session/${s.id}/update">
        <input type="hidden" name="_from" value="ui">
        <textarea name="token" placeholder="Token" rows="2">${escHtml(s.token || "")}</textarea>
        <textarea name="refresh_token" placeholder="Refresh Token" rows="2">${escHtml(s.refresh_token || "")}</textarea>
        <button type="submit" class="btn btn-green" style="font-size:11px;padding:7px 14px">Update Tokens</button>
      </form>
    </div>
    <form method="POST" action="/session/${s.id}/refresh" style="display:inline">
      <button type="submit" class="btn btn-orange">🔄 Refresh</button>
    </form>
    <form method="POST" action="/session/${s.id}/rename" class="rename-form" style="display:inline;display:flex;gap:6px;align-items:center">
      <input name="name" placeholder="New name...">
      <button type="submit" class="btn btn-ghost">Rename</button>
    </form>
    <form method="POST" action="/session/${s.id}/delete" style="display:inline" onsubmit="return confirm('Delete this session?')">
      <button type="submit" class="btn btn-red">Delete</button>
    </form>
  </div>
</div>`;
  }).join("\n");

  res.send(`<!DOCTYPE html>
<html><head>
<title>AC Auth Backend</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--green:#a855f7;--green-dim:#a855f744;--green-glow:#a855f720;--bg:#050508;--bg1:#0b0b10;--bg2:#0f0f16;--bg3:#13131c;--border:#ffffff0f;--border-bright:#a855f728;--text:#e0e0e0;--muted:#4a4a5a;--warn:#ff9500;--danger:#ff3b30}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);padding:0 0 60px;max-width:980px;margin:0 auto;min-height:100vh;position:relative;z-index:1}
body::before{content:'';position:fixed;top:0;left:50%;transform:translateX(-50%);width:100%;height:500px;background:radial-gradient(ellipse 60% 30% at 50% 0%,#7c3aed10,transparent 70%);pointer-events:none;z-index:0}

/* ── HEADER ── */
.header{position:relative;z-index:1;text-align:center;padding:32px 24px 24px;border-bottom:1px solid var(--border)}
.header-brand{font-size:26px;font-weight:900;color:#fff;letter-spacing:-0.5px;line-height:1}
.header-brand span{color:var(--green)}
.header-byline{display:inline-block;margin-top:8px;font-size:11px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:var(--green);background:var(--green-glow);border:1px solid var(--green-dim);border-radius:100px;padding:4px 16px}
.header-right{position:absolute;right:24px;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:10px}
.clock{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}

/* ── STATS ── */
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:20px 24px 0;position:relative;z-index:1}
.stats-wrapper{position:relative;overflow:visible}
#spiralCanvas{position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:0;opacity:1}
.stat{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:16px 18px;position:relative;overflow:hidden}
.stat::after{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#8b5cf6,transparent)}
.stat-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;font-weight:600;margin-bottom:6px}
.stat-value{font-size:28px;font-weight:900;color:#a78bfa;line-height:1}

/* ── TOOLBAR ── */
.toolbar{display:flex;gap:8px;flex-wrap:wrap;padding:16px 24px;align-items:center}
.search-bar{background:var(--bg2);color:#fff;border:1px solid var(--border);padding:9px 14px;font-family:'Inter',sans-serif;font-size:12px;width:220px;border-radius:10px;outline:none;transition:border-color .2s}
.search-bar:focus{border-color:var(--border-bright)}
.search-bar::placeholder{color:var(--muted)}
.btn{border:none;padding:9px 16px;cursor:pointer;font-weight:600;font-size:12px;border-radius:10px;font-family:'Inter',sans-serif;transition:opacity .15s,transform .1s;letter-spacing:0.2px}
.btn:hover{opacity:.88;transform:translateY(-1px)}
.btn:active{transform:translateY(0)}
.btn-green{background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff}
.btn-orange{background:linear-gradient(135deg,#ff9500,#e08000);color:#000}
.btn-red{background:linear-gradient(135deg,#ff3b30,#cc2020);color:#fff}
.btn-blue{background:linear-gradient(135deg,#0a84ff,#006ee0);color:#fff}
.btn-ghost{background:var(--bg2);color:var(--green);border:1px solid var(--border-bright)}
.btn-ghost.active{background:var(--green-dim);color:#fff}
.btn-sm{background:var(--bg3);color:var(--green);border:1px solid var(--border);padding:4px 10px;cursor:pointer;font-size:10px;border-radius:7px;font-family:'Inter',sans-serif;font-weight:500;transition:opacity .15s}
.btn-sm:hover{opacity:.8}

/* ── CREATE FORM ── */
.create-panel{margin:0 24px 10px;background:var(--bg2);border:1px solid var(--border-bright);border-radius:14px;padding:20px;display:none}
.create-panel label{display:block;color:var(--muted);font-size:11px;font-weight:600;letter-spacing:0.5px;margin-bottom:5px;text-transform:uppercase}
.create-panel input,.create-panel textarea{background:var(--bg3);color:#fff;border:1px solid var(--border);padding:9px 12px;font-family:'Inter',monospace;font-size:11px;width:100%;margin-bottom:12px;border-radius:9px;outline:none;resize:vertical;transition:border-color .2s}
.create-panel input:focus,.create-panel textarea:focus{border-color:var(--border-bright)}

/* ── CARDS ── */
#cards{padding:0 24px}
.card{background:var(--bg2);border:1px solid var(--border);border-radius:16px;padding:18px 20px;margin-bottom:12px;transition:border-color .2s}
.card:hover{border-color:#ffffff18}
.card-header{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.status-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.status-dot.green{background:#a855f7;box-shadow:0 0 8px #a855f788}
.status-dot.red{background:var(--danger);box-shadow:0 0 8px #ff3b3066}
.session-name{flex:1;font-size:15px;font-weight:700;color:#fff}
.card-meta{font-size:11px;color:var(--muted);margin-bottom:12px;line-height:2;display:grid;grid-template-columns:auto 1fr;gap:0 10px}
.card-meta b{color:#666;font-weight:500}
.card-meta code{color:var(--green);font-size:10px;word-break:break-all}

/* ── TIMERS ── */
.timer-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
.timer-box{background:var(--bg1);border:1px solid var(--border);border-radius:10px;padding:10px 12px}
.timer-label{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;font-weight:600;margin-bottom:5px}
.timer-value{font-size:20px;font-weight:800;color:var(--green);font-variant-numeric:tabular-nums;line-height:1}
.timer-value.warn{color:var(--warn)}
.timer-bar{height:3px;background:#ffffff0a;border-radius:2px;margin-top:7px}
.timer-fill{height:3px;border-radius:2px;transition:width 1s linear;background:linear-gradient(90deg,#8b5cf6,#c084fc)}
.timer-fill.warn{background:linear-gradient(90deg,var(--warn),#ffb340)}

/* ── TOKEN BOXES ── */
.token-section{margin-bottom:10px}
.token-row{display:flex;align-items:center;gap:6px;margin-bottom:6px}
.token-label{font-size:10px;color:var(--muted);font-weight:600;letter-spacing:0.5px;text-transform:uppercase;min-width:90px}
.token-box{flex:1;background:var(--bg1);border:1px solid var(--border);padding:6px 10px;font-size:10px;word-break:break-all;color:#3a3a4a;border-radius:8px;font-family:monospace;line-height:1.4;transition:filter .3s,color .3s}
.token-box.hidden-tok{filter:blur(5px);user-select:none;pointer-events:none}
.hideable.hidden-tok{filter:blur(5px);user-select:none;pointer-events:none}
.token-box.hidden-tok *{user-select:none}

/* ── ACTIONS ── */
.card-actions{margin-top:12px;display:flex;flex-wrap:wrap;gap:6px;align-items:flex-start}
.update-form{width:100%;background:var(--bg1);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:6px}
.update-form textarea{background:var(--bg3);color:#fff;border:1px solid var(--border);padding:7px 10px;font-family:monospace;font-size:10px;width:100%;margin-bottom:6px;border-radius:7px;resize:vertical;outline:none;transition:border-color .2s}
.update-form textarea:focus{border-color:var(--border-bright)}
.rename-form input{background:var(--bg3);color:#fff;border:1px solid var(--border);padding:7px 10px;font-family:'Inter',sans-serif;border-radius:8px;font-size:12px;outline:none;width:130px;transition:border-color .2s}
.rename-form input:focus{border-color:var(--border-bright)}
</style>
</head><body>

<div class="header">
  <div class="header-brand">AC Auth <span>Backend</span></div>
  <div><span class="header-byline">✦ Made by Lunar3HP ✦</span></div>
  <div class="header-right">
    <span class="clock" id="clock"></span>
    <form method="POST" action="/logout" style="display:inline">
      <button type="submit" class="btn btn-red" style="padding:7px 14px;font-size:11px">Logout</button>
    </form>
  </div>
</div>

<div class="stats-wrapper">
  <canvas id="spiralCanvas"></canvas>
  <div class="stats">
    <div class="stat"><div class="stat-label">Total Sessions</div><div class="stat-value">${total}</div></div>
    <div class="stat"><div class="stat-label">Active</div><div class="stat-value">${active}</div></div>
    <div class="stat"><div class="stat-label">Connections</div><div class="stat-value">${totalConns}</div></div>
  </div>
</div>

<div class="toolbar">
  <input class="search-bar" type="text" placeholder="🔍  Search sessions..." oninput="filterCards(this.value)">
  <button class="btn btn-green" onclick="toggleCreate()">+ New Session</button>
  <form method="POST" action="/refresh-all" style="display:inline">
    <button type="submit" class="btn btn-orange">🔄 Refresh All</button>
  </form>
  <form method="POST" action="/clean-duplicates" style="display:inline">
    <button type="submit" class="btn btn-blue">🧹 Clean Dupes</button>
  </form>
  <button id="hideToggle" class="btn btn-ghost" onclick="toggleHideTokens()" title="Blur tokens for privacy">🔒 Hide Tokens</button>
</div>

<div id="create-panel" class="create-panel">
  <form method="POST" action="/session/create">
    <label>Name (optional)</label>
    <input name="name" placeholder="e.g. MyAccount">
    <label>Token</label>
    <textarea name="token" rows="2" placeholder="Paste token..."></textarea>
    <label>Refresh Token</label>
    <textarea name="refresh_token" rows="2" placeholder="Paste refresh_token..."></textarea>
    <button type="submit" class="btn btn-green">Create Session</button>
  </form>
</div>

<div id="cards">${cards}</div>

<script>
let tokensHidden = false;

function toggleHideTokens(){
  tokensHidden = !tokensHidden;
  document.querySelectorAll('.token-box, .hideable').forEach(el=>{
    el.classList.toggle('hidden-tok', tokensHidden);
  });
  // also blur the update textareas
  document.querySelectorAll('.update-form textarea').forEach(el=>{
    el.style.filter = tokensHidden ? 'blur(5px)' : '';
    el.style.userSelect = tokensHidden ? 'none' : '';
  });
  const btn = document.getElementById('hideToggle');
  btn.textContent = tokensHidden ? '🔓 Show All' : '🔒 Hide All';
  btn.classList.toggle('active', tokensHidden);
}

function copyText(t){navigator.clipboard.writeText(t)}
function filterCards(q){document.querySelectorAll('.card').forEach(c=>{c.style.display=c.innerText.toLowerCase().includes(q.toLowerCase())?'':'none'})}
function toggleCreate(){const f=document.getElementById('create-panel');f.style.display=f.style.display==='none'||f.style.display===''?'block':'none'}

function fmtSecs(s){
  if(s<=0)return'EXPIRED';
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;
  if(h>0)return h+'h '+m+'m';
  return String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
}

setInterval(()=>{
  document.querySelectorAll('.timer-value').forEach(el=>{
    let s=parseInt(el.dataset.secs);
    if(s>0){s--;el.dataset.secs=s;}
    el.textContent=fmtSecs(s);
    const max=parseInt(el.dataset.max)||3600;
    const barId=el.id.replace('tk-','tb-').replace('rk-','rb-');
    const bar=document.getElementById(barId);
    if(bar){bar.style.width=Math.max(0,Math.min(100,s/max*100)).toFixed(1)+'%';}
    if(s<300&&el.id.startsWith('tk-')){el.classList.add('warn');if(bar)bar.classList.add('warn');}
  });
},1000);

(function tick(){
  document.getElementById('clock').textContent=new Date().toLocaleTimeString();
  setTimeout(tick,1000);
})();

// ── Spiral warp canvas ──────────────────────────────────────────────────────
(function(){
  const canvas = document.getElementById('spiralCanvas');
  const ctx = canvas.getContext('2d');

  let W, H, cx, cy;
  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    cx = W / 2;
    cy = H * 0.42; // center slightly above middle — lines up with stats/toolbar
  }
  resize();
  window.addEventListener('resize', resize);

  let mouse = { x: -9999, y: -9999 };
  let smoothMouse = { x: 0, y: 0 };
  let influence = 0;
  let hovering = false;

  document.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    hovering = true;
  });
  document.addEventListener('mouseleave', () => { hovering = false; });

  function warpPoint(px, py) {
    if (influence < 0.005) return [px, py];
    const dx = smoothMouse.x - px;
    const dy = smoothMouse.y - py;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const pullRadius = 180;
    if (dist < pullRadius) {
      const f = (1 - dist / pullRadius);
      const strength = f * f * influence * 70;
      px += (dx / (dist + 0.5)) * strength;
      py += (dy / (dist + 0.5)) * strength;
    }
    return [px, py];
  }

  function drawSpiral(t) {
    ctx.clearRect(0, 0, W, H);

    smoothMouse.x += (mouse.x - smoothMouse.x) * 0.06;
    smoothMouse.y += (mouse.y - smoothMouse.y) * 0.06;
    influence += ((hovering ? 1 : 0) - influence) * 0.035;

    const maxR = Math.min(W, H) * 0.52; // fills viewport
    const slowT = t * 0.008;
    const rings = 12;
    const lineCount = 36;

    // Radial lines — very faint periwinkle, matching the grid in screenshot
    for (let i = 0; i < lineCount; i++) {
      const angle = (i / lineCount) * Math.PI * 2 + slowT * 0.4;
      ctx.beginPath();
      let first = true;
      for (let r = 6; r <= maxR; r += 5) {
        let px = cx + Math.cos(angle) * r;
        let py = cy + Math.sin(angle) * r;
        [px, py] = warpPoint(px, py);
        if (first) { ctx.moveTo(px, py); first = false; }
        else ctx.lineTo(px, py);
      }
      const bright = i % 3 === 0;
      ctx.strokeStyle = bright
        ? \`rgba(160, 80, 255, 0.12)\`
        : \`rgba(130, 50, 220, 0.06)\`;
      ctx.lineWidth = bright ? 0.7 : 0.4;
      ctx.stroke();
    }

    // Concentric rings — deep purple/violet galaxy colour
    for (let ring = 1; ring <= rings; ring++) {
      const baseR = (ring / rings) * maxR;
      const points = 200 + ring * 15;

      // Pure purple: high R, very low G, high B
      // Inner rings: deeper violet, outer rings: lighter purple
      const progress = ring / rings;
      const rC = Math.round(120 + progress * 60);  // 120→180  (purple-red)
      const gC = Math.round(20 + progress * 25);   // 20→45    (almost no green!)
      const bC = Math.round(200 + progress * 55);  // 200→255  (strong blue)
      const alpha = 0.10 + progress * 0.22;
      const lw = 0.8 + progress * 1.6; // 0.8→2.4px

      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2 + slowT * (ring % 2 === 0 ? 1 : -0.5);
        let px = cx + Math.cos(angle) * baseR;
        let py = cy + Math.sin(angle) * baseR;
        [px, py] = warpPoint(px, py);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }

      // Outer rings get a soft glow pass
      if (ring >= rings - 3) {
        ctx.strokeStyle = \`rgba(\${rC}, \${gC}, \${bC}, \${alpha * 0.35})\`;
        ctx.lineWidth = lw + 5;
        ctx.stroke();
      }

      ctx.strokeStyle = \`rgba(\${rC}, \${gC}, \${bC}, \${alpha})\`;
      ctx.lineWidth = lw;
      ctx.stroke();
    }

    requestAnimationFrame(() => drawSpiral(t + 1));
  }

  smoothMouse.x = W / 2;
  smoothMouse.y = H * 0.42;
  drawSpiral(0);
})();
</script>
</body></html>`);
});

function escHtml(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}

// ── Session CRUD ───────────────────────────────────────────────────────────────

app.post("/session/create",(req,res)=>{
  const id=crypto.randomBytes(8).toString("hex");
  const{name,token,refresh_token}=req.body;
  sessions[id]={id,name:name||id,token:token?.trim()||"",refresh_token:refresh_token?.trim()||"",connections:0};
  saveSessions();
  res.redirect("/");
});
app.post("/session/:id/update",(req,res)=>{
  const s=sessions[req.params.id];
  if(!s)return res.status(404).json({error:"Not found"});
  if(req.body.token)s.token=req.body.token.trim();
  if(req.body.refresh_token)s.refresh_token=req.body.refresh_token.trim();
  saveSessions();
  req.body._from==="ui"?res.redirect("/"):res.json({ok:true});
});
app.post("/session/:id/rename",(req,res)=>{
  const s=sessions[req.params.id];
  if(!s)return res.status(404).json({error:"Not found"});
  s.name=req.body.name?.trim()||s.name;
  saveSessions();
  res.redirect("/");
});
app.post("/session/:id/refresh",async(req,res)=>{
  const s=sessions[req.params.id];
  if(!s)return res.status(404).json({error:"Not found"});
  await tryRefresh(s);
  res.redirect("/");
});
app.post("/session/:id/delete",(req,res)=>{
  delete sessions[req.params.id];
  saveSessions();
  res.redirect("/");
});
app.post("/refresh-all",async(req,res)=>{
  for(const s of Object.values(sessions))await tryRefresh(s);
  res.redirect("/");
});
app.post("/clean-duplicates",(req,res)=>{
  const seen=new Map();
  for(const[id,s]of Object.entries(sessions)){
    const key=s.refresh_token||id;
    if(seen.has(key)){delete sessions[id];console.log(`[Clean] Removed duplicate ${id}`);}
    else seen.set(key,id);
  }
  saveSessions();
  res.redirect("/");
});

// ── API ────────────────────────────────────────────────────────────────────────

app.post("/v2/account/authenticate/custom/:client",(req,res)=>{
  const s=sessions[req.params.client];
  console.log(`[Auth] client=${req.params.client} found=${!!s}`);
  if(s){s.connections=(s.connections||0)+1;saveSessions();return res.json({token:s.token,refresh_token:s.refresh_token,created:false});}
  const first=Object.values(sessions)[0];
  if(first)return res.json({token:first.token,refresh_token:first.refresh_token,created:false});
  res.json({token:"",refresh_token:"",created:false});
});
app.post("/v2/account/authenticate/refresh",(req,res)=>{
  const first=Object.values(sessions)[0];
  res.json({token:first?.token||"",refresh_token:first?.refresh_token||"",created:false});
});
app.get("/v2/account",async(req,res)=>{
  const s=Object.values(sessions).find(s=>!isExpired(s.token));
  if(!s)return res.status(401).json({error:"No valid session"});
  try{const upstream=await fetch(`${NAKAMA_SERVER}/v2/account`,{headers:{"Authorization":`Bearer ${s.token}`}});res.json(await upstream.json());}
  catch(e){res.status(500).json({});}
});
app.post("/update-tokens",(req,res)=>{
  const{token,refresh_token,id}=req.body;
  if(!token||!refresh_token)return res.status(400).json({error:"token and refresh_token required"});
  const target=(id&&sessions[id])?sessions[id]:Object.values(sessions)[0];
  if(!target)return res.status(404).json({error:"No session found"});
  target.token=token;target.refresh_token=refresh_token;saveSessions();
  res.json({ok:true});
});
app.get("/try-refresh",async(req,res)=>{
  const results={};
  for(const s of Object.values(sessions))results[s.id]=await tryRefresh(s);
  res.json(results);
});
app.all("*",(req,res)=>{
  console.log(`[Unhandled] ${req.method} ${req.path}`);
  res.status(200).json({});
});
app.listen(PORT,()=>console.log(`Server running on port ${PORT}`));
