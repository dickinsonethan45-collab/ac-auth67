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

// ── Login Page ─────────────────────────────────────────────────────────────────
app.get("/login", (req, res) => {
  res.send(`<!DOCTYPE html>
<html><head><title>AC Auth — Login</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
body{font-family:'Inter',sans-serif;background:#020409;display:flex;align-items:center;justify-content:center}
#bg{position:fixed;inset:0;z-index:0}
.wrap{position:relative;z-index:2;width:400px}
.glass{background:rgba(8,14,28,0.72);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(0,210,255,0.15);border-radius:24px;padding:48px 44px;box-shadow:0 0 0 1px rgba(0,210,255,0.05),0 32px 80px rgba(0,0,0,0.7),0 0 120px rgba(0,170,255,0.06);text-align:center}
.glass::before{content:'';position:absolute;inset:0;border-radius:24px;background:linear-gradient(135deg,rgba(0,210,255,0.04) 0%,transparent 50%);pointer-events:none}
.logo-ring{width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#00d2ff22,#0066ff22);border:1px solid rgba(0,210,255,0.25);display:flex;align-items:center;justify-content:center;margin:0 auto 22px;position:relative;animation:pulse-ring 3s ease-in-out infinite}
.logo-ring::before{content:'';position:absolute;inset:-6px;border-radius:50%;border:1px solid rgba(0,210,255,0.1);animation:pulse-ring 3s ease-in-out infinite 0.5s}
@keyframes pulse-ring{0%,100%{box-shadow:0 0 0 0 rgba(0,210,255,0.15)}50%{box-shadow:0 0 0 8px rgba(0,210,255,0)}}
.logo-icon{font-size:30px;filter:drop-shadow(0 0 12px rgba(0,210,255,0.6))}
.brand{font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px;margin-bottom:3px}
.brand em{font-style:normal;background:linear-gradient(90deg,#00d2ff,#0066ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.sub{font-size:11px;color:rgba(0,210,255,0.45);letter-spacing:3px;text-transform:uppercase;font-weight:600;margin-bottom:36px}
.field{position:relative;margin-bottom:12px}
.field input{width:100%;background:rgba(0,20,40,0.6);color:#e8f4ff;border:1px solid rgba(0,210,255,0.12);border-radius:12px;padding:14px 16px;font-family:'Inter',sans-serif;font-size:13px;outline:none;transition:all .25s;letter-spacing:0.2px}
.field input::placeholder{color:rgba(100,150,200,0.35)}
.field input:focus{border-color:rgba(0,210,255,0.4);background:rgba(0,25,50,0.8);box-shadow:0 0 0 3px rgba(0,210,255,0.08),0 0 20px rgba(0,210,255,0.06)}
.btn-login{width:100%;margin-top:6px;padding:15px;background:linear-gradient(135deg,#00aaff,#0055ff);border:none;border-radius:12px;color:#fff;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:0.3px;transition:all .2s;box-shadow:0 4px 24px rgba(0,120,255,0.35),0 0 40px rgba(0,170,255,0.15)}
.btn-login:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,120,255,0.5),0 0 60px rgba(0,170,255,0.2)}
.btn-login:active{transform:translateY(0)}
.err{background:rgba(255,50,50,0.1);border:1px solid rgba(255,50,50,0.25);color:#ff7777;font-size:12px;padding:10px 14px;border-radius:10px;margin-bottom:14px;animation:shake .4s}
@keyframes shake{0%,100%{transform:translateX(0)}25%,75%{transform:translateX(-5px)}50%{transform:translateX(5px)}}
</style>
</head><body>
<canvas id="bg"></canvas>
<div class="wrap">
  <div class="glass">
    <div class="logo-ring"><span class="logo-icon">⚡</span></div>
    <div class="brand">AC Auth <em>Backend</em></div>
    <div class="sub">Made by Lunar3HP</div>
    ${req.query.err ? '<div class="err">Invalid credentials. Try again.</div>' : ''}
    <form method="POST" action="/do-login">
      <div class="field"><input type="text" name="username" placeholder="Username" autocomplete="off" required></div>
      <div class="field"><input type="password" name="password" placeholder="Password" required></div>
      <button class="btn-login" type="submit">Sign In →</button>
    </form>
  </div>
</div>
<script>
(function(){
  const canvas = document.getElementById('bg');
  const ctx = canvas.getContext('2d');
  let W, H, t = 0;
  let mx = -1, my = -1, smx = 0, smy = 0;

  function resize(){ W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  resize(); window.addEventListener('resize', resize);
  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

  // Aurora nodes
  const nodes = Array.from({length: 6}, (_, i) => ({
    x: Math.random(), y: Math.random(),
    vx: (Math.random()-0.5)*0.0003, vy: (Math.random()-0.5)*0.0003,
    r: 280 + Math.random()*180,
    h: [190,210,220,200,180,215][i],
  }));

  function draw(){
    ctx.clearRect(0,0,W,H);
    // Dark base
    ctx.fillStyle = '#020409';
    ctx.fillRect(0,0,W,H);

    if(mx >= 0){ smx += (mx - smx)*0.04; smy += (my - smy)*0.04; }
    else { smx = W/2; smy = H/2; }

    // Update nodes
    nodes.forEach(n => {
      n.x += n.vx + Math.sin(t*0.007 + n.h)*0.0001;
      n.y += n.vy + Math.cos(t*0.009 + n.h)*0.0001;
      if(n.x < 0||n.x > 1) n.vx *= -1;
      if(n.y < 0||n.y > 1) n.vy *= -1;
    });

    // Mouse influence node
    const mnx = smx/W, mny = smy/H;

    // Draw aurora blobs
    nodes.forEach(n => {
      const dx = mnx - n.x, dy = mny - n.y;
      const dist = Math.sqrt(dx*dx+dy*dy);
      const pull = Math.max(0, 1 - dist/0.6);
      const nx = n.x + dx*pull*0.18;
      const ny = n.y + dy*pull*0.18;

      const grd = ctx.createRadialGradient(nx*W, ny*H, 0, nx*W, ny*H, n.r*(1+pull*0.3));
      grd.addColorStop(0, \`hsla(\${n.h},100%,60%,0.07)\`);
      grd.addColorStop(0.5, \`hsla(\${n.h+15},90%,50%,0.03)\`);
      grd.addColorStop(1, 'transparent');
      ctx.fillStyle = grd;
      ctx.fillRect(0,0,W,H);
    });

    // Grid lines
    ctx.save();
    const gs = 60;
    const ox = (smx*0.02) % gs;
    const oy = (smy*0.02) % gs;
    ctx.strokeStyle = 'rgba(0,180,255,0.03)';
    ctx.lineWidth = 0.5;
    for(let x = -gs+ox; x < W+gs; x+=gs){
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke();
    }
    for(let y = -gs+oy; y < H+gs; y+=gs){
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
    }
    ctx.restore();

    // Floating particles
    for(let i=0; i<40; i++){
      const px = ((i*137.5 + t*0.08*(i%3===0?1:-1)) % W + W) % W;
      const py = ((i*97.3 + t*0.05) % H + H) % H;
      const a = 0.15 + 0.1*Math.sin(t*0.02+i);
      ctx.beginPath();
      ctx.arc(px, py, 1, 0, Math.PI*2);
      ctx.fillStyle = \`rgba(\${i%2?0:30},\${150+i%80},255,\${a})\`;
      ctx.fill();
    }

    t++;
    requestAnimationFrame(draw);
  }
  draw();
})();
</script>
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

// ── Dashboard ──────────────────────────────────────────────────────────────────
function escHtml(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}

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
    const pct = (v, max) => Math.min(100, v/max*100).toFixed(1);
    return `
<div class="card ${expired ? 'card-dead' : 'card-alive'}" id="card-${s.id}">
  <div class="card-header">
    <div class="status-badge ${expired ? 'dead' : 'alive'}">${expired ? 'EXPIRED' : 'ACTIVE'}</div>
    <span class="session-name">${escHtml(s.name || s.id)}</span>
    <div class="hdr-actions">
      <button class="icon-btn" onclick="copyText('${s.id}')" title="Copy ID">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        ID
      </button>
      <button class="icon-btn" onclick="copyText('${connUrl}')" title="Copy URL">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        URL
      </button>
    </div>
  </div>

  <div class="meta-grid">
    <span class="meta-k">ID</span><code class="meta-v hideable">${s.id}</code>
    <span class="meta-k">Endpoint</span><code class="meta-v hideable" style="font-size:9px">${connUrl}</code>
    <span class="meta-k">Connections</span><span class="meta-v conns">${s.connections || 0}</span>
  </div>

  <div class="timers">
    <div class="timer-block">
      <div class="timer-label">Token</div>
      <div class="timer-val ${tokenSecs < 300 ? 'warn' : ''}" id="tk-${s.id}" data-secs="${tokenSecs}" data-max="3600">${timeLeft(s.token)}</div>
      <div class="tbar"><div class="tfill ${tokenSecs < 300 ? 'warn' : ''}" id="tb-${s.id}" style="width:${pct(tokenSecs,3600)}%"></div></div>
    </div>
    <div class="timer-block">
      <div class="timer-label">Refresh</div>
      <div class="timer-val" id="rk-${s.id}" data-secs="${refreshSecs}" data-max="21600">${timeLeft(s.refresh_token)}</div>
      <div class="tbar"><div class="tfill" id="rb-${s.id}" style="width:${pct(refreshSecs,21600)}%"></div></div>
    </div>
  </div>

  <div class="token-section">
    <div class="tok-row">
      <span class="tok-lbl">Token</span>
      <div class="tok-box hideable">${escHtml(s.token||"—")}</div>
    </div>
    <div class="tok-row">
      <span class="tok-lbl">Refresh</span>
      <div class="tok-box hideable">${escHtml(s.refresh_token||"—")}</div>
    </div>
  </div>

  <div class="card-footer">
    <div class="update-block">
      <form method="POST" action="/session/${s.id}/update">
        <input type="hidden" name="_from" value="ui">
        <textarea name="token" placeholder="Paste new token…" rows="2">${escHtml(s.token||"")}</textarea>
        <textarea name="refresh_token" placeholder="Paste new refresh token…" rows="2">${escHtml(s.refresh_token||"")}</textarea>
        <button type="submit" class="btn btn-teal btn-sm">↑ Update Tokens</button>
      </form>
    </div>
    <div class="footer-actions">
      <form method="POST" action="/session/${s.id}/refresh" style="display:inline">
        <button type="submit" class="btn btn-amber btn-sm">⟳ Refresh</button>
      </form>
      <form method="POST" action="/session/${s.id}/rename" class="rename-wrap" style="display:inline-flex;gap:6px;align-items:center">
        <input name="name" placeholder="Rename…" class="rename-input">
        <button type="submit" class="btn btn-ghost btn-sm">→</button>
      </form>
      <form method="POST" action="/session/${s.id}/delete" style="display:inline" onsubmit="return confirm('Delete session: ${escHtml(s.name||s.id)}?')">
        <button type="submit" class="btn btn-danger btn-sm">✕ Delete</button>
      </form>
    </div>
  </div>
</div>`;
  }).join("\n");

  res.send(`<!DOCTYPE html>
<html><head>
<title>AC Auth Backend</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --c0:#020409;--c1:#060d1a;--c2:#090f1f;--c3:#0c1428;
  --teal:#00d2ff;--teal2:#0099dd;--teal-dim:rgba(0,210,255,0.12);--teal-glow:rgba(0,210,255,0.06);
  --blue:#0066ff;--blue-dim:rgba(0,100,255,0.15);
  --amber:#ffaa00;--danger:#ff3b30;--green:#00e676;
  --border:rgba(0,210,255,0.08);--border-hi:rgba(0,210,255,0.22);
  --text:#d0e8ff;--muted:rgba(100,160,220,0.45);--mono:'JetBrains Mono',monospace;
}
html,body{min-height:100%;background:var(--c0)}
body{font-family:'Inter',sans-serif;color:var(--text);position:relative}

/* BG Canvas */
#bgCanvas{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:0}

/* Layout */
.page{position:relative;z-index:1;max-width:1000px;margin:0 auto;padding:0 0 80px}

/* Header */
.hdr{display:flex;align-items:center;gap:16px;padding:20px 28px;border-bottom:1px solid var(--border);background:rgba(2,4,9,0.6);backdrop-filter:blur(12px);position:sticky;top:0;z-index:100}
.hdr-logo{width:36px;height:36px;background:linear-gradient(135deg,var(--teal),var(--blue));border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;box-shadow:0 0 20px rgba(0,150,255,0.3)}
.hdr-title{font-size:17px;font-weight:900;color:#fff;letter-spacing:-0.3px}
.hdr-title em{font-style:normal;color:var(--teal)}
.hdr-badge{font-size:9px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--teal);background:var(--teal-glow);border:1px solid var(--teal-dim);border-radius:100px;padding:3px 12px;margin-left:4px}
.hdr-right{margin-left:auto;display:flex;align-items:center;gap:10px}
.clock-pill{font-size:11px;color:var(--muted);background:var(--c2);border:1px solid var(--border);border-radius:8px;padding:6px 12px;font-variant-numeric:tabular-nums;font-family:var(--mono)}

/* Stats */
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:24px 28px 0}
.stat{background:linear-gradient(135deg,rgba(0,210,255,0.04),rgba(0,100,255,0.02));border:1px solid var(--border);border-radius:16px;padding:18px 20px;position:relative;overflow:hidden;transition:border-color .2s,box-shadow .2s}
.stat::after{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--teal),transparent);opacity:0.4}
.stat:hover{border-color:var(--border-hi);box-shadow:0 0 30px rgba(0,210,255,0.06)}
.stat-lbl{font-size:10px;text-transform:uppercase;letter-spacing:2px;color:var(--muted);font-weight:700;margin-bottom:8px}
.stat-val{font-size:32px;font-weight:900;background:linear-gradient(135deg,#00d2ff,#5599ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1;font-variant-numeric:tabular-nums}

/* Toolbar */
.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:16px 28px}
.search{background:var(--c2);color:var(--text);border:1px solid var(--border);padding:10px 16px;font-family:'Inter',sans-serif;font-size:12px;width:240px;border-radius:12px;outline:none;transition:all .2s}
.search:focus{border-color:var(--border-hi);background:var(--c3);box-shadow:0 0 0 3px var(--teal-glow)}
.search::placeholder{color:var(--muted)}

/* Buttons */
.btn{border:none;padding:9px 16px;cursor:pointer;font-weight:600;font-size:12px;border-radius:10px;font-family:'Inter',sans-serif;transition:all .15s;letter-spacing:0.2px;white-space:nowrap}
.btn:hover{transform:translateY(-1px)}
.btn:active{transform:translateY(0)}
.btn-sm{padding:7px 12px;font-size:11px;border-radius:8px}
.btn-teal{background:linear-gradient(135deg,var(--teal),var(--blue));color:#000;font-weight:700;box-shadow:0 4px 16px rgba(0,150,255,0.25)}
.btn-teal:hover{box-shadow:0 6px 24px rgba(0,150,255,0.4)}
.btn-amber{background:linear-gradient(135deg,#ffaa00,#ff7700);color:#000;font-weight:700}
.btn-danger{background:linear-gradient(135deg,#ff3b30,#cc2020);color:#fff}
.btn-ghost{background:var(--c2);color:var(--teal);border:1px solid var(--border-hi)}
.btn-ghost:hover{background:var(--teal-dim)}
.btn-ghost.on{background:var(--teal-dim);color:#fff}
.btn-blue-out{background:transparent;color:var(--teal);border:1px solid var(--border-hi)}
.btn-blue-out:hover{background:var(--teal-glow)}

/* Create panel */
.create-panel{margin:0 28px 12px;background:rgba(0,20,50,0.5);border:1px solid var(--border-hi);border-radius:16px;padding:22px;display:none;backdrop-filter:blur(8px)}
.create-panel label{display:block;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:5px}
.create-panel input,.create-panel textarea{background:var(--c3);color:#fff;border:1px solid var(--border);padding:9px 12px;font-family:var(--mono);font-size:11px;width:100%;margin-bottom:12px;border-radius:9px;outline:none;resize:vertical;transition:border-color .2s}
.create-panel input:focus,.create-panel textarea:focus{border-color:var(--border-hi)}

/* Cards */
#cards{padding:0 28px;display:flex;flex-direction:column;gap:12px}
.card{background:rgba(6,13,26,0.7);border:1px solid var(--border);border-radius:18px;padding:20px 22px;backdrop-filter:blur(8px);transition:all .25s;position:relative;overflow:hidden}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;opacity:0}
.card-alive::before{background:linear-gradient(90deg,transparent,var(--teal),transparent);opacity:0.5}
.card-dead::before{background:linear-gradient(90deg,transparent,var(--danger),transparent);opacity:0.4}
.card:hover{border-color:rgba(0,210,255,0.18);box-shadow:0 8px 40px rgba(0,0,0,0.4),0 0 30px rgba(0,210,255,0.04)}

.card-header{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.status-badge{font-size:8px;font-weight:800;letter-spacing:2px;padding:3px 9px;border-radius:100px;flex-shrink:0}
.status-badge.alive{background:rgba(0,210,255,0.12);color:var(--teal);border:1px solid rgba(0,210,255,0.25)}
.status-badge.dead{background:rgba(255,59,48,0.1);color:var(--danger);border:1px solid rgba(255,59,48,0.2)}
.session-name{flex:1;font-size:15px;font-weight:800;color:#fff}
.hdr-actions{display:flex;gap:5px}
.icon-btn{background:var(--c3);color:var(--teal);border:1px solid var(--border);padding:5px 9px;border-radius:7px;font-size:10px;font-family:'Inter',sans-serif;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;transition:all .15s}
.icon-btn:hover{border-color:var(--border-hi);background:var(--teal-dim)}

.meta-grid{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin-bottom:14px;font-size:10px;line-height:2.1}
.meta-k{color:var(--muted);font-weight:600;letter-spacing:0.5px;text-transform:uppercase;white-space:nowrap}
.meta-v{color:var(--text);font-family:var(--mono);word-break:break-all}
.conns{color:var(--teal);font-weight:700;font-size:12px}

/* Timers */
.timers{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
.timer-block{background:rgba(0,0,0,0.25);border:1px solid var(--border);border-radius:12px;padding:12px 14px}
.timer-label{font-size:9px;text-transform:uppercase;letter-spacing:2px;color:var(--muted);font-weight:700;margin-bottom:6px}
.timer-val{font-size:22px;font-weight:800;color:var(--teal);font-variant-numeric:tabular-nums;line-height:1;margin-bottom:8px;font-family:var(--mono)}
.timer-val.warn{color:var(--amber)}
.tbar{height:3px;background:rgba(255,255,255,0.05);border-radius:2px}
.tfill{height:3px;border-radius:2px;transition:width 1s linear;background:linear-gradient(90deg,#0066ff,#00d2ff)}
.tfill.warn{background:linear-gradient(90deg,#ff7700,#ffaa00)}

/* Tokens */
.token-section{margin-bottom:14px}
.tok-row{display:flex;align-items:flex-start;gap:8px;margin-bottom:6px}
.tok-lbl{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);white-space:nowrap;padding-top:4px;min-width:54px}
.tok-box{flex:1;background:rgba(0,0,0,0.3);border:1px solid var(--border);padding:6px 10px;font-size:9px;word-break:break-all;color:rgba(0,210,255,0.25);border-radius:8px;font-family:var(--mono);line-height:1.5;transition:all .3s}
.tok-box.blur-tok,.hideable.blur-tok{filter:blur(5px);user-select:none}

/* Card footer */
.card-footer{border-top:1px solid var(--border);padding-top:14px;display:flex;flex-direction:column;gap:10px}
.update-block{background:rgba(0,0,0,0.2);border:1px solid var(--border);border-radius:10px;padding:12px}
.update-block textarea{background:var(--c3);color:#cde;border:1px solid var(--border);padding:7px 10px;font-family:var(--mono);font-size:9px;width:100%;margin-bottom:6px;border-radius:7px;resize:vertical;outline:none;transition:border-color .2s}
.update-block textarea:focus{border-color:var(--border-hi)}
.footer-actions{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.rename-wrap{display:inline-flex;gap:5px;align-items:center}
.rename-input{background:var(--c3);color:#fff;border:1px solid var(--border);padding:7px 10px;border-radius:8px;font-family:'Inter',sans-serif;font-size:11px;outline:none;width:120px;transition:border-color .2s}
.rename-input:focus{border-color:var(--border-hi)}

/* Toast */
.toast{position:fixed;bottom:28px;right:28px;background:rgba(0,210,255,0.12);border:1px solid rgba(0,210,255,0.3);color:var(--teal);padding:10px 18px;border-radius:12px;font-size:12px;font-weight:600;z-index:999;opacity:0;transform:translateY(8px);transition:all .25s;pointer-events:none;backdrop-filter:blur(8px)}
.toast.show{opacity:1;transform:translateY(0)}
</style>
</head><body>
<canvas id="bgCanvas"></canvas>
<div class="page">

<div class="hdr">
  <div class="hdr-logo">⚡</div>
  <div>
    <div class="hdr-title">AC Auth <em>Backend</em></div>
  </div>
  <span class="hdr-badge">✦ Lunar3HP ✦</span>
  <div class="hdr-right">
    <span class="clock-pill" id="clock"></span>
    <form method="POST" action="/logout" style="display:inline">
      <button type="submit" class="btn btn-ghost btn-sm">Sign Out</button>
    </form>
  </div>
</div>

<div class="stats">
  <div class="stat"><div class="stat-lbl">Sessions</div><div class="stat-val">${total}</div></div>
  <div class="stat"><div class="stat-lbl">Active</div><div class="stat-val">${active}</div></div>
  <div class="stat"><div class="stat-lbl">Connections</div><div class="stat-val">${totalConns}</div></div>
</div>

<div class="toolbar">
  <input class="search" type="text" placeholder="⌕  Search sessions…" oninput="filterCards(this.value)">
  <button class="btn btn-teal" onclick="toggleCreate()">+ New Session</button>
  <form method="POST" action="/refresh-all" style="display:inline">
    <button type="submit" class="btn btn-amber">⟳ Refresh All</button>
  </form>
  <form method="POST" action="/clean-duplicates" style="display:inline">
    <button type="submit" class="btn btn-blue-out">🧹 Clean Dupes</button>
  </form>
  <button id="blurToggle" class="btn btn-ghost" onclick="toggleBlur()">🔒 Hide Tokens</button>
</div>

<div id="create-panel" class="create-panel">
  <form method="POST" action="/session/create">
    <label>Name (optional)</label>
    <input name="name" placeholder="e.g. MyAccount">
    <label>Token</label>
    <textarea name="token" rows="2" placeholder="Paste token…"></textarea>
    <label>Refresh Token</label>
    <textarea name="refresh_token" rows="2" placeholder="Paste refresh token…"></textarea>
    <button type="submit" class="btn btn-teal">Create Session</button>
  </form>
</div>

<div id="cards">${cards}</div>

</div>
<div class="toast" id="toast">Copied!</div>

<script>
let blurred = false;

function toggleBlur(){
  blurred = !blurred;
  document.querySelectorAll('.tok-box, .hideable').forEach(el => el.classList.toggle('blur-tok', blurred));
  document.querySelectorAll('.update-block textarea').forEach(el => { el.style.filter = blurred ? 'blur(5px)' : ''; el.style.userSelect = blurred ? 'none' : ''; });
  const btn = document.getElementById('blurToggle');
  btn.textContent = blurred ? '🔓 Show Tokens' : '🔒 Hide Tokens';
  btn.classList.toggle('on', blurred);
}

function copyText(t){
  navigator.clipboard.writeText(t);
  const toast = document.getElementById('toast');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

function filterCards(q){
  const lq = q.toLowerCase();
  document.querySelectorAll('.card').forEach(c => { c.style.display = c.innerText.toLowerCase().includes(lq) ? '' : 'none'; });
}

function toggleCreate(){
  const p = document.getElementById('create-panel');
  p.style.display = (p.style.display === 'block') ? 'none' : 'block';
}

function fmtSecs(s){
  if(s<=0) return 'EXPIRED';
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
  if(h>0) return h+'h '+m+'m';
  return String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
}

setInterval(() => {
  document.querySelectorAll('.timer-val').forEach(el => {
    let s = parseInt(el.dataset.secs);
    if(s > 0){ s--; el.dataset.secs = s; }
    el.textContent = fmtSecs(s);
    const max = parseInt(el.dataset.max) || 3600;
    const barId = el.id.replace('tk-','tb-').replace('rk-','rb-');
    const bar = document.getElementById(barId);
    if(bar) bar.style.width = Math.max(0, Math.min(100, s/max*100)).toFixed(1)+'%';
    if(s < 300 && el.id.startsWith('tk-')){ el.classList.add('warn'); if(bar) bar.classList.add('warn'); }
  });
}, 1000);

(function tick(){ document.getElementById('clock').textContent = new Date().toLocaleTimeString(); setTimeout(tick, 1000); })();

// ── Reactive aurora background ──────────────────────────────────────────────
(function(){
  const canvas = document.getElementById('bgCanvas');
  const ctx = canvas.getContext('2d');
  let W, H, t = 0;
  let mx = -1, my = -1, smx, smy;

  function resize(){ W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; if(smx===undefined){smx=W/2;smy=H/2;} }
  resize(); window.addEventListener('resize', resize);
  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

  const nodes = [
    {bx:0.15,by:0.2,h:195,r:380},{bx:0.8,by:0.1,h:215,r:320},
    {bx:0.5,by:0.5,h:205,r:350},{bx:0.1,by:0.75,h:185,r:280},
    {bx:0.85,by:0.8,h:220,r:300},{bx:0.45,by:0.15,h:200,r:260},
  ];

  function draw(){
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#020409'; ctx.fillRect(0,0,W,H);

    if(mx >= 0){ smx += (mx-smx)*0.05; smy += (my-smy)*0.05; }
    else { smx = W/2; smy = H*0.35; }

    nodes.forEach((n,i) => {
      // Breathe position
      const nx = (n.bx + Math.sin(t*0.004+i*1.3)*0.08) * W;
      const ny = (n.by + Math.cos(t*0.005+i*0.9)*0.06) * H;

      // Mouse pull
      const dx = smx - nx, dy = smy - ny;
      const dist = Math.sqrt(dx*dx+dy*dy);
      const pull = Math.max(0, 1 - dist/(W*0.6));
      const fx = nx + dx*pull*0.12;
      const fy = ny + dy*pull*0.12;

      const radius = n.r * (1 + pull*0.25) * (1 + 0.05*Math.sin(t*0.008+i));

      const g = ctx.createRadialGradient(fx,fy,0,fx,fy,radius);
      const a1 = 0.055 + pull*0.025;
      const a2 = 0.022 + pull*0.01;
      g.addColorStop(0, \`hsla(\${n.h},100%,60%,\${a1})\`);
      g.addColorStop(0.45, \`hsla(\${n.h+20},90%,55%,\${a2})\`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(0,0,W,H);
    });

    // Subtle grid
    const gs = 64;
    ctx.strokeStyle = 'rgba(0,200,255,0.025)'; ctx.lineWidth = 0.5;
    const gox = (smx*0.015)%gs, goy = (smy*0.015)%gs;
    for(let x=-gs+gox; x<W+gs; x+=gs){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for(let y=-gs+goy; y<H+gs; y+=gs){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

    // Scan line shimmer
    const scanY = ((t*0.8) % (H+100)) - 50;
    const sg = ctx.createLinearGradient(0, scanY-30, 0, scanY+30);
    sg.addColorStop(0,'transparent'); sg.addColorStop(0.5,'rgba(0,210,255,0.02)'); sg.addColorStop(1,'transparent');
    ctx.fillStyle=sg; ctx.fillRect(0,scanY-30,W,60);

    // Particles
    for(let i=0; i<50; i++){
      const px = ((i*137.5 + t*(i%2?0.12:0.08)) % W + W) % W;
      const py = ((i*73.1  + t*(i%3?0.06:0.09)) % H + H) % H;
      const a = 0.08 + 0.07*Math.sin(t*0.03+i*0.7);
      const sz = i%7===0 ? 1.5 : 0.8;
      ctx.beginPath(); ctx.arc(px,py,sz,0,Math.PI*2);
      ctx.fillStyle=\`rgba(\${i%3===0?0:20},\${130+i%100},255,\${a})\`;
      ctx.fill();
    }

    t++; requestAnimationFrame(draw);
  }
  draw();
})();
</script>
</body></html>`);
});

// ── Session CRUD ───────────────────────────────────────────────────────────────
app.post("/session/create",(req,res)=>{
  const id=crypto.randomBytes(8).toString("hex");
  const{name,token,refresh_token}=req.body;
  sessions[id]={id,name:name||id,token:token?.trim()||"",refresh_token:refresh_token?.trim()||"",connections:0};
  saveSessions(); res.redirect("/");
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
  s.name=req.body.name?.trim()||s.name; saveSessions(); res.redirect("/");
});
app.post("/session/:id/refresh",async(req,res)=>{
  const s=sessions[req.params.id];
  if(!s)return res.status(404).json({error:"Not found"});
  await tryRefresh(s); res.redirect("/");
});
app.post("/session/:id/delete",(req,res)=>{
  delete sessions[req.params.id]; saveSessions(); res.redirect("/");
});
app.post("/refresh-all",async(req,res)=>{
  for(const s of Object.values(sessions))await tryRefresh(s); res.redirect("/");
});
app.post("/clean-duplicates",(req,res)=>{
  const seen=new Map();
  for(const[id,s]of Object.entries(sessions)){
    const key=s.refresh_token||id;
    if(seen.has(key)){delete sessions[id];console.log(`[Clean] Removed duplicate ${id}`);}
    else seen.set(key,id);
  }
  saveSessions(); res.redirect("/");
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
