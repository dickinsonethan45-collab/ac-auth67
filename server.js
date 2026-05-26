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

setInterval(async () => {
  const threshold = Math.floor(Date.now() / 1000) + 30;
  for (const s of Object.values(sessions)) {
    if (!s.refresh_token) continue;
    if (!s.token || getExp(s.token) < threshold) await tryRefresh(s);
  }
}, 60 * 1000);

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
    fetch('/try-refresh').finally(()=>setTimeout(()=>location.reload(),2000));
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
app.all("*",(req,res)=>{
  console.log(`[Unhandled] ${req.method} ${req.path}`);
  res.status(200).json({});
});
app.listen(PORT,()=>console.log(`Server running on port ${PORT}`));
