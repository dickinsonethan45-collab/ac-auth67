const express = require("express");
const fs = require("fs");
const crypto = require("crypto");
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    { ep: "/v2/account/session/refresh", auth: "Basic " + Buffer.from(`${SERVER_KEY}:`).toString("base64"), body: JSON.stringify({ token: tok, vars: { authID: "9d5dca5eb2674de2a2204e31f1f7a1f8", clientUserAgent: "SteamFrame 1.67.3.2345_6f43a8db", deviceID: "a8319933d25f331503835aa71ec12f55", loginType: "1234", idType: "1234" } }) },
    { ep: "/v2/session/refresh", auth: "Bearer " + tok, body: JSON.stringify({ token: tok }) },
  ];
  console.log(`[Refresh:${session.name||session.id}] Attempting refresh...`);
  for (const { ep, auth, body } of attempts) {
    try {
      const r = await fetch(`${NAKAMA_SERVER}${ep}`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": auth, "User-Agent": "UnityPlayer/6000.3.12f1 (UnityWebRequest/1.0, libcurl/8.10.1-DEV)", "x-unity-version": "6000.3.12f1" }, body });
      const text = await r.text();
      console.log(`[Refresh:${session.name||session.id}] ${ep} → ${r.status}`);
      if (r.status === 200) {
        const data = JSON.parse(text);
        session.token = data.token; session.refresh_token = data.refresh_token; session.lastRefresh = Date.now();
        saveSessions();
        console.log(`[Refresh:${session.name||session.id}] ✓ Success via ${ep}`);
        return { success: true, endpoint: ep };
      } else {
        console.log(`[Refresh:${session.name||session.id}] ✗ ${ep} returned ${r.status}: ${text.slice(0,120)}`);
      }
    } catch (e) { console.log(`[Refresh:${session.name||session.id}] ${ep} error: ${e.message}`); }
  }
  console.log(`[Refresh:${session.name||session.id}] ✗ All attempts failed`);
  return { success: false };
}

(async () => {
  loadSessions();
  for (const s of Object.values(sessions)) {
    if (s.refresh_token && isExpired(s.token)) await tryRefresh(s);
  }
})();

let refreshing = false;
setInterval(async () => {
  if (refreshing) return;
  refreshing = true;
  try {
    const threshold = Math.floor(Date.now() / 1000) + 60;
    for (const s of Object.values(sessions)) {
      if (!s.refresh_token) continue;
      if (!s.token || getExp(s.token) < threshold) await tryRefresh(s);
    }
  } finally {
    refreshing = false;
  }
}, 30 * 1000);

function escHtml(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}

const BG_SCRIPT = `
<script>
(function(){
  const c = document.getElementById('bg');
  const x = c.getContext('2d');
  let W,H,t=0,mx=-1,my=-1,smx,smy;
  function resize(){W=c.width=window.innerWidth;H=c.height=window.innerHeight;if(smx==null){smx=W/2;smy=H/2;}}
  resize(); window.addEventListener('resize',resize);
  document.addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY;});

  // Stars
  const stars=Array.from({length:120},()=>({
    x:Math.random(),y:Math.random(),
    s:Math.random()*1.4+0.3,
    sp:Math.random()*0.0004+0.0001,
    o:Math.random()*0.6+0.2,
    flicker:Math.random()*Math.PI*2
  }));

  // Nebula blobs
  const blobs=[
    {bx:.15,by:.25,h:260,r:420,spd:.0011},
    {bx:.75,by:.15,h:290,r:360,spd:.0008},
    {bx:.5 ,by:.6 ,h:200,r:400,spd:.0013},
    {bx:.1 ,by:.8 ,h:320,r:300,spd:.0009},
    {bx:.85,by:.7 ,h:240,r:340,spd:.0007},
    {bx:.6 ,by:.05,h:280,r:280,spd:.0012},
  ];

  // Shooting stars
  const shoots=[];
  function spawnShoot(){
    if(shoots.length>4)return;
    shoots.push({x:Math.random()*W,y:Math.random()*H*.4,vx:4+Math.random()*6,vy:2+Math.random()*4,life:1,maxLife:60+Math.random()*40});
  }
  setInterval(spawnShoot,2200);

  function draw(){
    x.clearRect(0,0,W,H);

    // Deep space base
    const bg=x.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,'#00000f');
    bg.addColorStop(0.4,'#05001a');
    bg.addColorStop(1,'#000008');
    x.fillStyle=bg; x.fillRect(0,0,W,H);

    if(mx>=0){smx+=(mx-smx)*.05;smy+=(my-smy)*.05;}
    else{smx=W/2;smy=H/2;}

    // Nebula
    blobs.forEach((b,i)=>{
      const nx=(b.bx+Math.sin(t*b.spd+i)*0.09)*W;
      const ny=(b.by+Math.cos(t*b.spd*1.3+i)*0.07)*H;
      const dx=smx-nx,dy=smy-ny;
      const dist=Math.sqrt(dx*dx+dy*dy);
      const pull=Math.max(0,1-dist/(W*.55));
      const fx=nx+dx*pull*.14, fy=ny+dy*pull*.14;
      const rad=b.r*(1+pull*.2)*(1+.04*Math.sin(t*b.spd*2+i));
      const g=x.createRadialGradient(fx,fy,0,fx,fy,rad);
      const a=.055+pull*.02;
      g.addColorStop(0,\`hsla(\${b.h},100%,55%,\${a})\`);
      g.addColorStop(.5,\`hsla(\${b.h+30},80%,45%,\${a*.4})\`);
      g.addColorStop(1,'transparent');
      x.fillStyle=g; x.fillRect(0,0,W,H);
    });

    // Stars
    stars.forEach(s=>{
      const px=((s.x*W+(t*s.sp*W))%W+W)%W;
      const py=s.y*H;
      const flicker=s.o*(0.7+0.3*Math.sin(t*.05+s.flicker));
      const pull=Math.max(0,1-Math.sqrt((smx-px)**2+(smy-py)**2)/250);
      x.beginPath();
      x.arc(px,py,s.s*(1+pull*.8),0,Math.PI*2);
      x.fillStyle=\`rgba(255,255,255,\${flicker+pull*.4})\`;
      x.fill();
      if(s.s>1&&Math.sin(t*.03+s.flicker)>.7){
        x.beginPath();x.arc(px,py,s.s*2.5,0,Math.PI*2);
        x.fillStyle=\`rgba(180,160,255,\${flicker*.3})\`;x.fill();
      }
    });

    // Shooting stars
    for(let i=shoots.length-1;i>=0;i--){
      const s=shoots[i];
      s.x+=s.vx; s.y+=s.vy; s.life--;
      if(s.life<=0){shoots.splice(i,1);continue;}
      const alpha=s.life/s.maxLife;
      const len=18+s.vx*3;
      const g=x.createLinearGradient(s.x-s.vx*len,s.y-s.vy*len,s.x,s.y);
      g.addColorStop(0,'transparent');
      g.addColorStop(1,\`rgba(255,255,255,\${alpha})\`);
      x.strokeStyle=g; x.lineWidth=1.5;
      x.beginPath(); x.moveTo(s.x-s.vx*len,s.y-s.vy*len); x.lineTo(s.x,s.y); x.stroke();
    }

    t++; requestAnimationFrame(draw);
  }
  draw();
})();
<\/script>`;

