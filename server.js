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

  const cards = Object.values(sessions).map((s, i) => {
    const expired = isExpired(s.token);
    const connUrl = `https://${req.get("host")}/v2/account/authenticate/custom/${s.id}`;
    const tokenExp = getExp(s.token);
    const refreshExp = getExp(s.refresh_token);
    const now = Math.floor(Date.now() / 1000);
    const tokenSecs = Math.max(0, tokenExp - now);
    const refreshSecs = Math.max(0, refreshExp - now);
    const pct = (v, m) => Math.min(100, v/m*100).toFixed(2);
    const initials = (s.name||s.id).slice(0,2).toUpperCase();
    return `<div class="card${expired?' card-dead':''}" id="card-${s.id}" style="animation-delay:${i*70}ms">
  <div class="card-left">
    <div class="avatar${expired?' av-dead':''}">${initials}</div>
    <div class="side-timers">
      <div class="st-box${tokenSecs<300?' st-warn':''}">
        <div class="st-lbl">TOKEN</div>
        <div class="st-val${tokenSecs<300?' stv-warn':''}" id="tk-${s.id}" data-exp="${tokenExp}" data-max="3600">${timeLeft(s.token)}</div>
        <div class="st-track"><div class="st-fill${tokenSecs<300?' stf-warn':''}" id="tb-${s.id}" style="width:${pct(tokenSecs,3600)}%"></div></div>
      </div>
      <div class="st-box">
        <div class="st-lbl">REFRESH</div>
        <div class="st-val stv-ref" id="rk-${s.id}" data-exp="${refreshExp}" data-max="21600">${timeLeft(s.refresh_token)}</div>
        <div class="st-track"><div class="st-fill stf-ref" id="rb-${s.id}" style="width:${pct(refreshSecs,21600)}%"></div></div>
      </div>
    </div>
  </div>
  <div class="card-right">
    <div class="card-top-row">
      <div class="name-block">
        <div class="badge${expired?' badge-dead':''}"><span class="bdot"></span>${expired?'EXPIRED':'ACTIVE'}</div>
        <div class="cname">${escHtml(s.name||s.id)}</div>
        <div class="cid hideable">${s.id}</div>
      </div>
      <div class="top-actions">
        <div class="conn-pill">${s.connections||0} conn</div>
        <button class="sm-btn" onclick="copy('${s.id}','ID copied')">ID</button>
        <button class="sm-btn" onclick="copy('${connUrl}','URL copied')">URL</button>
      </div>
    </div>
    <div class="tok-section">
      <div class="tok-row"><span class="tok-lbl">TOKEN</span><div class="tok-val hideable" onclick="copy('${escHtml(s.token||'')}','Token copied!')">${escHtml(s.token||'—')}</div></div>
      <div class="tok-row"><span class="tok-lbl">REFRESH</span><div class="tok-val hideable" onclick="copy('${escHtml(s.refresh_token||'')}','Refresh copied!')">${escHtml(s.refresh_token||'—')}</div></div>
    </div>
    <div class="card-footer">
      <form method="POST" action="/session/${s.id}/update" style="display:flex;gap:6px;flex:1;flex-wrap:wrap">
        <input type="hidden" name="_from" value="ui">
        <textarea class="tok-input" name="token" rows="1" placeholder="New token…">${escHtml(s.token||'')}</textarea>
        <textarea class="tok-input" name="refresh_token" rows="1" placeholder="New refresh token…">${escHtml(s.refresh_token||'')}</textarea>
        <button type="submit" class="fbtn fbtn-purple">Update</button>
      </form>
      <div class="footer-right">
        <form method="POST" action="/session/${s.id}/refresh" style="display:inline"><button type="submit" class="fbtn fbtn-orange">Refresh</button></form>
        <form method="POST" action="/session/${s.id}/rename" style="display:inline-flex;gap:5px;align-items:center"><input class="rname-input" name="name" placeholder="Rename…"><button type="submit" class="fbtn fbtn-ghost">→</button></form>
        <form method="POST" action="/session/${s.id}/delete" style="display:inline" onsubmit="return confirm('Delete ${escHtml(s.name||s.id)}?')"><button type="submit" class="fbtn fbtn-del">Delete</button></form>
      </div>
    </div>
  </div>
</div>`;
  }).join('');

  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>AC Auth</title>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --accent:#9d5cff;--accent2:#ff4d9e;--cyan:#00cfff;--green:#00e676;--orange:#ff6b35;
  --bg:#07050f;--surface:rgba(255,255,255,0.03);--surface2:rgba(255,255,255,0.055);
  --border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.12);
  --text:#f0eaff;--muted:rgba(200,185,240,0.4);--mono:'Geist Mono',monospace;
}
html,body{min-height:100%;background:var(--bg);font-family:'Geist',sans-serif;color:var(--text);-webkit-font-smoothing:antialiased}
#bg{position:fixed;inset:0;z-index:0;pointer-events:none}
.wrap{position:relative;z-index:1;max-width:1100px;margin:0 auto;padding:0 0 100px}

