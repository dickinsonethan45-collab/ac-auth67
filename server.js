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
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:monospace;background:#0d0d0d;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#111;border:2px solid #00ff88;border-radius:12px;padding:40px 36px;width:340px;box-shadow:0 0 30px #00ff8822;text-align:center}
.lock{font-size:42px;margin-bottom:12px}
h1{color:#00ff88;font-size:20px;margin-bottom:4px;letter-spacing:1px}
.made{font-size:11px;color:#444;margin-bottom:24px}
input{width:100%;background:#fff;color:#000;border:none;border-radius:6px;padding:12px 14px;font-family:monospace;font-size:14px;margin-bottom:14px;outline:none}
button{width:100%;background:#00ff88;color:#000;border:none;border-radius:6px;padding:13px;font-size:16px;font-weight:bold;cursor:pointer;margin-top:4px}
button:hover{background:#00dd77}
.error{color:#ff4444;font-size:13px;margin-bottom:12px}
</style></head><body>
<div class="card">
  <div class="lock">🔐</div>
  <h1>AC Auth Backend</h1>
  <div class="made">Made by Lunar3HP</div>
  ${req.query.err ? '<div class="error">Invalid username or password.</div>' : ''}
  <form method="POST" action="/do-login">
    <input type="text" name="username" placeholder="Username" autocomplete="off" required>
    <input type="password" name="password" placeholder="Password" required>
    <button type="submit">Login</button>
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
    const connUrl = `${req.protocol}://${req.get("host")}/v2/account/authenticate/custom/${s.id}`;
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
    <div><b>ID:</b> <code>${s.id}</code></div>
    <div><b>URL:</b> <code>${connUrl}</code></div>
    <div><b>Connections:</b> ${s.connections || 0}</div>
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
  <div class="token-box">${escHtml(s.token || "")}</div>
  <div class="token-box">${escHtml(s.refresh_token || "")}</div>
  <div class="card-actions">
    <form method="POST" action="/session/${s.id}/update" style="display:inline;width:100%">
      <input type="hidden" name="_from" value="ui">
      <textarea name="token" placeholder="Token" rows="2" style="width:100%;margin-bottom:4px;background:#1a1a1a;color:#fff;border:1px solid #333;padding:6px;font-family:monospace;font-size:10px;border-radius:4px">${escHtml(s.token || "")}</textarea>
      <textarea name="refresh_token" placeholder="Refresh Token" rows="2" style="width:100%;margin-bottom:6px;background:#1a1a1a;color:#fff;border:1px solid #333;padding:6px;font-family:monospace;font-size:10px;border-radius:4px">${escHtml(s.refresh_token || "")}</textarea>
      <button type="submit" class="btn-action">Update Tokens</button>
    </form>
    <form method="POST" action="/session/${s.id}/refresh" style="display:inline">
      <button type="submit" class="btn-action btn-orange">Refresh</button>
    </form>
    <form method="POST" action="/session/${s.id}/rename" style="display:inline">
      <input name="name" placeholder="New name" style="background:#1a1a1a;color:#fff;border:1px solid #333;padding:5px;font-family:monospace;border-radius:4px;font-size:12px">
      <button type="submit" class="btn-action">Rename</button>
    </form>
    <form method="POST" action="/session/${s.id}/delete" style="display:inline" onsubmit="return confirm('Delete this session?')">
      <button type="submit" class="btn-action btn-red">Delete</button>
    </form>
  </div>
</div>`;
  }).join("\n");

  res.send(`<!DOCTYPE html>
<html><head>
<title>AC Auth Backend</title>
<style>
*{box-sizing:border-box}
body{font-family:monospace;background:#0d0d0d;color:#00ff88;padding:24px;max-width:920px;margin:0 auto}
.topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid #1a1a1a}
.brand{font-size:18px;font-weight:bold;color:#00ff88}
.made{font-size:11px;color:#444;margin-top:2px}
.topbar-right{display:flex;align-items:center;gap:10px}
.clock{font-size:12px;color:#444}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}
.stat{background:#111;border:1px solid #1e1e1e;border-radius:8px;padding:12px 14px}
.stat-label{font-size:10px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
.stat-value{font-size:22px;font-weight:bold;color:#00ff88}
.global-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;align-items:center}
.search-bar{background:#1a1a1a;color:#fff;border:1px solid #333;padding:7px 12px;font-family:monospace;font-size:12px;width:200px;border-radius:6px}
.btn-action{background:#00ff88;color:#000;border:none;padding:7px 14px;cursor:pointer;font-weight:bold;font-size:12px;border-radius:6px;font-family:monospace}
.btn-orange{background:#ff8800;color:#000}
.btn-red{background:#ff3333;color:#fff}
.btn-blue{background:#0088ff;color:#fff}
.btn-sm{background:#1a1a1a;color:#00ff88;border:1px solid #333;padding:3px 9px;cursor:pointer;font-size:10px;border-radius:4px;font-family:monospace}
.card{background:#111;border:1px solid #1e1e1e;border-radius:8px;padding:16px;margin-bottom:14px}
.card-header{display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:14px;font-weight:bold}
.status-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.status-dot.green{background:#00ff88;box-shadow:0 0 6px #00ff8866}
.status-dot.red{background:#ff3333;box-shadow:0 0 6px #ff333366}
.session-name{flex:1}
.card-meta{font-size:11px;color:#555;margin-bottom:10px;line-height:1.9}
.card-meta code{color:#00ff88;font-size:10px}
.timer-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
.timer-box{background:#0a0a0a;border:1px solid #1a1a1a;border-radius:6px;padding:8px 10px}
.timer-label{font-size:9px;color:#444;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
.timer-value{font-size:18px;font-weight:bold;color:#00ff88;font-variant-numeric:tabular-nums}
.timer-value.warn{color:#ff8800}
.timer-bar{height:3px;background:#1a1a1a;border-radius:2px;margin-top:5px}
.timer-fill{height:3px;background:#00ff88;border-radius:2px;transition:width 1s linear}
.timer-fill.warn{background:#ff8800}
.token-box{background:#0a0a0a;border:1px solid #1a1a1a;padding:6px 8px;font-size:10px;word-break:break-all;margin-bottom:4px;color:#333;border-radius:4px;max-height:36px;overflow:hidden}
.card-actions{margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;align-items:flex-start}
.create-form{background:#111;border:1px solid #1e1e1e;border-radius:8px;padding:16px;margin-bottom:20px}
.create-form input,.create-form textarea{background:#1a1a1a;color:#fff;border:1px solid #333;padding:7px;font-family:monospace;font-size:11px;width:100%;margin-bottom:8px;border-radius:4px}
label{display:block;color:#555;font-size:11px;margin-bottom:3px}
</style>
</head><body>
<div class="topbar">
  <div>
    <div class="brand">AC Auth Backend</div>
    <div class="made">Made by Lunar3HP</div>
  </div>
  <div class="topbar-right">
    <span class="clock" id="clock"></span>
    <form method="POST" action="/logout" style="display:inline">
      <button type="submit" class="btn-action btn-red" style="padding:5px 12px;font-size:11px">Logout</button>
    </form>
  </div>
</div>

<div class="stats">
  <div class="stat"><div class="stat-label">Total Sessions</div><div class="stat-value">${total}</div></div>
  <div class="stat"><div class="stat-label">Active</div><div class="stat-value">${active}</div></div>
  <div class="stat"><div class="stat-label">Total Connections</div><div class="stat-value">${totalConns}</div></div>
</div>

<div class="global-actions">
  <input class="search-bar" type="text" placeholder="Search sessions..." oninput="filterCards(this.value)">
  <button class="btn-action" onclick="toggleCreate()">+ Create Session</button>
  <form method="POST" action="/refresh-all" style="display:inline">
    <button type="submit" class="btn-action btn-orange">🔄 Refresh All</button>
  </form>
  <form method="POST" action="/clean-duplicates" style="display:inline">
    <button type="submit" class="btn-action btn-blue">🧹 Clean Duplicates</button>
  </form>
</div>

<div id="create-form" class="create-form" style="display:none">
  <form method="POST" action="/session/create">
    <label>Name (optional):</label>
    <input name="name" placeholder="e.g. MyAccount">
    <label>Token:</label>
    <textarea name="token" rows="2" placeholder="Paste token..."></textarea>
    <label>Refresh Token:</label>
    <textarea name="refresh_token" rows="2" placeholder="Paste refresh_token..."></textarea>
    <button type="submit" class="btn-action">Create Session</button>
  </form>
</div>

<div id="cards">${cards}</div>

<script>
function copyText(t){navigator.clipboard.writeText(t)}
function filterCards(q){document.querySelectorAll('.card').forEach(c=>{c.style.display=c.innerText.toLowerCase().includes(q.toLowerCase())?'':'none'})}
function toggleCreate(){const f=document.getElementById('create-form');f.style.display=f.style.display==='none'?'block':'none'}

function fmtSecs(s){
  if(s<=0)return'EXPIRED';
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;
  if(h>0)return h+'h '+m+'m';
  return String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
}

document.querySelectorAll('.timer-value').forEach(el=>{
  el.dataset.secs=parseInt(el.dataset.secs)||0;
});

setInterval(()=>{
  document.querySelectorAll('.timer-value').forEach(el=>{
    let s=parseInt(el.dataset.secs);
    if(s>0){s--;el.dataset.secs=s;}
    el.textContent=fmtSecs(s);
    const max=parseInt(el.dataset.max)||3600;
    const id=el.id;
    const barId=id.replace('tk-','tb-').replace('rk-','rb-');
    const bar=document.getElementById(barId);
    if(bar){
      const pct=Math.max(0,Math.min(100,s/max*100)).toFixed(1);
      bar.style.width=pct+'%';
    }
    if(s<300&&id.startsWith('tk-')){el.classList.add('warn');if(bar)bar.classList.add('warn');}
  });
  const now=new Date();
  document.getElementById('clock').textContent=now.toLocaleTimeString();
},1000);

(function tick(){
  const now=new Date();
  document.getElementById('clock').textContent=now.toLocaleTimeString();
  setTimeout(tick,1000);
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