// ── LOGIN ──────────────────────────────────────────────────────────────────────
app.get("/login", (req, res) => {
  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>AC Auth</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden;font-family:'Inter',sans-serif;background:#00000f}
#bg{position:fixed;inset:0;z-index:0}
.center{position:relative;z-index:2;min-height:100vh;display:flex;align-items:center;justify-content:center}
.box{width:380px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:28px;padding:52px 44px;backdrop-filter:blur(30px);box-shadow:0 0 0 1px rgba(255,255,255,0.03),0 40px 100px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,255,255,0.06)}
.icon{width:64px;height:64px;margin:0 auto 24px;background:linear-gradient(135deg,#a855f7,#ec4899,#f97316);border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:28px;box-shadow:0 0 40px rgba(168,85,247,0.4),0 8px 32px rgba(0,0,0,0.5);animation:glow 3s ease-in-out infinite}
@keyframes glow{0%,100%{box-shadow:0 0 40px rgba(168,85,247,0.4),0 8px 32px rgba(0,0,0,0.5)}50%{box-shadow:0 0 60px rgba(168,85,247,0.7),0 0 80px rgba(236,72,153,0.3),0 8px 32px rgba(0,0,0,0.5)}}
h1{text-align:center;font-size:24px;font-weight:900;color:#fff;letter-spacing:-.5px;margin-bottom:4px}
h1 span{background:linear-gradient(90deg,#a855f7,#ec4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.sub{text-align:center;font-size:11px;color:rgba(255,255,255,0.25);letter-spacing:3px;text-transform:uppercase;margin-bottom:36px}
.field{margin-bottom:12px}
.field input{width:100%;background:rgba(255,255,255,0.05);color:#fff;border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:15px 18px;font-family:'Inter',sans-serif;font-size:14px;outline:none;transition:all .2s}
.field input::placeholder{color:rgba(255,255,255,0.2)}
.field input:focus{border-color:rgba(168,85,247,0.5);background:rgba(168,85,247,0.08);box-shadow:0 0 0 3px rgba(168,85,247,0.12)}
.btn{width:100%;margin-top:6px;padding:16px;background:linear-gradient(135deg,#a855f7,#ec4899);border:none;border-radius:14px;color:#fff;font-family:'Inter',sans-serif;font-size:15px;font-weight:700;cursor:pointer;letter-spacing:.3px;transition:all .2s;box-shadow:0 4px 24px rgba(168,85,247,0.4)}
.btn:hover{transform:translateY(-2px);box-shadow:0 8px 40px rgba(168,85,247,0.6)}
.btn:active{transform:none}
.err{background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:#f87171;font-size:12px;padding:11px 14px;border-radius:12px;margin-bottom:14px;text-align:center;animation:shake .35s}
@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
</style></head><body>
<canvas id="bg"></canvas>
<div class="center"><div class="box">
  <div class="icon">⚡</div>
  <h1>AC Auth <span>Backend</span></h1>
  <div class="sub">by Lunar3HP</div>
  ${req.query.err ? '<div class="err">Wrong credentials. Try again.</div>' : ''}
  <form method="POST" action="/do-login">
    <div class="field"><input name="username" placeholder="Username" autocomplete="off" required></div>
    <div class="field"><input type="password" name="password" placeholder="Password" required></div>
    <button class="btn" type="submit">Sign In</button>
  </form>
</div></div>
${BG_SCRIPT}
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

// ── DASHBOARD ──────────────────────────────────────────────────────────────────
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
    const pct = (v, m) => Math.min(100, v/m*100).toFixed(1);
    return `
<div class="card" id="card-${s.id}">
  <div class="card-stripe ${expired?'stripe-dead':'stripe-live'}"></div>
  <div class="card-inner">
    <div class="card-top">
      <div class="pill ${expired?'pill-dead':'pill-live'}">${expired?'EXPIRED':'ACTIVE'}</div>
      <div class="card-name">${escHtml(s.name||s.id)}</div>
      <div class="card-btns">
        <button class="cbtn" onclick="copy('${s.id}','ID copied')">ID</button>
        <button class="cbtn" onclick="copy('${connUrl}','URL copied')">URL</button>
      </div>
    </div>

    <div class="info-grid">
      <div class="ig-row"><span class="ig-k">ID</span><code class="ig-v hideable">${s.id}</code></div>
      <div class="ig-row"><span class="ig-k">Connections</span><span class="ig-v hi">${s.connections||0}</span></div>
      <div class="ig-row"><span class="ig-k">Endpoint</span><code class="ig-v hideable" style="font-size:9px">${connUrl}</code></div>
    </div>

    <div class="timers">
      <div class="tblock">
        <div class="tlbl">Token expires</div>
        <div class="tval ${tokenSecs<300?'twarn':''}" id="tk-${s.id}" data-exp="${tokenExp}" data-max="3600">${timeLeft(s.token)}</div>
        <div class="tbar"><div class="tfill ${tokenSecs<300?'twarn':''}" id="tb-${s.id}" style="width:${pct(tokenSecs,3600)}%"></div></div>
      </div>
      <div class="tblock">
        <div class="tlbl">Refresh expires</div>
        <div class="tval" id="rk-${s.id}" data-exp="${refreshExp}" data-max="21600">${timeLeft(s.refresh_token)}</div>
        <div class="tbar"><div class="tfill" id="rb-${s.id}" style="width:${pct(refreshSecs,21600)}%"></div></div>
      </div>
    </div>

    <div class="tok-grid">
      <div class="tok-row"><span class="tok-k">Token</span><div class="tok-v hideable">${escHtml(s.token||'—')}</div></div>
      <div class="tok-row"><span class="tok-k">Refresh</span><div class="tok-v hideable">${escHtml(s.refresh_token||'—')}</div></div>
    </div>

    <div class="card-foot">
      <div class="upd-block">
        <form method="POST" action="/session/${s.id}/update">
          <input type="hidden" name="_from" value="ui">
          <textarea name="token" placeholder="New token…" rows="2">${escHtml(s.token||'')}</textarea>
          <textarea name="refresh_token" placeholder="New refresh token…" rows="2">${escHtml(s.refresh_token||'')}</textarea>
          <button type="submit" class="abtn abtn-purple">↑ Update</button>
        </form>
      </div>
      <div class="foot-row">
        <form method="POST" action="/session/${s.id}/refresh" style="display:inline">
          <button type="submit" class="abtn abtn-orange">⟳ Refresh</button>
        </form>
        <form method="POST" action="/session/${s.id}/rename" style="display:inline-flex;gap:5px;align-items:center">
          <input class="rinput" name="name" placeholder="Rename…">
          <button type="submit" class="abtn abtn-ghost">→</button>
        </form>
        <form method="POST" action="/session/${s.id}/delete" style="display:inline" onsubmit="return confirm('Delete ${escHtml(s.name||s.id)}?')">
          <button type="submit" class="abtn abtn-red">✕</button>
        </form>
      </div>
    </div>
  </div>
</div>`;
  }).join('');

  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>AC Auth Backend</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --pp:#a855f7;--pk:#ec4899;--or:#f97316;
  --pp-dim:rgba(168,85,247,0.12);--pk-dim:rgba(236,72,153,0.1);
  --border:rgba(255,255,255,0.07);--border-hi:rgba(255,255,255,0.14);
  --bg0:#00000f;--bg1:rgba(255,255,255,0.025);--bg2:rgba(255,255,255,0.04);
  --text:#e8e0ff;--muted:rgba(200,180,255,0.35);--mono:'JetBrains Mono',monospace;
}
html,body{min-height:100%;background:var(--bg0);font-family:'Inter',sans-serif;color:var(--text)}
#bg{position:fixed;inset:0;z-index:0;pointer-events:none}
.page{position:relative;z-index:1;max-width:1020px;margin:0 auto;padding-bottom:80px}

/* Header */
.hdr{display:flex;align-items:center;gap:14px;padding:18px 28px;border-bottom:1px solid var(--border);background:rgba(0,0,10,0.55);backdrop-filter:blur(20px);position:sticky;top:0;z-index:100}
.hdr-logo{width:38px;height:38px;background:linear-gradient(135deg,var(--pp),var(--pk),var(--or));border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 0 24px rgba(168,85,247,0.5);animation:logopulse 4s ease-in-out infinite;flex-shrink:0}
@keyframes logopulse{0%,100%{box-shadow:0 0 24px rgba(168,85,247,0.5)}50%{box-shadow:0 0 40px rgba(168,85,247,0.8),0 0 60px rgba(236,72,153,0.3)}}
.hdr-name{font-size:18px;font-weight:900;color:#fff;letter-spacing:-.5px}
.hdr-name em{font-style:normal;background:linear-gradient(90deg,var(--pp),var(--pk));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.hdr-tag{font-size:9px;font-weight:700;letter-spacing:3px;text-transform:uppercase;background:var(--pp-dim);border:1px solid rgba(168,85,247,0.25);color:var(--pp);border-radius:100px;padding:3px 12px}
.made-by{display:flex;align-items:center;gap:7px;background:linear-gradient(135deg,rgba(168,85,247,0.15),rgba(236,72,153,0.1));border:1px solid rgba(168,85,247,0.35);border-radius:100px;padding:5px 14px 5px 10px;position:relative;overflow:hidden}
.made-by::before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(168,85,247,0.08),transparent);animation:shimmer 2.5s linear infinite}
@keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
.made-by-dot{width:6px;height:6px;border-radius:50%;background:linear-gradient(135deg,var(--pp),var(--pk));box-shadow:0 0 8px rgba(168,85,247,0.8);animation:dotpulse 2s ease-in-out infinite;flex-shrink:0}
@keyframes dotpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.7)}}
.made-by-text{font-size:11px;font-weight:800;letter-spacing:.5px;background:linear-gradient(90deg,#c084fc,#f472b6,#fb923c);-webkit-background-clip:text;-webkit-text-fill-color:transparent;white-space:nowrap}

.music-label{font-size:11px;font-weight:600;color:var(--muted)}
.hdr-nav{display:flex;gap:4px;background:rgba(0,0,0,0.3);border:1px solid var(--border);border-radius:12px;padding:4px}
.hnav-btn{font-size:11px;font-weight:700;padding:6px 14px;border-radius:8px;color:var(--muted);text-decoration:none;transition:all .15s;letter-spacing:.2px}
.hnav-btn:hover{color:var(--text);background:rgba(255,255,255,0.06)}
.hnav-active{background:linear-gradient(135deg,var(--pp),var(--pk))!important;color:#fff!important;box-shadow:0 2px 12px rgba(168,85,247,0.4)}
.hdr-r{margin-left:auto;display:flex;align-items:center;gap:10px}
.hdr-clock{font-size:12px;color:var(--muted);font-family:var(--mono);background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:6px 12px}

/* Stats */
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:24px 28px 0}
.stat{background:var(--bg1);border:1px solid var(--border);border-radius:18px;padding:20px 22px;position:relative;overflow:hidden;transition:border-color .2s,transform .2s}
.stat:hover{border-color:rgba(168,85,247,0.3);transform:translateY(-2px)}
.stat::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--pp),var(--pk),transparent);opacity:.5}
.stat-lbl{font-size:9px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:var(--muted);margin-bottom:10px}
.stat-val{font-size:36px;font-weight:900;background:linear-gradient(135deg,var(--pp),var(--pk));-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1;font-variant-numeric:tabular-nums}

/* Toolbar */
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:18px 28px}
.search{background:var(--bg2);color:var(--text);border:1px solid var(--border);padding:11px 16px;font-family:'Inter',sans-serif;font-size:12px;width:240px;border-radius:12px;outline:none;transition:all .2s}
.search:focus{border-color:rgba(168,85,247,0.45);box-shadow:0 0 0 3px rgba(168,85,247,0.1)}
.search::placeholder{color:var(--muted)}

/* Buttons */
.abtn{border:none;padding:9px 16px;cursor:pointer;font-weight:700;font-size:12px;border-radius:10px;font-family:'Inter',sans-serif;transition:all .15s;letter-spacing:.2px;white-space:nowrap}
.abtn:hover{transform:translateY(-1px);filter:brightness(1.1)}
.abtn:active{transform:none;filter:none}
.abtn-purple{background:linear-gradient(135deg,var(--pp),var(--pk));color:#fff;box-shadow:0 4px 16px rgba(168,85,247,0.3)}
.abtn-orange{background:linear-gradient(135deg,#f97316,#ef4444);color:#fff}
.abtn-red{background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.25)}
.abtn-red:hover{background:rgba(239,68,68,0.25)}
.abtn-ghost{background:var(--bg2);color:var(--pp);border:1px solid rgba(168,85,247,0.25)}
.abtn-ghost:hover{background:var(--pp-dim)}
.abtn-ghost.on{background:var(--pp-dim);color:#fff}
.abtn-outline{background:transparent;color:var(--pp);border:1px solid rgba(168,85,247,0.3)}
.abtn-outline:hover{background:var(--pp-dim)}

/* Create panel */
.cpanel{margin:0 28px 14px;background:rgba(168,85,247,0.04);border:1px solid rgba(168,85,247,0.2);border-radius:18px;padding:24px;display:none;backdrop-filter:blur(12px)}
.cpanel label{display:block;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:5px}
.cpanel input,.cpanel textarea{background:rgba(0,0,0,0.3);color:#fff;border:1px solid var(--border);padding:10px 13px;font-family:var(--mono);font-size:11px;width:100%;margin-bottom:12px;border-radius:10px;outline:none;resize:vertical;transition:border-color .2s}
.cpanel input:focus,.cpanel textarea:focus{border-color:rgba(168,85,247,.4)}

/* Cards */
#cards{padding:0 28px;display:flex;flex-direction:column;gap:14px}
.card{border-radius:20px;overflow:hidden;border:1px solid var(--border);background:rgba(10,5,20,0.6);backdrop-filter:blur(16px);transition:all .25s;display:flex}
.card:hover{border-color:rgba(168,85,247,0.25);box-shadow:0 16px 60px rgba(0,0,0,0.5),0 0 40px rgba(168,85,247,0.06);transform:translateY(-1px)}
.card-stripe{width:3px;flex-shrink:0}
.stripe-live{background:linear-gradient(180deg,var(--pp),var(--pk))}
.stripe-dead{background:linear-gradient(180deg,#444,#333)}
.card-inner{flex:1;padding:20px 22px}

.card-top{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.pill{font-size:8px;font-weight:800;letter-spacing:2.5px;padding:4px 10px;border-radius:100px;flex-shrink:0}
.pill-live{background:var(--pp-dim);color:var(--pp);border:1px solid rgba(168,85,247,0.3)}
.pill-dead{background:rgba(100,100,100,0.1);color:#888;border:1px solid rgba(100,100,100,0.2)}
.card-name{flex:1;font-size:16px;font-weight:800;color:#fff}
.card-btns{display:flex;gap:5px}
.cbtn{background:rgba(255,255,255,0.05);color:rgba(200,180,255,0.7);border:1px solid var(--border);padding:5px 11px;border-radius:8px;font-size:10px;font-family:'Inter',sans-serif;font-weight:600;cursor:pointer;transition:all .15s}
.cbtn:hover{background:var(--pp-dim);color:var(--pp);border-color:rgba(168,85,247,0.3)}

.info-grid{margin-bottom:14px;display:flex;flex-direction:column;gap:3px}
.ig-row{display:flex;align-items:baseline;gap:10px;font-size:11px}
.ig-k{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);white-space:nowrap;min-width:70px}
.ig-v{color:rgba(200,180,255,0.6);font-family:var(--mono);word-break:break-all;font-size:10px}
.ig-v.hi{color:var(--pp);font-weight:700;font-size:14px}

.timers{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
.tblock{background:rgba(0,0,0,0.25);border:1px solid var(--border);border-radius:12px;padding:12px 14px}
.tlbl{font-size:8px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:7px}
.tval{font-size:24px;font-weight:800;background:linear-gradient(90deg,var(--pp),var(--pk));-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-variant-numeric:tabular-nums;line-height:1;margin-bottom:9px;font-family:var(--mono)}
.tval.twarn{background:linear-gradient(90deg,#f97316,#ef4444);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.tbar{height:3px;background:rgba(255,255,255,0.05);border-radius:2px}
.tfill{height:3px;border-radius:2px;transition:width 1s linear;background:linear-gradient(90deg,var(--pp),var(--pk))}
.tfill.twarn{background:linear-gradient(90deg,#f97316,#ef4444)}

.tok-grid{margin-bottom:14px;display:flex;flex-direction:column;gap:6px}
.tok-row{display:flex;align-items:flex-start;gap:8px}
.tok-k{font-size:8px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);white-space:nowrap;padding-top:4px;min-width:52px}
.tok-v{flex:1;background:rgba(0,0,0,0.3);border:1px solid var(--border);padding:7px 10px;font-size:9px;word-break:break-all;color:rgba(168,85,247,0.2);border-radius:8px;font-family:var(--mono);line-height:1.5;transition:all .3s}
.tok-v.blurred,.hideable.blurred{filter:blur(5px);user-select:none}

.card-foot{border-top:1px solid var(--border);padding-top:14px;display:flex;flex-direction:column;gap:10px}
.upd-block{background:rgba(0,0,0,0.2);border:1px solid var(--border);border-radius:12px;padding:13px}
.upd-block textarea{background:rgba(0,0,0,0.3);color:rgba(220,200,255,0.8);border:1px solid var(--border);padding:8px 10px;font-family:var(--mono);font-size:9px;width:100%;margin-bottom:7px;border-radius:8px;resize:vertical;outline:none;transition:border-color .2s}
.upd-block textarea:focus{border-color:rgba(168,85,247,.35)}
.foot-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.rinput{background:rgba(255,255,255,0.04);color:#fff;border:1px solid var(--border);padding:8px 12px;border-radius:9px;font-family:'Inter',sans-serif;font-size:11px;outline:none;width:120px;transition:border-color .2s}
.rinput:focus{border-color:rgba(168,85,247,.35)}

/* Toast */
.toast{position:fixed;bottom:28px;right:28px;background:linear-gradient(135deg,var(--pp),var(--pk));color:#fff;padding:10px 20px;border-radius:12px;font-size:12px;font-weight:700;z-index:999;opacity:0;transform:translateY(10px) scale(.95);transition:all .25s;pointer-events:none;box-shadow:0 8px 32px rgba(168,85,247,0.4)}
.toast.show{opacity:1;transform:translateY(0) scale(1)}
</style></head><body>
<canvas id="bg"></canvas>
<div class="page">

<div class="hdr">
  <div class="hdr-logo">⚡</div>
  <div class="hdr-name">AC Auth <em>Backend</em></div>
  <div class="made-by"><div class="made-by-dot"></div><div class="made-by-text">Made by Lunar3HP</div></div>
  <nav class="hdr-nav">
    <a href="/" class="hnav-btn hnav-active">Sessions</a>
    <a href="/symbol-getter" class="hnav-btn">Symbol Getter</a>
    <a href="/symbol-patcher" class="hnav-btn">Symbol Patcher</a>
  </nav>
  <div class="hdr-r">
    <div class="hdr-clock" id="clock"></div>
    <form method="POST" action="/logout" style="display:inline">
      <button type="submit" class="abtn abtn-ghost" style="padding:7px 14px;font-size:11px">Sign Out</button>
    </form>
  </div>
</div>


<div class="stats">
  <div class="stat"><div class="stat-lbl">Total Sessions</div><div class="stat-val">${total}</div></div>
  <div class="stat"><div class="stat-lbl">Active</div><div class="stat-val">${active}</div></div>
  <div class="stat"><div class="stat-lbl">Total Connections</div><div class="stat-val">${totalConns}</div></div>
</div>

<div class="bar">
  <input class="search" type="text" placeholder="⌕  Search sessions…" oninput="filterCards(this.value)">
  <button class="abtn abtn-purple" onclick="toggleCreate()">+ New Session</button>
  <form method="POST" action="/refresh-all" style="display:inline">
    <button type="submit" class="abtn abtn-orange">⟳ Refresh All</button>
  </form>
  <form method="POST" action="/clean-duplicates" style="display:inline">
    <button type="submit" class="abtn abtn-outline">🧹 Clean Dupes</button>
  </form>
  <button id="blurBtn" class="abtn abtn-ghost" onclick="toggleBlur()">🔒 Hide Tokens</button>
</div>

<div id="create-panel" class="cpanel">
  <form method="POST" action="/session/create">
    <label>Name (optional)</label>
    <input name="name" placeholder="e.g. MyAccount">
    <label>Token</label>
    <textarea name="token" rows="2" placeholder="Paste token…"></textarea>
    <label>Refresh Token</label>
    <textarea name="refresh_token" rows="2" placeholder="Paste refresh token…"></textarea>
    <button type="submit" class="abtn abtn-purple">Create Session</button>
  </form>
</div>

<div id="cards">${cards}</div>
</div>
<div class="toast" id="toast"></div>

<script>
let blurred=false;
function toggleBlur(){
  blurred=!blurred;
  document.querySelectorAll('.tok-v,.hideable').forEach(e=>e.classList.toggle('blurred',blurred));
  document.querySelectorAll('.upd-block textarea').forEach(e=>{e.style.filter=blurred?'blur(5px)':'';e.style.userSelect=blurred?'none':'';});
  const b=document.getElementById('blurBtn');
  b.textContent=blurred?'🔓 Show Tokens':'🔒 Hide Tokens';
  b.classList.toggle('on',blurred);
}
function copy(t,msg){
  navigator.clipboard.writeText(t);
  const el=document.getElementById('toast');
  el.textContent=msg||'Copied!';
  el.classList.add('show');
  clearTimeout(el._t);
  el._t=setTimeout(()=>el.classList.remove('show'),1800);
}
function filterCards(q){
  const lq=q.toLowerCase();
  document.querySelectorAll('.card').forEach(c=>c.style.display=c.innerText.toLowerCase().includes(lq)?'':'none');
}
function toggleCreate(){
  const p=document.getElementById('create-panel');
  p.style.display=p.style.display==='block'?'none':'block';
}
function fmt(s){
  if(s<=0)return'EXPIRED';
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=s%60;
  if(h>0)return h+'h '+m+'m';
  return String(m).padStart(2,'0')+':'+String(sc).padStart(2,'0');
}
setInterval(()=>{
  const now=Math.floor(Date.now()/1000);
  let anyExpired=false;
  document.querySelectorAll('.tval').forEach(el=>{
    const exp=parseInt(el.dataset.exp);
    const s=Math.max(0,exp-now);
    el.textContent=fmt(s);
    const max=parseInt(el.dataset.max)||3600;
    const bid=el.id.replace('tk-','tb-').replace('rk-','rb-');
    const bar=document.getElementById(bid);
    if(bar)bar.style.width=Math.max(0,Math.min(100,s/max*100)).toFixed(2)+'%';
    if(s<300&&el.id.startsWith('tk-')){el.classList.add('twarn');if(bar)bar.classList.add('twarn');}
    if(s<=0&&el.id.startsWith('tk-'))anyExpired=true;
  });
  if(anyExpired){
    fetch('/try-refresh').finally(()=>location.reload());
  }
},1000);
(function tick(){document.getElementById('clock').textContent=new Date().toLocaleTimeString();setTimeout(tick,1000);})();



</script>
${BG_SCRIPT}
</body></html>`);
});

// ── Session CRUD ───────────────────────────────────────────────────────────────
app.post("/session/create",(req,res)=>{
  const id=crypto.randomBytes(8).toString("hex");
  const{name,token,refresh_token}=req.body;
  sessions[id]={id,name:name||id,token:token?.trim()||"",refresh_token:refresh_token?.trim()||"",connections:0};
  saveSessions();res.redirect("/");
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
  s.name=req.body.name?.trim()||s.name;saveSessions();res.redirect("/");
});
app.post("/session/:id/refresh",async(req,res)=>{
  const s=sessions[req.params.id];
  if(!s)return res.status(404).json({error:"Not found"});
  await tryRefresh(s);res.redirect("/");
});
app.post("/session/:id/delete",(req,res)=>{
  delete sessions[req.params.id];saveSessions();res.redirect("/");
});
app.post("/refresh-all",async(req,res)=>{
  for(const s of Object.values(sessions))await tryRefresh(s);
  res.redirect("/");
});
app.post("/clean-duplicates",(req,res)=>{
  const seen=new Map();
  for(const[id,s]of Object.entries(sessions)){
    const key=s.refresh_token||id;
    if(seen.has(key)){delete sessions[id];}
    else seen.set(key,id);
  }
  saveSessions();res.redirect("/");
});

// ── API ────────────────────────────────────────────────────────────────────────
app.post("/v2/account/authenticate/custom/:client",(req,res)=>{
  const clientId = req.params.client;
  // First try direct key match
  let s = sessions[clientId];
  // Then try matching by uid in token payload
  if(!s) s = Object.values(sessions).find(sess=>{
    try{ return JSON.parse(Buffer.from(sess.token.split(".")[1],"base64").toString()).uid === clientId; }catch{return false;}
  });
  // Fallback to first session
  if(!s) s = Object.values(sessions)[0];
  if(s){s.connections=(s.connections||0)+1;saveSessions();console.log(`[Auth] ${clientId} → ${s.name||s.id}`);return res.json({token:s.token,refresh_token:s.refresh_token,created:false});}
  res.json({token:"",refresh_token:"",created:false});
});
app.post("/v2/account/authenticate/refresh",(req,res)=>{
  const first=Object.values(sessions)[0];
  res.json({token:first?.token||"",refresh_token:first?.refresh_token||"",created:false});
});
app.get("/v2/account",async(req,res)=>{
  // Match session by Bearer token in Authorization header, fallback to any valid session
  const authHeader = req.headers.authorization || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  let s = bearerToken ? Object.values(sessions).find(s=>s.token===bearerToken) : null;
  if(!s) s = Object.values(sessions).find(s=>!isExpired(s.token));
  if(!s)return res.status(401).json({error:"No valid session"});
  console.log(`[/v2/account] Serving account for ${s.name||s.id}`);
  try{const u=await fetch(`${NAKAMA_SERVER}/v2/account`,{headers:{"Authorization":`Bearer ${s.token}`,"User-Agent":"UnityPlayer/6000.3.12f1 (UnityWebRequest/1.0, libcurl/8.10.1-DEV)","x-unity-version":"6000.3.12f1"}});res.json(await u.json());}
  catch(e){console.log(`[/v2/account] Error: ${e.message}`);res.status(500).json({});}
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
// ── SYMBOL GETTER PAGE ────────────────────────────────────────────────────────
app.get("/symbol-getter", (req, res) => {
  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Symbol Getter — AC Auth</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --pp:#a855f7;--pk:#ec4899;--or:#f97316;
  --pp-dim:rgba(168,85,247,0.12);
  --border:rgba(255,255,255,0.07);--border-hi:rgba(255,255,255,0.14);
  --bg0:#00000f;--bg1:rgba(255,255,255,0.025);--bg2:rgba(255,255,255,0.04);
  --bg3:#1a1a1a;
  --text:#e8e0ff;--muted:rgba(200,180,255,0.35);--mono:'JetBrains Mono',monospace;
  --success:#50fa7b;--danger:#ff5555;
}
html,body{min-height:100%;background:var(--bg0);font-family:'Inter',sans-serif;color:var(--text)}
#bg{position:fixed;inset:0;z-index:0;pointer-events:none}
.page{position:relative;z-index:1;max-width:1020px;margin:0 auto;padding-bottom:80px}
.hdr{display:flex;align-items:center;gap:14px;padding:18px 28px;border-bottom:1px solid var(--border);background:rgba(0,0,10,0.55);backdrop-filter:blur(20px);position:sticky;top:0;z-index:100}
.hdr-logo{width:38px;height:38px;background:linear-gradient(135deg,var(--pp),var(--pk),var(--or));border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 0 24px rgba(168,85,247,0.5);animation:logopulse 4s ease-in-out infinite;flex-shrink:0}
@keyframes logopulse{0%,100%{box-shadow:0 0 24px rgba(168,85,247,0.5)}50%{box-shadow:0 0 40px rgba(168,85,247,0.8),0 0 60px rgba(236,72,153,0.3)}}
.hdr-name{font-size:18px;font-weight:900;color:#fff;letter-spacing:-.5px}
.hdr-name em{font-style:normal;background:linear-gradient(90deg,var(--pp),var(--pk));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.made-by{display:flex;align-items:center;gap:7px;background:linear-gradient(135deg,rgba(168,85,247,0.15),rgba(236,72,153,0.1));border:1px solid rgba(168,85,247,0.35);border-radius:100px;padding:5px 14px 5px 10px;position:relative;overflow:hidden}
.made-by::before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(168,85,247,0.08),transparent);animation:shimmer 2.5s linear infinite}
@keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
.made-by-dot{width:6px;height:6px;border-radius:50%;background:linear-gradient(135deg,var(--pp),var(--pk));box-shadow:0 0 8px rgba(168,85,247,0.8);animation:dotpulse 2s ease-in-out infinite;flex-shrink:0}
@keyframes dotpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.7)}}
.made-by-text{font-size:11px;font-weight:800;letter-spacing:.5px;background:linear-gradient(90deg,#c084fc,#f472b6,#fb923c);-webkit-background-clip:text;-webkit-text-fill-color:transparent;white-space:nowrap}
.hdr-nav{display:flex;gap:4px;background:rgba(0,0,0,0.3);border:1px solid var(--border);border-radius:12px;padding:4px}
.hnav-btn{font-size:11px;font-weight:700;padding:6px 14px;border-radius:8px;color:var(--muted);text-decoration:none;transition:all .15s;letter-spacing:.2px}
.hnav-btn:hover{color:var(--text);background:rgba(255,255,255,0.06)}
.hnav-active{background:linear-gradient(135deg,var(--pp),var(--pk))!important;color:#fff!important;box-shadow:0 2px 12px rgba(168,85,247,0.4)}
.hdr-r{margin-left:auto;display:flex;align-items:center;gap:10px}
.hdr-clock{font-size:12px;color:var(--muted);font-family:var(--mono);background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:6px 12px}
.abtn{border:none;padding:9px 16px;cursor:pointer;font-weight:700;font-size:12px;border-radius:10px;font-family:'Inter',sans-serif;transition:all .15s;letter-spacing:.2px;white-space:nowrap}
.abtn:hover{transform:translateY(-1px);filter:brightness(1.1)}
.abtn-ghost{background:var(--bg2);color:var(--pp);border:1px solid rgba(168,85,247,0.25)}
.abtn-ghost:hover{background:var(--pp-dim)}

/* Symbol Getter content */
.sg-wrap{padding:32px 28px}
.sg-title{font-size:26px;font-weight:900;color:#fff;letter-spacing:-.5px;margin-bottom:6px}
.sg-sub{font-size:13px;color:var(--muted);margin-bottom:6px}
.sg-by{font-size:11px;color:rgba(200,180,255,0.2);letter-spacing:.5px;margin-bottom:28px}
.drop-zone{border:1.5px dashed var(--border-hi);border-radius:18px;padding:3.5rem 2rem;text-align:center;cursor:pointer;transition:background .15s,border-color .15s;margin-bottom:1.5rem;user-select:none;background:var(--bg1)}
.drop-zone:hover,.drop-zone.drag{background:rgba(168,85,247,0.06);border-color:rgba(168,85,247,0.4)}
.drop-zone svg{width:36px;height:36px;color:var(--muted);display:block;margin:0 auto 14px}
.dz-title{font-size:15px;font-weight:600;color:var(--text)}
.dz-hint{font-size:13px;color:var(--muted);margin-top:5px}
#file-input{display:none}
.progress{height:2px;background:rgba(255,255,255,0.05);border-radius:2px;margin-bottom:1rem;display:none;overflow:hidden}
.progress.show{display:block}
.progress-bar{height:100%;width:0%;background:linear-gradient(90deg,var(--pp),var(--pk));border-radius:2px;transition:width .3s}
.status{font-size:12px;color:var(--muted);margin-bottom:1.25rem;display:none;font-family:var(--mono)}
.status.show{display:block}
.status.err{color:var(--danger)}
.status.ok{color:var(--success)}
.outputs{display:flex;flex-direction:column;gap:14px}
.out-card{background:var(--bg1);border:1px solid var(--border);border-radius:18px;overflow:hidden;display:none}
.out-card.show{display:block}
.out-header{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid var(--border);background:rgba(255,255,255,0.02)}
.out-header-left{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:700;font-family:var(--mono);color:#fff}
.badge{font-size:11px;padding:2px 10px;border-radius:99px;background:var(--pp-dim);color:var(--pp);border:1px solid rgba(168,85,247,0.25);font-family:'Inter',sans-serif}
.dl-btn{display:flex;align-items:center;gap:6px;font-size:12px;font-family:'Inter',sans-serif;padding:6px 16px;border-radius:9px;border:1px solid var(--border-hi);background:transparent;color:var(--text);cursor:pointer;transition:background .12s;font-weight:600}
.dl-btn:hover{background:var(--pp-dim);border-color:rgba(168,85,247,0.35);color:var(--pp)}
.dl-btn svg{width:13px;height:13px}
pre{padding:18px;font-size:11px;color:rgba(200,180,255,0.5);font-family:var(--mono);overflow:auto;max-height:240px;line-height:1.7;white-space:pre;background:rgba(0,0,0,0.3)}
.toast{position:fixed;bottom:28px;right:28px;background:linear-gradient(135deg,var(--pp),var(--pk));color:#fff;padding:10px 20px;border-radius:12px;font-size:12px;font-weight:700;z-index:999;opacity:0;transform:translateY(10px) scale(.95);transition:all .25s;pointer-events:none;box-shadow:0 8px 32px rgba(168,85,247,0.4)}
.toast.show{opacity:1;transform:translateY(0) scale(1)}
</style></head><body>
<canvas id="bg"></canvas>
<div class="page">

<div class="hdr">
  <div class="hdr-logo">⚡</div>
  <div class="hdr-name">AC Auth <em>Backend</em></div>
  <div class="made-by"><div class="made-by-dot"></div><div class="made-by-text">Made by Lunar3HP</div></div>
  <nav class="hdr-nav">
    <a href="/" class="hnav-btn">Sessions</a>
    <a href="/symbol-getter" class="hnav-btn hnav-active">Symbol Getter</a>
    <a href="/symbol-patcher" class="hnav-btn">Symbol Patcher</a>
  </nav>
  <div class="hdr-r">
    <div class="hdr-clock" id="clock"></div>
    <form method="POST" action="/logout" style="display:inline">
      <button type="submit" class="abtn abtn-ghost" style="padding:7px 14px;font-size:11px">Sign Out</button>
    </form>
  </div>
</div>

<div class="sg-wrap">
  <div class="sg-title">Symbol Getter</div>
  <div class="sg-sub">Get symbols from libil2cpp.so and generate output files</div>
  <div class="sg-by">BY AMBLOCK</div>

  <div class="drop-zone" id="dz">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
    <div class="dz-title">Drop libil2cpp.so here</div>
    <div class="dz-hint">or click to browse — processed entirely in your browser</div>
  </div>
  <input type="file" id="file-input" accept=".so">

  <div class="progress" id="prog"><div class="progress-bar" id="prog-bar"></div></div>
  <div class="status" id="status"></div>

  <div class="outputs">
    <div class="out-card" id="card-json">
      <div class="out-header">
        <div class="out-header-left">SymbolMap.json <span class="badge" id="cnt">0 symbols</span></div>
        <button class="dl-btn" onclick="dl('SymbolMap.json','json')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download
        </button>
      </div>
      <pre id="pre-json"></pre>
    </div>
    <div class="out-card" id="card-headers">
      <div class="out-header">
        <div class="out-header-left">Il2Cpp-Headers.hpp</div>
        <button class="dl-btn" onclick="dl('Il2Cpp-Headers.hpp','headers')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download
        </button>
      </div>
      <pre id="pre-headers"></pre>
    </div>
    <div class="out-card" id="card-method">
      <div class="out-header">
        <div class="out-header-left">Il2CppMethodNames.hpp</div>
        <button class="dl-btn" onclick="dl('Il2CppMethodNames.hpp','method')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download
        </button>
      </div>
      <pre id="pre-method"></pre>
    </div>
    <div class="out-card" id="card-frida">
      <div class="out-header">
        <div class="out-header-left">Frida-Map.js</div>
        <button class="dl-btn" onclick="dl('Frida-Map.js','frida')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download
        </button>
      </div>
      <pre id="pre-frida"></pre>
    </div>
  </div>
</div>
</div>
<div class="toast" id="toast"></div>

<script>
const IL2CPP_API = [
  "il2cpp_init","il2cpp_init_utf16","il2cpp_shutdown","il2cpp_set_config_dir",
  "il2cpp_set_data_dir","il2cpp_set_temp_dir","il2cpp_set_commandline_arguments",
  "il2cpp_set_commandline_arguments_utf16","il2cpp_set_config","il2cpp_class_from_il2cpp_type",
  "il2cpp_array_new_specific","il2cpp_class_from_type","il2cpp_type_get_class_or_element_class",
  "il2cpp_domain_get_assemblies","il2cpp_domain_assembly_open","il2cpp_image_get_name",
  "il2cpp_image_get_entry_point","il2cpp_image_get_class_count","il2cpp_image_get_class",
  "il2cpp_exception_from_name_msg","il2cpp_get_exception_argument_null","il2cpp_format_exception",
  "il2cpp_format_stack_trace","il2cpp_unhandled_exception","il2cpp_field_get_flags",
  "il2cpp_field_get_name","il2cpp_field_get_parent","il2cpp_field_get_type","il2cpp_field_get_value",
  "il2cpp_field_get_value_object","il2cpp_field_has_attribute","il2cpp_field_set_value",
  "il2cpp_field_static_get_value","il2cpp_field_static_set_value","il2cpp_field_get_offset",
  "il2cpp_gc_collect","il2cpp_gc_collect_a_little","il2cpp_gc_disable","il2cpp_gc_enable",
  "il2cpp_gc_is_disabled","il2cpp_gc_get_max_time_slice_ns","il2cpp_gc_set_max_time_slice_ns",
  "il2cpp_gc_get_heap_size","il2cpp_gc_get_used_size","il2cpp_gc_wbarrier_set_field",
  "il2cpp_gchandle_new","il2cpp_gchandle_new_weakref","il2cpp_gchandle_get_target",
  "il2cpp_gchandle_free","il2cpp_gchandle_foreach_get_target","il2cpp_object_header_size",
  "il2cpp_array_object_header_size","il2cpp_offset_of_array_length_in_array_object_header",
  "il2cpp_offset_of_array_bounds_in_array_object_header","il2cpp_allocation_granularity",
  "il2cpp_image_get_assembly","il2cpp_image_get_filename","il2cpp_last_error",
  "il2cpp_method_get_param","il2cpp_method_get_class","il2cpp_method_has_attribute",
  "il2cpp_method_get_flags","il2cpp_method_get_token","il2cpp_method_get_name",
  "il2cpp_method_is_generic","il2cpp_method_is_inflated","il2cpp_method_get_param_count",
  "il2cpp_method_get_generic_param_count","il2cpp_method_get_return_type",
  "il2cpp_method_get_declaring_type","il2cpp_method_get_param_name",
  "il2cpp_method_get_from_reflection","il2cpp_method_get_object","il2cpp_monitor_enter",
  "il2cpp_monitor_try_enter","il2cpp_monitor_exit","il2cpp_monitor_pulse","il2cpp_monitor_pulse_all",
  "il2cpp_monitor_wait","il2cpp_monitor_try_wait","il2cpp_object_new",
  "il2cpp_object_get_virtual_method","il2cpp_object_get_class","il2cpp_object_get_size",
  "il2cpp_object_unbox","il2cpp_value_box","il2cpp_object_destroy","il2cpp_object_new_specific",
  "il2cpp_profiler_install","il2cpp_profiler_set_events","il2cpp_profiler_install_enter_leave",
  "il2cpp_profiler_install_allocation","il2cpp_profiler_install_gc","il2cpp_profiler_install_fileio",
  "il2cpp_profiler_install_thread","il2cpp_property_get_flags","il2cpp_property_get_get_method",
  "il2cpp_property_get_set_method","il2cpp_property_get_name","il2cpp_property_get_parent",
  "il2cpp_object_get_reflection_type","il2cpp_runtime_class_init","il2cpp_runtime_object_init",
  "il2cpp_runtime_object_init_exception","il2cpp_runtime_invoke",
  "il2cpp_runtime_invoke_convert_args","il2cpp_runtime_delegate_invoke",
  "il2cpp_runtime_is_shutting_down","il2cpp_runtime_unhandled_exception_policy_set",
  "il2cpp_string_length","il2cpp_string_chars","il2cpp_string_new","il2cpp_string_new_len",
  "il2cpp_string_new_utf16","il2cpp_string_new_wrapper","il2cpp_string_intern",
  "il2cpp_string_is_interned","il2cpp_thread_current","il2cpp_thread_attach","il2cpp_thread_detach",
  "il2cpp_thread_get_all_attached_threads","il2cpp_is_vm_thread",
  "il2cpp_current_thread_walk_frame_stack","il2cpp_thread_walk_frame_stack",
  "il2cpp_current_thread_get_top_frame","il2cpp_thread_get_top_frame",
  "il2cpp_current_thread_get_frame_at","il2cpp_thread_get_frame_at",
  "il2cpp_current_thread_get_stack_depth","il2cpp_thread_get_stack_depth",
  "il2cpp_override_stack_backtrace","il2cpp_type_get_object","il2cpp_type_get_type",
  "il2cpp_type_get_name","il2cpp_type_get_assembly_qualified_name","il2cpp_type_is_byref",
  "il2cpp_type_get_attrs","il2cpp_type_equals","il2cpp_type_get_name_chunked",
  "il2cpp_array_new","il2cpp_array_new_full","il2cpp_bounded_array_class_get",
  "il2cpp_array_element_size","il2cpp_array_length","il2cpp_array_get_byte_length",
  "il2cpp_array_class_get","il2cpp_array_get","il2cpp_array_set",
  "il2cpp_class_array_element_size","il2cpp_class_element_class","il2cpp_class_enum_basetype",
  "il2cpp_class_is_generic","il2cpp_class_is_inflated","il2cpp_class_is_assignable_from",
  "il2cpp_class_is_subclass_of","il2cpp_class_has_parent","il2cpp_class_from_name",
  "il2cpp_class_from_system_type","il2cpp_class_get_element_class","il2cpp_class_get_events",
  "il2cpp_class_get_fields","il2cpp_class_get_nested_types","il2cpp_class_get_interfaces",
  "il2cpp_class_get_properties","il2cpp_class_get_property_from_name",
  "il2cpp_class_get_field_from_name","il2cpp_class_get_methods","il2cpp_class_get_method_from_name",
  "il2cpp_class_get_name","il2cpp_class_get_namespace","il2cpp_class_get_parent",
  "il2cpp_class_get_declaring_type","il2cpp_class_instance_size","il2cpp_class_num_fields",
  "il2cpp_class_is_valuetype","il2cpp_class_value_size","il2cpp_class_is_blittable",
  "il2cpp_class_get_flags","il2cpp_class_is_abstract","il2cpp_class_is_interface",
  "il2cpp_class_array_new","il2cpp_class_get_type","il2cpp_class_get_type_token",
  "il2cpp_class_has_attribute","il2cpp_class_has_references","il2cpp_class_is_enum",
  "il2cpp_class_is_null_class","il2cpp_class_get_image","il2cpp_class_get_assemblyname",
  "il2cpp_class_get_rank","il2cpp_class_get_data_size","il2cpp_class_get_static_field_data",
  "il2cpp_class_get_bitmap_size","il2cpp_class_get_bitmap","il2cpp_stats_dump_to_file",
  "il2cpp_stats_get_value","il2cpp_domain_get","il2cpp_field_set_value_object",
  "il2cpp_object_new_from_index","il2cpp_object_get_field_count","il2cpp_object_pool_get",
  "il2cpp_object_pool_return","il2cpp_config_string_to_utf8",
  "il2cpp_config_set_maximum_threads_alive","il2cpp_config_get_maximum_threads_alive",
  "il2cpp_array_set_byte_length"
];

const SKIP_RE = /^(_Z|SystemNative|Java_|pthread|__cxa|__start|__stop|NLSocket|ZStream|Flush|Dll[CG]|Globalization|JNI_|ReadEvents|mono_pal|__dynamic|__gxx|UnityAds|CloseN|CreateN)/;
let outputs = {};

const dz = document.getElementById('dz');
const fi = document.getElementById('file-input');
const statusEl = document.getElementById('status');
const progEl = document.getElementById('prog');
const progBar = document.getElementById('prog-bar');

dz.addEventListener('click', () => fi.click());
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); processFile(e.dataTransfer.files[0]); });
fi.addEventListener('change', () => processFile(fi.files[0]));

function setStatus(msg, cls) { statusEl.textContent = msg; statusEl.className = 'status show' + (cls ? ' '+cls : ''); }
function setProgress(p) { progEl.className = 'progress show'; progBar.style.width = p + '%'; if (p >= 100) setTimeout(() => { progEl.className = 'progress'; }, 700); }

function r32(b,o){return((b[o]|(b[o+1]<<8)|(b[o+2]<<16)|(b[o+3]<<24))>>>0);}
function r64(b,o){return r32(b,o+4)*0x100000000+r32(b,o);}
function r16(b,o){return b[o]|(b[o+1]<<8);}
function cstr(b,o){let s='';while(o<b.length&&b[o]!==0)s+=String.fromCharCode(b[o++]);return s;}

function extractObfSymbols(buf) {
  if(buf[0]!==0x7f||buf[1]!==0x45||buf[2]!==0x4c||buf[3]!==0x46)throw new Error('Not an ELF file');
  const is64=buf[4]===2;
  const entries=[];
  if(is64){
    const shoff=r64(buf,40),shentsz=r16(buf,58),shnum=r16(buf,60);
    const secs=[];
    for(let i=0;i<shnum;i++){const b=Number(shoff)+i*shentsz;secs.push({type:r32(buf,b+4),off:r64(buf,b+24),size:r64(buf,b+32),link:r32(buf,b+40),entsz:r64(buf,b+56)});}
    for(const s of secs){
      if(s.type!==11&&s.type!==2)continue;
      const strsec=secs[s.link];const esz=Number(s.entsz)||24;const cnt=Math.floor(Number(s.size)/esz);
      for(let j=0;j<cnt;j++){const b=Number(s.off)+j*esz;const nm=r32(buf,b);const info=buf[b+4];const shndx=r16(buf,b+6);const addr=r64(buf,b+8);const bind=info>>4;
        if(shndx!==0&&shndx!==0xfff1&&bind===1){const name=cstr(buf,Number(strsec.off)+nm);if(name&&!SKIP_RE.test(name)&&/^[A-Za-z_][A-Za-z0-9_]{2,}$/.test(name))entries.push({name,addr:Number(addr)});}}
    }
  } else {
    const shoff=r32(buf,32),shentsz=r16(buf,46),shnum=r16(buf,48);
    const secs=[];
    for(let i=0;i<shnum;i++){const b=shoff+i*shentsz;secs.push({type:r32(buf,b+4),off:r32(buf,b+16),size:r32(buf,b+20),link:r32(buf,b+24),entsz:r32(buf,b+36)});}
    for(const s of secs){
      if(s.type!==11&&s.type!==2)continue;
      const strsec=secs[s.link];const esz=s.entsz||16;const cnt=Math.floor(s.size/esz);
      for(let j=0;j<cnt;j++){const b=s.off+j*esz;const nm=r32(buf,b);const addr=r32(buf,b+4);const info=buf[b+12];const shndx=r16(buf,b+14);const bind=info>>4;
        if(shndx!==0&&shndx!==0xfff1&&bind===1){const name=cstr(buf,strsec.off+nm);if(name&&!SKIP_RE.test(name)&&/^[A-Za-z_][A-Za-z0-9_]{2,}$/.test(name))entries.push({name,addr});}}
    }
  }
  entries.sort((a,b)=>a.addr-b.addr);
  return [...new Map(entries.map(e=>[e.name,e])).values()].sort((a,b)=>a.addr-b.addr).map(e=>e.name);
}

function buildMap(syms){const map={};const len=Math.min(syms.length,IL2CPP_API.length);for(let i=0;i<len;i++)map[IL2CPP_API[i]]=syms[i];return map;}
function ts(){return new Date().toLocaleString('en-US',{month:'2-digit',day:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});}
function genJSON(map){const obj={"__header":"// Generated by amblock at "+ts()+"  [Symbol-Map]"};for(const[k,v]of Object.entries(map))obj[k]=v;return JSON.stringify(obj,null,4);}
function genHeaders(map){let s="#pragma once\\n\\n// Generated by amblock at "+ts()+"  [Il2Cpp-Headers]\\n\\n";for(const[k,v]of Object.entries(map))s+="#define symbol_"+k+" \\""+v+"\\"\\n";return s;}
function genMethod(map){let s="#pragma once\\n\\n// Generated by amblock at "+ts()+"  [Il2CppMethodNames]\\n\\n";for(const[k,v]of Object.entries(map))s+="#define BNM_IL2CPP_API_"+k+" \\""+v+"\\"\\n";return s;}
function genFrida(map){const entries=Object.entries(map);let s="// Generated by amblock at "+ts()+"  [Frida-Map]\\n\\nIl2Cpp.$config.exports = {\\n";entries.forEach(([k,v],i)=>s+="    "+k+": () => Il2Cpp.module.findExportByName(\\""+v+"\\")"+((i<entries.length-1)?',':'')+"\\n");s+='};';return s;}

async function processFile(file){
  if(!file)return;
  if(!file.name.endsWith('.so')){setStatus('file must be a .so library','err');return;}
  setStatus('reading file...');setProgress(10);
  const buf=new Uint8Array(await file.arrayBuffer());
  setProgress(40);setStatus('parsing ELF symbol table...');
  let syms;try{syms=extractObfSymbols(buf);}catch(e){setStatus('ELF error: '+e.message,'err');return;}
  setProgress(75);setStatus('found '+syms.length+' symbols — mapping to IL2CPP API...');
  const map=buildMap(syms);const cnt=Object.keys(map).length;
  outputs.json=genJSON(map);outputs.headers=genHeaders(map);outputs.method=genMethod(map);outputs.frida=genFrida(map);
  setProgress(100);setStatus('done — mapped '+cnt+' symbols','ok');
  document.getElementById('cnt').textContent=cnt+' symbols';
  document.getElementById('pre-json').textContent=outputs.json.slice(0,3000)+(outputs.json.length>3000?'\\n...':'');
  document.getElementById('pre-headers').textContent=outputs.headers.slice(0,3000)+(outputs.headers.length>3000?'\\n...':'');
  document.getElementById('pre-method').textContent=outputs.method.slice(0,3000)+(outputs.method.length>3000?'\\n...':'');
  document.getElementById('pre-frida').textContent=outputs.frida.slice(0,3000)+(outputs.frida.length>3000?'\\n...':'');
  ['json','headers','method','frida'].forEach(id=>document.getElementById('card-'+id).classList.add('show'));
}

function dl(filename,key){if(!outputs[key])return;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([outputs[key]],{type:'text/plain'}));a.download=filename;a.click();}

(function tick(){document.getElementById('clock').textContent=new Date().toLocaleTimeString();setTimeout(tick,1000);})();
</script>
${BG_SCRIPT}
</body></html>`);
});

// ── SYMBOL PATCHER PAGE ────────────────────────────────────────────────────────
app.get("/symbol-patcher", (req, res) => {
  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Symbol Patcher — AC Auth</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --pp:#a855f7;--pk:#ec4899;--or:#f97316;
  --pp-dim:rgba(168,85,247,0.12);
  --border:rgba(255,255,255,0.07);--border-hi:rgba(255,255,255,0.14);
  --bg0:#00000f;--bg1:rgba(255,255,255,0.025);--bg2:rgba(255,255,255,0.04);
  --text:#e8e0ff;--muted:rgba(200,180,255,0.35);--mono:'JetBrains Mono',monospace;
  --success:#50fa7b;--danger:#ff5555;
}
html,body{min-height:100%;background:var(--bg0);font-family:'Inter',sans-serif;color:var(--text)}
#bg{position:fixed;inset:0;z-index:0;pointer-events:none}
.page{position:relative;z-index:1;max-width:1020px;margin:0 auto;padding-bottom:80px}
.hdr{display:flex;align-items:center;gap:14px;padding:18px 28px;border-bottom:1px solid var(--border);background:rgba(0,0,10,0.55);backdrop-filter:blur(20px);position:sticky;top:0;z-index:100}
.hdr-logo{width:38px;height:38px;background:linear-gradient(135deg,var(--pp),var(--pk),var(--or));border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 0 24px rgba(168,85,247,0.5);animation:logopulse 4s ease-in-out infinite;flex-shrink:0}
@keyframes logopulse{0%,100%{box-shadow:0 0 24px rgba(168,85,247,0.5)}50%{box-shadow:0 0 40px rgba(168,85,247,0.8),0 0 60px rgba(236,72,153,0.3)}}
.hdr-name{font-size:18px;font-weight:900;color:#fff;letter-spacing:-.5px}
.hdr-name em{font-style:normal;background:linear-gradient(90deg,var(--pp),var(--pk));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.made-by{display:flex;align-items:center;gap:7px;background:linear-gradient(135deg,rgba(168,85,247,0.15),rgba(236,72,153,0.1));border:1px solid rgba(168,85,247,0.35);border-radius:100px;padding:5px 14px 5px 10px;position:relative;overflow:hidden}
.made-by::before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(168,85,247,0.08),transparent);animation:shimmer 2.5s linear infinite}
@keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
.made-by-dot{width:6px;height:6px;border-radius:50%;background:linear-gradient(135deg,var(--pp),var(--pk));box-shadow:0 0 8px rgba(168,85,247,0.8);animation:dotpulse 2s ease-in-out infinite;flex-shrink:0}
@keyframes dotpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.7)}}
.made-by-text{font-size:11px;font-weight:800;letter-spacing:.5px;background:linear-gradient(90deg,#c084fc,#f472b6,#fb923c);-webkit-background-clip:text;-webkit-text-fill-color:transparent;white-space:nowrap}
.hdr-nav{display:flex;gap:4px;background:rgba(0,0,0,0.3);border:1px solid var(--border);border-radius:12px;padding:4px}
.hnav-btn{font-size:11px;font-weight:700;padding:6px 14px;border-radius:8px;color:var(--muted);text-decoration:none;transition:all .15s;letter-spacing:.2px}
.hnav-btn:hover{color:var(--text);background:rgba(255,255,255,0.06)}
.hnav-active{background:linear-gradient(135deg,var(--pp),var(--pk))!important;color:#fff!important;box-shadow:0 2px 12px rgba(168,85,247,0.4)}
.hdr-r{margin-left:auto;display:flex;align-items:center;gap:10px}
.hdr-clock{font-size:12px;color:var(--muted);font-family:var(--mono);background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:6px 12px}
.abtn{border:none;padding:9px 16px;cursor:pointer;font-weight:700;font-size:12px;border-radius:10px;font-family:'Inter',sans-serif;transition:all .15s;letter-spacing:.2px;white-space:nowrap}
.abtn:hover{transform:translateY(-1px);filter:brightness(1.1)}
.abtn-ghost{background:var(--bg2);color:var(--pp);border:1px solid rgba(168,85,247,0.25)}
.abtn-ghost:hover{background:var(--pp-dim)}
.abtn-purple{background:linear-gradient(135deg,var(--pp),var(--pk));color:#fff;box-shadow:0 4px 16px rgba(168,85,247,0.3)}
.abtn-green{background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;box-shadow:0 4px 16px rgba(34,197,94,0.3)}
.abtn-sm{padding:6px 12px;font-size:11px}

/* Layout */
.sp-wrap{padding:32px 28px}
.sp-title{font-size:26px;font-weight:900;color:#fff;letter-spacing:-.5px;margin-bottom:6px}
.sp-sub{font-size:13px;color:var(--muted);margin-bottom:4px}
.sp-by{font-size:11px;color:rgba(200,180,255,0.2);letter-spacing:.5px;margin-bottom:28px}

/* Steps */
.steps{display:flex;flex-direction:column;gap:20px;margin-bottom:28px}
.step{background:var(--bg1);border:1px solid var(--border);border-radius:18px;overflow:hidden}
.step-hdr{display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid var(--border);background:rgba(255,255,255,0.015)}
.step-num{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0;background:linear-gradient(135deg,var(--pp),var(--pk));color:#fff;box-shadow:0 0 12px rgba(168,85,247,0.4)}
.step-num.done{background:linear-gradient(135deg,#22c55e,#16a34a);box-shadow:0 0 12px rgba(34,197,94,0.4)}
.step-label{font-size:14px;font-weight:700;color:#fff}
.step-hint{font-size:11px;color:var(--muted);margin-left:auto}
.step-body{padding:18px 20px}

/* Drop zones */
.dz{border:1.5px dashed var(--border-hi);border-radius:14px;padding:2.5rem 2rem;text-align:center;cursor:pointer;transition:background .15s,border-color .15s;user-select:none;background:rgba(0,0,0,0.2)}
.dz:hover,.dz.drag{background:rgba(168,85,247,0.06);border-color:rgba(168,85,247,0.4)}
.dz.done{border-color:rgba(34,197,94,0.4);background:rgba(34,197,94,0.04)}
.dz svg{width:32px;height:32px;color:var(--muted);display:block;margin:0 auto 12px}
.dz-title{font-size:14px;font-weight:600;color:var(--text)}
.dz-hint{font-size:12px;color:var(--muted);margin-top:4px}
.dz-ok{font-size:13px;font-weight:700;color:#22c55e;margin-top:4px}

/* File list */
.file-list{display:flex;flex-direction:column;gap:8px;margin-top:14px}
.file-item{display:flex;align-items:center;gap:10px;background:rgba(0,0,0,0.3);border:1px solid var(--border);border-radius:10px;padding:10px 14px}
.file-icon{font-size:16px}
.file-name{flex:1;font-family:var(--mono);font-size:12px;color:rgba(200,180,255,0.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.file-size{font-size:10px;color:var(--muted);white-space:nowrap}
.file-status{font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;white-space:nowrap}
.fs-pending{background:rgba(168,85,247,0.1);color:rgba(168,85,247,0.7);border:1px solid rgba(168,85,247,0.2)}
.fs-done{background:rgba(34,197,94,0.1);color:#22c55e;border:1px solid rgba(34,197,94,0.2)}
.fs-skip{background:rgba(100,100,100,0.1);color:#888;border:1px solid rgba(100,100,100,0.2)}
.file-remove{background:none;border:none;color:rgba(255,100,100,0.4);cursor:pointer;font-size:16px;line-height:1;padding:2px 6px;border-radius:6px;transition:color .15s}
.file-remove:hover{color:#ff5555;background:rgba(255,85,85,0.1)}
.add-more{display:flex;align-items:center;justify-content:center;gap:8px;border:1.5px dashed var(--border-hi);border-radius:10px;padding:10px;cursor:pointer;color:var(--muted);font-size:12px;font-weight:600;transition:all .15s;margin-top:6px}
.add-more:hover{border-color:rgba(168,85,247,0.3);color:var(--pp);background:var(--pp-dim)}

/* Progress */
.progress{height:3px;background:rgba(255,255,255,0.05);border-radius:2px;margin:10px 0;display:none;overflow:hidden}
.progress.show{display:block}
.prog-bar{height:100%;width:0%;background:linear-gradient(90deg,var(--pp),var(--pk));border-radius:2px;transition:width .3s}
.status-line{font-size:12px;color:var(--muted);font-family:var(--mono);min-height:18px;margin-bottom:10px}
.status-line.ok{color:var(--success)}
.status-line.err{color:var(--danger)}

/* Results */
.results{display:flex;flex-direction:column;gap:10px;margin-top:20px}
.res-card{background:var(--bg1);border:1px solid var(--border);border-radius:14px;overflow:hidden;display:none}
.res-card.show{display:flex;flex-direction:column}
.res-hdr{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);background:rgba(255,255,255,0.015)}
.res-name{flex:1;font-family:var(--mono);font-size:12px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.res-badge{font-size:10px;padding:2px 9px;border-radius:99px;font-family:'Inter',sans-serif;white-space:nowrap}
.rb-changed{background:rgba(34,197,94,0.12);color:#22c55e;border:1px solid rgba(34,197,94,0.25)}
.rb-unchanged{background:rgba(100,100,100,0.1);color:#888;border:1px solid rgba(100,100,100,0.2)}
.res-dl{display:flex;align-items:center;gap:6px;font-size:11px;font-family:'Inter',sans-serif;padding:5px 12px;border-radius:8px;border:1px solid var(--border-hi);background:transparent;color:var(--text);cursor:pointer;transition:background .12s;font-weight:600}
.res-dl:hover{background:var(--pp-dim);border-color:rgba(168,85,247,0.35);color:var(--pp)}
.res-preview{padding:14px 16px;font-size:10px;color:rgba(200,180,255,0.4);font-family:var(--mono);overflow:auto;max-height:180px;line-height:1.7;background:rgba(0,0,0,0.3);white-space:pre}

/* Bottom bar */
.bottom-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:24px;padding-top:20px;border-top:1px solid var(--border)}
.toast{position:fixed;bottom:28px;right:28px;background:linear-gradient(135deg,var(--pp),var(--pk));color:#fff;padding:10px 20px;border-radius:12px;font-size:12px;font-weight:700;z-index:999;opacity:0;transform:translateY(10px) scale(.95);transition:all .25s;pointer-events:none;box-shadow:0 8px 32px rgba(168,85,247,0.4)}
.toast.show{opacity:1;transform:translateY(0) scale(1)}
</style></head><body>
<canvas id="bg"></canvas>
<div class="page">

<div class="hdr">
  <div class="hdr-logo">⚡</div>
  <div class="hdr-name">AC Auth <em>Backend</em></div>
  <div class="made-by"><div class="made-by-dot"></div><div class="made-by-text">Made by Lunar3HP</div></div>
  <nav class="hdr-nav">
    <a href="/" class="hnav-btn">Sessions</a>
    <a href="/symbol-getter" class="hnav-btn">Symbol Getter</a>
    <a href="/symbol-patcher" class="hnav-btn hnav-active">Symbol Patcher</a>
  </nav>
  <div class="hdr-r">
    <div class="hdr-clock" id="clock"></div>
    <form method="POST" action="/logout" style="display:inline">
      <button type="submit" class="abtn abtn-ghost" style="padding:7px 14px;font-size:11px">Sign Out</button>
    </form>
  </div>
</div>

<div class="sp-wrap">
  <div class="sp-title">Symbol Patcher</div>
  <div class="sp-sub">Auto-replace old obfuscated symbols in your source files with new ones from an updated libil2cpp.so</div>
  <div class="sp-by">BY AMBLOCK</div>

  <div class="steps">

    <div class="step" id="step1">
      <div class="step-hdr"><div class="step-num">1</div><div class="step-label">libil2cpp.so</div></div>
      <div class="step-body">
        <div class="dz" id="dz-new" onclick="document.getElementById('fi-new').click()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <div class="dz-title">Drop libil2cpp.so here</div>
          <div class="dz-hint">or click to browse</div>
          <div class="dz-ok" id="new-ok" style="display:none"></div>
        </div>
        <input type="file" id="fi-new" accept=".so" style="display:none">
        <div class="progress" id="prog-so"><div class="prog-bar" id="pb-so"></div></div>
        <div class="status-line" id="st-so"></div>
      </div>
    </div>

    <div class="step" id="step2">
      <div class="step-hdr"><div class="step-num">2</div><div class="step-label">Your source file</div></div>
      <div class="step-body">
        <div class="dz" id="dz-old" onclick="document.getElementById('fi-old').click()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <div class="dz-title">Drop source file here</div>
          <div class="dz-hint">or click to browse — .ts, .js, .cpp, .hpp, .h, .cs</div>
          <div class="dz-ok" id="old-ok" style="display:none"></div>
        </div>
        <input type="file" id="fi-old" accept=".ts,.js,.cpp,.hpp,.h,.cs" style="display:none">
      </div>
    </div>

  </div>

  <!-- Patch button -->
  <div style="display:flex;gap:10px;align-items:center;margin-bottom:20px;flex-wrap:wrap">
    <button class="abtn abtn-purple" id="patch-btn" onclick="runPatch()" style="font-size:13px;padding:11px 24px">
      ⚡ Patch All Files
    </button>
    <div class="status-line" id="st-patch" style="margin:0"></div>
  </div>

  <!-- Results -->
  <div class="results" id="results"></div>

  <div class="bottom-bar" id="bottom-bar" style="display:none">
    <button class="abtn abtn-green" onclick="downloadAll()">⬇ Download All Patched Files</button>
    <span style="font-size:11px;color:var(--muted)" id="summary-line"></span>
  </div>
</div>
</div>

<div class="toast" id="toast"></div>

<script>
// ── ELF PARSER (same as Symbol Getter) ────────────────────────────────────────
const IL2CPP_API = [
  "il2cpp_init","il2cpp_init_utf16","il2cpp_shutdown","il2cpp_set_config_dir",
  "il2cpp_set_data_dir","il2cpp_set_temp_dir","il2cpp_set_commandline_arguments",
  "il2cpp_set_commandline_arguments_utf16","il2cpp_set_config","il2cpp_class_from_il2cpp_type",
  "il2cpp_array_new_specific","il2cpp_class_from_type","il2cpp_type_get_class_or_element_class",
  "il2cpp_domain_get_assemblies","il2cpp_domain_assembly_open","il2cpp_image_get_name",
  "il2cpp_image_get_entry_point","il2cpp_image_get_class_count","il2cpp_image_get_class",
  "il2cpp_exception_from_name_msg","il2cpp_get_exception_argument_null","il2cpp_format_exception",
  "il2cpp_format_stack_trace","il2cpp_unhandled_exception","il2cpp_field_get_flags",
  "il2cpp_field_get_name","il2cpp_field_get_parent","il2cpp_field_get_type","il2cpp_field_get_value",
  "il2cpp_field_get_value_object","il2cpp_field_has_attribute","il2cpp_field_set_value",
  "il2cpp_field_static_get_value","il2cpp_field_static_set_value","il2cpp_field_get_offset",
  "il2cpp_gc_collect","il2cpp_gc_collect_a_little","il2cpp_gc_disable","il2cpp_gc_enable",
  "il2cpp_gc_is_disabled","il2cpp_gc_get_max_time_slice_ns","il2cpp_gc_set_max_time_slice_ns",
  "il2cpp_gc_get_heap_size","il2cpp_gc_get_used_size","il2cpp_gc_wbarrier_set_field",
  "il2cpp_gchandle_new","il2cpp_gchandle_new_weakref","il2cpp_gchandle_get_target",
  "il2cpp_gchandle_free","il2cpp_gchandle_foreach_get_target","il2cpp_object_header_size",
  "il2cpp_array_object_header_size","il2cpp_offset_of_array_length_in_array_object_header",
  "il2cpp_offset_of_array_bounds_in_array_object_header","il2cpp_allocation_granularity",
  "il2cpp_image_get_assembly","il2cpp_image_get_filename","il2cpp_last_error",
  "il2cpp_method_get_param","il2cpp_method_get_class","il2cpp_method_has_attribute",
  "il2cpp_method_get_flags","il2cpp_method_get_token","il2cpp_method_get_name",
  "il2cpp_method_is_generic","il2cpp_method_is_inflated","il2cpp_method_get_param_count",
  "il2cpp_method_get_generic_param_count","il2cpp_method_get_return_type",
  "il2cpp_method_get_declaring_type","il2cpp_method_get_param_name",
  "il2cpp_method_get_from_reflection","il2cpp_method_get_object","il2cpp_monitor_enter",
  "il2cpp_monitor_try_enter","il2cpp_monitor_exit","il2cpp_monitor_pulse","il2cpp_monitor_pulse_all",
  "il2cpp_monitor_wait","il2cpp_monitor_try_wait","il2cpp_object_new",
  "il2cpp_object_get_virtual_method","il2cpp_object_get_class","il2cpp_object_get_size",
  "il2cpp_object_unbox","il2cpp_value_box","il2cpp_object_destroy","il2cpp_object_new_specific",
  "il2cpp_profiler_install","il2cpp_profiler_set_events","il2cpp_profiler_install_enter_leave",
  "il2cpp_profiler_install_allocation","il2cpp_profiler_install_gc","il2cpp_profiler_install_fileio",
  "il2cpp_profiler_install_thread","il2cpp_property_get_flags","il2cpp_property_get_get_method",
  "il2cpp_property_get_set_method","il2cpp_property_get_name","il2cpp_property_get_parent",
  "il2cpp_object_get_reflection_type","il2cpp_runtime_class_init","il2cpp_runtime_object_init",
  "il2cpp_runtime_object_init_exception","il2cpp_runtime_invoke",
  "il2cpp_runtime_invoke_convert_args","il2cpp_runtime_delegate_invoke",
  "il2cpp_runtime_is_shutting_down","il2cpp_runtime_unhandled_exception_policy_set",
  "il2cpp_string_length","il2cpp_string_chars","il2cpp_string_new","il2cpp_string_new_len",
  "il2cpp_string_new_utf16","il2cpp_string_new_wrapper","il2cpp_string_intern",
  "il2cpp_string_is_interned","il2cpp_thread_current","il2cpp_thread_attach","il2cpp_thread_detach",
  "il2cpp_thread_get_all_attached_threads","il2cpp_is_vm_thread",
  "il2cpp_current_thread_walk_frame_stack","il2cpp_thread_walk_frame_stack",
  "il2cpp_current_thread_get_top_frame","il2cpp_thread_get_top_frame",
  "il2cpp_current_thread_get_frame_at","il2cpp_thread_get_frame_at",
  "il2cpp_current_thread_get_stack_depth","il2cpp_thread_get_stack_depth",
  "il2cpp_override_stack_backtrace","il2cpp_type_get_object","il2cpp_type_get_type",
  "il2cpp_type_get_name","il2cpp_type_get_assembly_qualified_name","il2cpp_type_is_byref",
  "il2cpp_type_get_attrs","il2cpp_type_equals","il2cpp_type_get_name_chunked",
  "il2cpp_array_new","il2cpp_array_new_full","il2cpp_bounded_array_class_get",
  "il2cpp_array_element_size","il2cpp_array_length","il2cpp_array_get_byte_length",
  "il2cpp_array_class_get","il2cpp_array_get","il2cpp_array_set",
  "il2cpp_class_array_element_size","il2cpp_class_element_class","il2cpp_class_enum_basetype",
  "il2cpp_class_is_generic","il2cpp_class_is_inflated","il2cpp_class_is_assignable_from",
  "il2cpp_class_is_subclass_of","il2cpp_class_has_parent","il2cpp_class_from_name",
  "il2cpp_class_from_system_type","il2cpp_class_get_element_class","il2cpp_class_get_events",
  "il2cpp_class_get_fields","il2cpp_class_get_nested_types","il2cpp_class_get_interfaces",
  "il2cpp_class_get_properties","il2cpp_class_get_property_from_name",
  "il2cpp_class_get_field_from_name","il2cpp_class_get_methods","il2cpp_class_get_method_from_name",
  "il2cpp_class_get_name","il2cpp_class_get_namespace","il2cpp_class_get_parent",
  "il2cpp_class_get_declaring_type","il2cpp_class_instance_size","il2cpp_class_num_fields",
  "il2cpp_class_is_valuetype","il2cpp_class_value_size","il2cpp_class_is_blittable",
  "il2cpp_class_get_flags","il2cpp_class_is_abstract","il2cpp_class_is_interface",
  "il2cpp_class_array_new","il2cpp_class_get_type","il2cpp_class_get_type_token",
  "il2cpp_class_has_attribute","il2cpp_class_has_references","il2cpp_class_is_enum",
  "il2cpp_class_is_null_class","il2cpp_class_get_image","il2cpp_class_get_assemblyname",
  "il2cpp_class_get_rank","il2cpp_class_get_data_size","il2cpp_class_get_static_field_data",
  "il2cpp_class_get_bitmap_size","il2cpp_class_get_bitmap","il2cpp_stats_dump_to_file",
  "il2cpp_stats_get_value","il2cpp_domain_get","il2cpp_field_set_value_object",
  "il2cpp_object_new_from_index","il2cpp_object_get_field_count","il2cpp_object_pool_get",
  "il2cpp_object_pool_return","il2cpp_config_string_to_utf8",
  "il2cpp_config_set_maximum_threads_alive","il2cpp_config_get_maximum_threads_alive",
  "il2cpp_array_set_byte_length"
];
const SKIP_RE = /^(_Z|SystemNative|Java_|pthread|__cxa|__start|__stop|NLSocket|ZStream|Flush|Dll[CG]|Globalization|JNI_|ReadEvents|mono_pal|__dynamic|__gxx|UnityAds|CloseN|CreateN)/;

function r32(b,o){return((b[o]|(b[o+1]<<8)|(b[o+2]<<16)|(b[o+3]<<24))>>>0);}
function r64(b,o){return r32(b,o+4)*0x100000000+r32(b,o);}
function r16(b,o){return b[o]|(b[o+1]<<8);}
function cstr(b,o){let s='';while(o<b.length&&b[o]!==0)s+=String.fromCharCode(b[o++]);return s;}

function extractObfSymbols(buf) {
  if(buf[0]!==0x7f||buf[1]!==0x45||buf[2]!==0x4c||buf[3]!==0x46)throw new Error('Not an ELF file');
  const is64=buf[4]===2;
  const entries=[];
  if(is64){
    const shoff=r64(buf,40),shentsz=r16(buf,58),shnum=r16(buf,60);
    const secs=[];
    for(let i=0;i<shnum;i++){const b=Number(shoff)+i*shentsz;secs.push({type:r32(buf,b+4),off:r64(buf,b+24),size:r64(buf,b+32),link:r32(buf,b+40),entsz:r64(buf,b+56)});}
    for(const s of secs){
      if(s.type!==11&&s.type!==2)continue;
      const strsec=secs[s.link];const esz=Number(s.entsz)||24;const cnt=Math.floor(Number(s.size)/esz);
      for(let j=0;j<cnt;j++){const b=Number(s.off)+j*esz;const nm=r32(buf,b);const info=buf[b+4];const shndx=r16(buf,b+6);const addr=r64(buf,b+8);const bind=info>>4;
        if(shndx!==0&&shndx!==0xfff1&&bind===1){const name=cstr(buf,Number(strsec.off)+nm);if(name&&!SKIP_RE.test(name)&&/^[A-Za-z_][A-Za-z0-9_]{2,}$/.test(name))entries.push({name,addr:Number(addr)});}}
    }
  } else {
    const shoff=r32(buf,32),shentsz=r16(buf,46),shnum=r16(buf,48);
    const secs=[];
    for(let i=0;i<shnum;i++){const b=shoff+i*shentsz;secs.push({type:r32(buf,b+4),off:r32(buf,b+16),size:r32(buf,b+20),link:r32(buf,b+24),entsz:r32(buf,b+36)});}
    for(const s of secs){
      if(s.type!==11&&s.type!==2)continue;
      const strsec=secs[s.link];const esz=s.entsz||16;const cnt=Math.floor(s.size/esz);
      for(let j=0;j<cnt;j++){const b=s.off+j*esz;const nm=r32(buf,b);const addr=r32(buf,b+4);const info=buf[b+12];const shndx=r16(buf,b+14);const bind=info>>4;
        if(shndx!==0&&shndx!==0xfff1&&bind===1){const name=cstr(buf,strsec.off+nm);if(name&&!SKIP_RE.test(name)&&/^[A-Za-z_][A-Za-z0-9_]{2,}$/.test(name))entries.push({name,addr});}}
    }
  }
  entries.sort((a,b)=>a.addr-b.addr);
  return [...new Map(entries.map(e=>[e.name,e])).values()].sort((a,b)=>a.addr-b.addr).map(e=>e.name);
}

function buildMap(syms){const map={};const len=Math.min(syms.length,IL2CPP_API.length);for(let i=0;i<len;i++)map[IL2CPP_API[i]]=syms[i];return map;}

// ── STATE ─────────────────────────────────────────────────────────────────────
let oldMap = null;   // { api_name -> old_obf_symbol }  from SymbolMap.json
let newMap = null;   // { api_name -> new_obf_symbol }  from new .so
let patchMap = null; // { old_obf_symbol -> new_obf_symbol }
let sourceFiles = []; // [{name, text, patched, replaceCount}]
let patchedBlobs = {};

// ── HELPERS ───────────────────────────────────────────────────────────────────
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.className='toast show';clearTimeout(t._h);t._h=setTimeout(()=>t.className='toast',2200);}
function setStepDone(n){const el=document.getElementById('sn'+n);el.classList.add('done');el.textContent='✓';}
function fmtSize(b){if(b<1024)return b+'B';if(b<1048576)return(b/1024).toFixed(1)+'KB';return(b/1048576).toFixed(1)+'MB';}
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ── DRAG & DROP WIRING ────────────────────────────────────────────────────────
function wireDz(dzId, handler){
  const dz=document.getElementById(dzId);
  dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('drag');});
  dz.addEventListener('dragleave',()=>dz.classList.remove('drag'));
  dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('drag');handler(e.dataTransfer.files);});
}
wireDz('dz-old', files=>loadOldMap(files[0]));
wireDz('dz-new', files=>loadNewSo(files[0]));
wireDz('dz-src', files=>addSourceFiles(files));
document.getElementById('fi-old').addEventListener('change',e=>loadOldMap(e.target.files[0]));
document.getElementById('fi-new').addEventListener('change',e=>loadNewSo(e.target.files[0]));
document.getElementById('fi-src').addEventListener('change',e=>addSourceFiles(e.target.files));

// ── STEP 1: Load source file with old symbols ───────────────────────────────
async function loadOldMap(file){
  if(!file)return;
  if(!file.name.match(/\.(ts|js)$/)){toast('Need a .ts or .js file');return;}
  try{
    const text=await file.text();
    sourceFiles=[{name:file.name,text,patched:null,replaceCount:0,size:file.size}];
    
    // Extract old symbols from: api_name: () => Il2Cpp.module.findExportByName("SYMBOL")
    oldMap={};
    const fridaRegex=/(\w+):\s*\(\)\s*=>\s*Il2Cpp\.module\.findExportByName\("([^"]+)"\)/g;
    let match;
    while((match=fridaRegex.exec(text))!==null){
      oldMap[match[1]]=match[2];
    }
    
    const cnt=Object.keys(oldMap).length;
    if(cnt===0){toast('No symbols found in file');return;}
    document.getElementById('old-ok').textContent='✓ Loaded '+cnt+' symbols from '+file.name;
    document.getElementById('old-ok').style.display='';
    document.getElementById('dz-old').classList.add('done');
    setStepDone(1);
    toast('Source file loaded: '+cnt+' symbols');
    tryBuildPatchMap();
  }catch(e){toast('Parse error: '+e.message);}
}

// ── STEP 2: Load new libil2cpp.so ────────────────────────────────────────────
async function loadNewSo(file){
  if(!file)return;
  if(!file.name.endsWith('.so')){toast('Need a .so file');return;}
  const progEl=document.getElementById('prog-so');
  const pbEl=document.getElementById('pb-so');
  const stEl=document.getElementById('st-so');
  stEl.className='status-line';
  stEl.textContent='Reading file...';
  progEl.className='progress show'; pbEl.style.width='10%';
  const buf=new Uint8Array(await file.arrayBuffer());
  pbEl.style.width='45%'; stEl.textContent='Parsing ELF...';
  let syms;
  try{syms=extractObfSymbols(buf);}catch(e){stEl.textContent='ELF error: '+e.message;stEl.className='status-line err';return;}
  pbEl.style.width='90%';
  newMap=buildMap(syms);
  const cnt=Object.keys(newMap).length;
  pbEl.style.width='100%';
  stEl.textContent='✓ Parsed '+cnt+' symbols from '+file.name;
  stEl.className='status-line ok';
  document.getElementById('new-ok').textContent='✓ '+cnt+' symbols mapped';
  document.getElementById('new-ok').style.display='';
  document.getElementById('dz-new').classList.add('done');
  setStepDone(2);
  toast('New .so loaded: '+cnt+' symbols');
  setTimeout(()=>{progEl.className='progress';},700);
  tryBuildPatchMap();
  // Auto-patch if both files loaded
  if(oldMap&&newMap&&sourceFiles.length>0){
    setTimeout(runPatch,800);
  }
}

// Build old_obf -> new_obf translation table
function tryBuildPatchMap(){
  if(!oldMap||!newMap)return;
  patchMap={};
  let hits=0;
  for(const api of Object.keys(oldMap)){
    const oldSym=oldMap[api];
    const newSym=newMap[api];
    if(oldSym&&newSym&&oldSym!==newSym){
      patchMap[oldSym]=newSym;
      hits++;
    }
  }
  document.getElementById('st-patch').textContent=hits+' symbols will be remapped';
  document.getElementById('st-patch').className='status-line ok';
}

// ── STEP 3: Source files ──────────────────────────────────────────────────────
async function addSourceFiles(fileList){
  for(const file of fileList){
    if(sourceFiles.find(f=>f.name===file.name)){toast(file.name+' already added');continue;}
    const text=await file.text();
    sourceFiles.push({name:file.name,text,patched:null,replaceCount:0,size:file.size});
  }
  if(sourceFiles.length>0)setStepDone(3);
  renderFileList();
}

function removeFile(name){
  sourceFiles=sourceFiles.filter(f=>f.name!==name);
  delete patchedBlobs[name];
  renderFileList();
  renderResults();
}

function renderFileList(){
  const list=document.getElementById('file-list');
  if(!sourceFiles.length){list.innerHTML='';return;}
  list.innerHTML=sourceFiles.map(f=>\`
    <div class="file-item">
      <span class="file-icon">📄</span>
      <span class="file-name">\${escHtml(f.name)}</span>
      <span class="file-size">\${fmtSize(f.size)}</span>
      <span class="file-status \${f.patched!==null?(f.replaceCount>0?'fs-done':'fs-skip'):'fs-pending'}">\${f.patched!==null?(f.replaceCount>0?f.replaceCount+' replaced':'No changes'):'Pending'}</span>
      <button class="file-remove" onclick="removeFile('\${f.name.replace(/'/g,"\\\\'")}')" title="Remove">✕</button>
    </div>
  \`).join('')+\`<div class="add-more" onclick="document.getElementById('fi-src').click()">＋ Add more files</div>\`;
}

// ── PATCH ─────────────────────────────────────────────────────────────────────
function runPatch(){
  const stEl=document.getElementById('st-patch');
  if(!oldMap){stEl.textContent='⚠ Load old SymbolMap.json first';stEl.className='status-line err';return;}
  if(!newMap){stEl.textContent='⚠ Load new libil2cpp.so first';stEl.className='status-line err';return;}
  if(!sourceFiles.length){stEl.textContent='⚠ Add at least one source file';stEl.className='status-line err';return;}
  if(!patchMap){tryBuildPatchMap();}

  // Sort old symbols by length descending to avoid partial replacements
  const sortedOld=Object.keys(patchMap).sort((a,b)=>b.length-a.length);
  let totalReplaced=0;
  let filesChanged=0;

  for(const f of sourceFiles){
    let content=f.text;
    let count=0;
    for(const oldSym of sortedOld){
      const newSym=patchMap[oldSym];
      // Replace all occurrences — use split/join for safety with special regex chars
      const before=content;
      // Escape special regex chars in symbol name
      const re=new RegExp(oldSym,'g');
      content=content.replace(re,()=>{count++;return newSym;});
    }
    f.patched=content;
    f.replaceCount=count;
    if(count>0){filesChanged++;totalReplaced+=count;}
    patchedBlobs[f.name]=new Blob([content],{type:'text/plain'});
  }

  renderFileList();
  renderResults();
  stEl.textContent=\`✓ Done — \${totalReplaced} replacements across \${filesChanged}/\${sourceFiles.length} files\`;
  stEl.className='status-line ok';

  const bar=document.getElementById('bottom-bar');
  const sum=document.getElementById('summary-line');
  if(filesChanged>0){
    bar.style.display='flex';
    sum.textContent=\`\${totalReplaced} symbols updated in \${filesChanged} file\${filesChanged!==1?'s':''}\`;
  }
  toast(\`Patched \${filesChanged} file\${filesChanged!==1?'s':''}!\`);
}

function renderResults(){
  const res=document.getElementById('results');
  res.innerHTML=sourceFiles.filter(f=>f.patched!==null).map(f=>\`
    <div class="res-card show">
      <div class="res-hdr">
        <span class="res-name">📄 \${escHtml(f.name)}</span>
        <span class="res-badge \${f.replaceCount>0?'rb-changed':'rb-unchanged'}">\${f.replaceCount>0?f.replaceCount+' symbols updated':'No changes'}</span>
        \${f.replaceCount>0?\`<button class="res-dl" onclick="dlFile('\${f.name.replace(/'/g,"\\\\'")}')">\${dlIcon()} Download</button>\`:''}
      </div>
      <pre class="res-preview">\${escHtml((f.patched||'').slice(0,2000)+(f.patched&&f.patched.length>2000?'\\n...':''))}</pre>
    </div>
  \`).join('');
}

function dlIcon(){return\`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>\`;}

function dlFile(name){
  const blob=patchedBlobs[name];if(!blob)return;
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();
  toast('Downloaded: '+name);
}

async function downloadAll(){
  const changed=sourceFiles.filter(f=>f.patched!==null&&f.replaceCount>0);
  if(!changed.length){toast('No changed files to download');return;}
  // Download individually if no JSZip available — stagger them
  for(let i=0;i<changed.length;i++){
    setTimeout(()=>dlFile(changed[i].name),i*300);
  }
  toast('Downloading '+changed.length+' file'+(changed.length!==1?'s':'')+'...');
}

(function tick(){document.getElementById('clock').textContent=new Date().toLocaleTimeString();setTimeout(tick,1000);})();
</script>
${BG_SCRIPT}
</body></html>`);
});

app.all("*",(req,res)=>{
  console.log(`[Unhandled] ${req.method} ${req.path}`);
  res.status(200).json({});
});
app.listen(PORT,()=>console.log(`Server running on port ${PORT}`));