/* ── NAV ── */
nav{display:flex;align-items:center;gap:16px;padding:16px 32px;border-bottom:1px solid var(--border);background:rgba(7,5,15,0.85);backdrop-filter:blur(32px);position:sticky;top:0;z-index:200}
.nav-brand{font-size:13px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#fff}
.nav-brand b{color:var(--accent)}
.nav-sep{width:1px;height:16px;background:var(--border)}
.nav-tag{font-size:10px;color:var(--muted);letter-spacing:.5px}
.nav-live{display:flex;align-items:center;gap:5px}
.nav-dot{width:5px;height:5px;border-radius:50%;background:var(--green);animation:dp 2s ease-in-out infinite}
@keyframes dp{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(0,230,118,.5)}70%{opacity:.7;box-shadow:0 0 0 4px rgba(0,230,118,0)}}
.nav-live-t{font-size:9px;font-weight:600;color:var(--green);letter-spacing:1.5px;text-transform:uppercase}
.nav-by{font-size:10px;color:var(--muted);border-left:1px solid var(--border);padding-left:16px}
.nav-by strong{color:var(--accent);font-weight:600}
.nav-r{margin-left:auto;display:flex;align-items:center;gap:10px}
.nav-clock{font-size:11px;font-family:var(--mono);color:rgba(157,92,255,.6);padding:5px 10px;background:rgba(157,92,255,.06);border:1px solid rgba(157,92,255,.12);border-radius:6px;letter-spacing:.5px}

/* ── METRICS ── */
.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:28px 32px 0}
.metric{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:22px 24px;position:relative;overflow:hidden;transition:border-color .2s,transform .2s;cursor:default}
.metric:hover{border-color:rgba(157,92,255,.25);transform:translateY(-2px)}
.metric::before{content:'';position:absolute;top:0;left:24px;right:24px;height:1px;background:linear-gradient(90deg,transparent,var(--accent),transparent);opacity:.4}
.metric-val{font-size:48px;font-weight:300;color:#fff;font-variant-numeric:tabular-nums;font-family:var(--mono);line-height:1;letter-spacing:-2px}
.metric-val b{font-size:16px;color:var(--accent);font-weight:500;letter-spacing:0;margin-left:4px;vertical-align:super}
.metric-lbl{font-size:9px;font-weight:500;letter-spacing:2.5px;text-transform:uppercase;color:var(--muted);margin-top:8px}

/* ── TOOLBAR ── */
.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:22px 32px}
.search-box{flex:0 0 220px;background:var(--surface);border:1px solid var(--border);color:var(--text);padding:10px 14px;font-family:'Geist',sans-serif;font-size:12px;border-radius:10px;outline:none;transition:border-color .2s}
.search-box:focus{border-color:rgba(157,92,255,.4)}
.search-box::placeholder{color:var(--muted)}
.btn{border:none;padding:9px 18px;cursor:pointer;font-weight:500;font-size:11px;border-radius:9px;font-family:'Geist',sans-serif;transition:all .15s;letter-spacing:.3px;white-space:nowrap}
.btn:hover{transform:translateY(-1px)}
.btn:active{transform:none}
.btn-primary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;box-shadow:0 2px 16px rgba(157,92,255,.3)}
.btn-primary:hover{box-shadow:0 4px 24px rgba(157,92,255,.5)}
.btn-orange{background:linear-gradient(135deg,var(--orange),#e53935);color:#fff;box-shadow:0 2px 12px rgba(255,107,53,.25)}
.btn-ghost{background:transparent;color:var(--accent);border:1px solid rgba(157,92,255,.2)}
.btn-ghost:hover{background:rgba(157,92,255,.08);border-color:rgba(157,92,255,.35)}
.btn-ghost.on{background:rgba(157,92,255,.1)}
.btn-cyan{background:transparent;color:var(--cyan);border:1px solid rgba(0,207,255,.2)}
.btn-cyan:hover{background:rgba(0,207,255,.06)}

/* ── CREATE PANEL ── */
.cpanel{margin:0 32px 16px;background:rgba(157,92,255,.04);border:1px solid rgba(157,92,255,.15);border-radius:16px;padding:22px;display:none}
.cpanel label{display:block;font-size:9px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:5px}
.cpanel input,.cpanel textarea{background:rgba(0,0,0,.35);color:#fff;border:1px solid var(--border);padding:10px 12px;font-family:var(--mono);font-size:11px;width:100%;margin-bottom:12px;border-radius:9px;outline:none;resize:vertical;transition:border-color .2s}
.cpanel input:focus,.cpanel textarea:focus{border-color:rgba(157,92,255,.4)}

/* ── CARDS ── */
#cards{padding:0 32px;display:flex;flex-direction:column;gap:12px}
.card{display:flex;gap:0;border-radius:18px;overflow:hidden;background:rgba(13,8,26,0.9);border:1px solid var(--border);transition:border-color .25s,box-shadow .25s;animation:fadeUp .4s ease both}
@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.card:hover{border-color:rgba(157,92,255,.22);box-shadow:0 12px 48px rgba(0,0,0,.5),0 0 0 1px rgba(157,92,255,.06)}
.card-dead{opacity:.5}
.card-dead:hover{border-color:rgba(255,255,255,.08)!important;box-shadow:none!important}

/* Left panel */
.card-left{display:flex;flex-direction:column;align-items:center;gap:16px;padding:22px 18px;background:rgba(157,92,255,.03);border-right:1px solid var(--border);width:130px;flex-shrink:0}
.avatar{width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:600;color:#fff;letter-spacing:-.5px;flex-shrink:0;box-shadow:0 4px 20px rgba(157,92,255,.35)}
.av-dead{background:linear-gradient(135deg,#2a2a2a,#1a1a1a);box-shadow:none}
.side-timers{width:100%;display:flex;flex-direction:column;gap:10px}
.st-box{padding:10px 10px 8px;background:rgba(0,0,0,.3);border:1px solid var(--border);border-radius:10px;transition:border-color .3s}
.st-warn{border-color:rgba(255,107,53,.3);background:rgba(255,107,53,.04)}
.st-lbl{font-size:7px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:5px}
.st-val{font-size:15px;font-weight:600;font-family:var(--mono);background:linear-gradient(90deg,var(--accent),var(--cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1;margin-bottom:6px;letter-spacing:-.5px}
.stv-warn{background:linear-gradient(90deg,var(--orange),#e53935);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.stv-ref{background:linear-gradient(90deg,var(--cyan),var(--green));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.st-track{height:2px;background:rgba(255,255,255,.05);border-radius:2px;overflow:hidden}
.st-fill{height:2px;border-radius:2px;background:linear-gradient(90deg,var(--accent),var(--cyan))}
.stf-warn{background:linear-gradient(90deg,var(--orange),#e53935)}
.stf-ref{background:linear-gradient(90deg,var(--cyan),var(--green))}

/* Right panel */
.card-right{flex:1;display:flex;flex-direction:column;min-width:0}
.card-top-row{display:flex;align-items:flex-start;gap:12px;padding:18px 20px 14px;border-bottom:1px solid rgba(255,255,255,.04)}
.name-block{flex:1;min-width:0}
.badge{display:inline-flex;align-items:center;gap:5px;font-size:8px;font-weight:600;letter-spacing:2px;padding:3px 9px;border-radius:4px;background:rgba(157,92,255,.1);color:var(--accent);border:1px solid rgba(157,92,255,.2);margin-bottom:7px;text-transform:uppercase}
.badge-dead{background:rgba(80,80,80,.08);color:#555;border-color:rgba(80,80,80,.15)}
.bdot{width:4px;height:4px;border-radius:50%;background:currentColor;animation:dp 1.8s ease-in-out infinite}
.badge-dead .bdot{animation:none}
.cname{font-size:18px;font-weight:600;color:#fff;letter-spacing:-.4px;line-height:1.1;margin-bottom:4px}
.cid{font-size:9px;font-family:var(--mono);color:rgba(157,92,255,.3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.top-actions{display:flex;align-items:center;gap:6px;flex-shrink:0}
.conn-pill{font-size:10px;font-weight:600;color:var(--cyan);background:rgba(0,207,255,.08);border:1px solid rgba(0,207,255,.15);border-radius:6px;padding:4px 10px;font-family:var(--mono)}
.sm-btn{background:rgba(255,255,255,.03);color:rgba(157,92,255,.5);border:1px solid rgba(255,255,255,.06);padding:5px 11px;border-radius:6px;font-size:9px;font-family:'Geist',sans-serif;font-weight:500;cursor:pointer;transition:all .15s;letter-spacing:1px;text-transform:uppercase}
.sm-btn:hover{background:rgba(157,92,255,.1);color:var(--accent);border-color:rgba(157,92,255,.25)}

/* Token section */
.tok-section{padding:12px 20px;display:flex;flex-direction:column;gap:7px;border-bottom:1px solid rgba(255,255,255,.04)}
.tok-row{display:flex;align-items:flex-start;gap:10px}
.tok-lbl{font-size:8px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:var(--muted);white-space:nowrap;padding-top:5px;width:52px;flex-shrink:0}
.tok-val{flex:1;background:rgba(0,0,0,.3);border:1px solid rgba(157,92,255,.07);padding:7px 10px;font-size:9px;word-break:break-all;color:rgba(157,92,255,.22);border-radius:8px;font-family:var(--mono);line-height:1.6;cursor:pointer;transition:all .18s;min-width:0}
.tok-val:hover{border-color:rgba(157,92,255,.25);color:rgba(157,92,255,.5);background:rgba(157,92,255,.04)}
.tok-val.blurred,.hideable.blurred{filter:blur(5px);user-select:none}

/* Card footer */
.card-footer{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start;padding:12px 20px;background:rgba(0,0,0,.15)}
.tok-input{background:rgba(0,0,0,.35);color:rgba(220,205,255,.7);border:1px solid var(--border);padding:7px 10px;font-family:var(--mono);font-size:9px;flex:1;min-width:140px;border-radius:8px;resize:none;outline:none;transition:border-color .2s}
.tok-input:focus{border-color:rgba(157,92,255,.3)}
.fbtn{border:none;padding:7px 14px;cursor:pointer;font-weight:500;font-size:10px;border-radius:7px;font-family:'Geist',sans-serif;transition:all .15s;white-space:nowrap;letter-spacing:.2px}
.fbtn:hover{transform:translateY(-1px)}
.fbtn-purple{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff}
.fbtn-orange{background:linear-gradient(135deg,var(--orange),#e53935);color:#fff}
.fbtn-ghost{background:rgba(157,92,255,.08);color:var(--accent);border:1px solid rgba(157,92,255,.2)}
.fbtn-del{background:rgba(229,57,53,.08);color:#ff5252;border:1px solid rgba(229,57,53,.15)}
.fbtn-del:hover{background:rgba(229,57,53,.15)}
.footer-right{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-left:auto}
.rname-input{background:rgba(255,255,255,.03);color:#fff;border:1px solid var(--border);padding:6px 10px;border-radius:7px;font-family:'Geist',sans-serif;font-size:11px;outline:none;width:110px;transition:border-color .2s}
.rname-input:focus{border-color:rgba(157,92,255,.3)}

/* Toast */
.toast{position:fixed;bottom:24px;right:24px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;padding:10px 20px;border-radius:10px;font-size:11px;font-weight:600;z-index:999;opacity:0;transform:translateY(8px);transition:all .2s;pointer-events:none;letter-spacing:.2px;box-shadow:0 8px 24px rgba(157,92,255,.4)}
.toast.show{opacity:1;transform:none}
</style></head><body>
<canvas id="bg"></canvas>
<div class="wrap">

<nav>
  <div class="nav-brand"><b>AC</b>AUTH</div>
  <div class="nav-sep"></div>
  <div class="nav-tag">Session Manager</div>
  <div class="nav-live"><div class="nav-dot"></div><div class="nav-live-t">Live</div></div>
  <div class="nav-by">by <strong>Lunar3HP</strong></div>
  <div class="nav-r">
    <div class="nav-clock" id="clock"></div>
    <form method="POST" action="/logout" style="display:inline">
      <button type="submit" class="btn btn-ghost" style="font-size:10px;padding:6px 14px">Sign Out</button>
    </form>
  </div>
</nav>

<div class="metrics">
  <div class="metric"><div class="metric-val">${total}</div><div class="metric-lbl">Total Sessions</div></div>
  <div class="metric"><div class="metric-val">${active}<b>live</b></div><div class="metric-lbl">Active Now</div></div>
  <div class="metric"><div class="metric-val">${totalConns}</div><div class="metric-lbl">Total Connections</div></div>
</div>

<div class="toolbar">
  <input class="search-box" type="text" placeholder="Search sessions…" oninput="filterCards(this.value)">
  <button class="btn btn-primary" onclick="toggleCreate()">+ New Session</button>
  <form method="POST" action="/refresh-all" style="display:inline"><button type="submit" class="btn btn-orange">Refresh All</button></form>
  <form method="POST" action="/clean-duplicates" style="display:inline"><button type="submit" class="btn btn-cyan">Clean Dupes</button></form>
  <button id="blurBtn" class="btn btn-ghost" onclick="toggleBlur()">Hide Tokens</button>
</div>

<div id="create-panel" class="cpanel">
  <form method="POST" action="/session/create">
    <label>Name (optional)</label><input name="name" placeholder="e.g. MyAccount">
    <label>Token</label><textarea name="token" rows="2" placeholder="Paste token…"></textarea>
    <label>Refresh Token</label><textarea name="refresh_token" rows="2" placeholder="Paste refresh token…"></textarea>
    <button type="submit" class="btn btn-primary">Create Session</button>
  </form>
</div>

<div id="cards">${cards}</div>
</div>
<div class="toast" id="toast"></div>

<script>
let blurred=false;
function toggleBlur(){
  blurred=!blurred;
  document.querySelectorAll('.tok-val,.hideable').forEach(e=>e.classList.toggle('blurred',blurred));
  document.querySelectorAll('.tok-input').forEach(e=>{e.style.filter=blurred?'blur(4px)':'';e.style.userSelect=blurred?'none':'';});
  const b=document.getElementById('blurBtn');b.textContent=blurred?'Show Tokens':'Hide Tokens';b.classList.toggle('on',blurred);
}
function copy(t,msg){
  navigator.clipboard.writeText(t);
  const el=document.getElementById('toast');el.textContent=msg||'Copied!';el.classList.add('show');
  clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),1800);
}
function filterCards(q){
  const lq=q.toLowerCase();
  document.querySelectorAll('.card').forEach(c=>c.style.display=c.innerText.toLowerCase().includes(lq)?'':'none');
}
function toggleCreate(){
  const p=document.getElementById('create-panel');p.style.display=p.style.display==='block'?'none':'block';
}
function fmt(s){
  if(s<=0)return'EXP';
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=s%60;
  if(h>0)return h+'h '+m+'m';
  return String(m).padStart(2,'0')+':'+String(sc).padStart(2,'0');
}
setInterval(()=>{
  const now=Math.floor(Date.now()/1000);
  let anyExpired=false;
  document.querySelectorAll('.st-val').forEach(el=>{
    const exp=parseInt(el.dataset.exp);
    const s=Math.max(0,exp-now);
    el.textContent=fmt(s);
    const max=parseInt(el.dataset.max)||3600;
    const bid=el.id.replace('tk-','tb-').replace('rk-','rb-');
    const bar=document.getElementById(bid);
    if(bar)bar.style.width=Math.max(0,Math.min(100,s/max*100)).toFixed(2)+'%';
    if(s<300&&el.id.startsWith('tk-')){
      el.classList.add('stv-warn');el.classList.remove('stv-ref');
      if(bar){bar.classList.add('stf-warn');bar.classList.remove('stf-ref');}
      const box=el.closest('.st-box');if(box)box.classList.add('st-warn');
    }
    if(s<=0&&el.id.startsWith('tk-'))anyExpired=true;
  });
  if(anyExpired)setTimeout(()=>location.reload(),3000);
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
