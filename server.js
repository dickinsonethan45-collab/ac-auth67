const express = require("express");
const fs = require("fs");
const crypto = require("crypto");
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const NAKAMA_SERVER = "https://animalcompany.us-east1.nakamacloud.io";
const SERVER_KEY = "6URuTSlDKKfYbuDW";
const SESSIONS_FILE = "./sessions.json";

// sessions: { [id]: { id, name, token, refresh_token, connections } }
let sessions = {};

// ── Persistence ────────────────────────────────────────────────────────────────

function saveSessions() {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), "utf8");
  } catch (e) {
    console.log(`[Save] Failed: ${e.message}`);
  }
}

function loadSessions() {
  try {
    const raw = fs.readFileSync(SESSIONS_FILE, "utf8");
    sessions = JSON.parse(raw);
    console.log(`[Load] Loaded ${Object.keys(sessions).length} session(s) from disk.`);
  } catch {
    console.log("[Load] No sessions.json found, starting fresh.");
  }
}

// ── JWT helpers ────────────────────────────────────────────────────────────────

function getExp(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64").toString()).exp;
  } catch { return 0; }
}

function timeLeft(token) {
  if (!token) return "No token";
  const secs = getExp(token) - Math.floor(Date.now() / 1000);
  if (secs <= 0) return "EXPIRED";
  const m = Math.floor(secs / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m ${secs % 60}s`;
}

function isExpired(token) {
  if (!token) return true;
  return getExp(token) - Math.floor(Date.now() / 1000) <= 0;
}

// ── Refresh ────────────────────────────────────────────────────────────────────

async function tryRefresh(session) {
  if (!session.refresh_token) return { success: false };

  const tok = session.refresh_token;
  const attempts = [
    {
      ep: "/v2/account/session/refresh",
      auth: "Basic " + Buffer.from(`${SERVER_KEY}:`).toString("base64"),
      body: JSON.stringify({
        token: tok,
        vars: {
          authID: "9d5dca5eb2674de2a2204e31f1f7a1f8",
          clientUserAgent: "SteamFrame 1.67.3.2345_6f43a8db",
          deviceID: "a8319933d25f331503835aa71ec12f55",
          loginType: "1234",
          idType: "1234",
        },
      }),
    },
    {
      ep: "/v2/session/refresh",
      auth: "Bearer " + tok,
      body: JSON.stringify({ token: tok }),
    },
  ];

  for (const { ep, auth, body } of attempts) {
    try {
      const r = await fetch(`${NAKAMA_SERVER}${ep}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": auth,
          "User-Agent": "UnityPlayer/6000.3.12f1 (UnityWebRequest/1.0, libcurl/8.10.1-DEV)",
          "x-unity-version": "6000.3.12f1",
        },
        body,
      });
      const text = await r.text();
      console.log(`[Refresh:${session.id}] ${ep} -> ${r.status}: ${text.substring(0, 200)}`);
      if (r.status === 200) {
        const data = JSON.parse(text);
        session.token = data.token;
        session.refresh_token = data.refresh_token;
        saveSessions();
        console.log(`[Refresh:${session.id}] Success! Expires: ${new Date(getExp(data.token) * 1000).toISOString()}`);
        return { success: true, endpoint: ep };
      }
    } catch (e) {
      console.log(`[Refresh:${session.id}] ${ep} error: ${e.message}`);
    }
  }
  return { success: false };
}

// ── Startup ────────────────────────────────────────────────────────────────────

(async () => {
  loadSessions();
  for (const s of Object.values(sessions)) {
    if (s.refresh_token && isExpired(s.token)) {
      console.log(`[Startup] Refreshing session: ${s.name || s.id}`);
      await tryRefresh(s);
    }
  }
})();

// Hourly refresh loop — refresh any session whose token is expired or within 5 min
setInterval(async () => {
  const threshold = Math.floor(Date.now() / 1000) + 300;
  for (const s of Object.values(sessions)) {
    if (!s.refresh_token) continue;
    if (!s.token || getExp(s.token) < threshold) {
      console.log(`[Timer] Refreshing session: ${s.name || s.id}`);
      await tryRefresh(s);
    }
  }
}, 60 * 60 * 1000);

// ── UI ─────────────────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  const total = Object.keys(sessions).length;
  const active = Object.values(sessions).filter(s => !isExpired(s.token)).length;

  const cards = Object.values(sessions).map(s => {
    const tkExp = timeLeft(s.token);
    const rfExp = timeLeft(s.refresh_token);
    const connUrl = `${req.protocol}://${req.get("host")}/v2/account/authenticate/custom/${s.id}`;
    return `
<div class="card" id="card-${s.id}">
  <div class="card-header">
    <span class="folder-icon">📁</span>
    <span class="session-name">${escHtml(s.name || s.id)}</span>
    <button class="btn-sm btn-copy" onclick="copyText('${s.id}')">Copy ID</button>
    <button class="btn-sm btn-copy" onclick="copyText('${connUrl}')">Copy URL</button>
  </div>
  <div class="card-meta">
    <div><b>ID:</b> <code>${s.id}</code></div>
    <div><b>URL:</b> <code>${connUrl}</code></div>
    <div><b>Token:</b> ${tkExp} &nbsp;|&nbsp; <b>Refresh:</b> ${rfExp}</div>
    <div><b>Connections:</b> ${s.connections || 0}</div>
  </div>
  <div class="token-box">${escHtml(s.token || "")}</div>
  <div class="token-box">${escHtml(s.refresh_token || "")}</div>
  <div class="card-actions">
    <form method="POST" action="/session/${s.id}/update" style="display:inline">
      <input type="hidden" name="_from" value="ui">
      <textarea name="token" placeholder="Token" rows="2" style="width:100%;margin-bottom:4px;background:#1a1a1a;color:#fff;border:1px solid #333;padding:6px;font-family:monospace;font-size:10px;">${escHtml(s.token || "")}</textarea>
      <textarea name="refresh_token" placeholder="Refresh Token" rows="2" style="width:100%;margin-bottom:6px;background:#1a1a1a;color:#fff;border:1px solid #333;padding:6px;font-family:monospace;font-size:10px;">${escHtml(s.refresh_token || "")}</textarea>
      <button type="submit" class="btn-action">Update Tokens</button>
    </form>
    <form method="POST" action="/session/${s.id}/refresh" style="display:inline">
      <button type="submit" class="btn-action btn-orange">Refresh</button>
    </form>
    <form method="POST" action="/session/${s.id}/rename" style="display:inline">
      <input name="name" placeholder="New name" style="background:#1a1a1a;color:#fff;border:1px solid #333;padding:5px;font-family:monospace;">
      <button type="submit" class="btn-action">Rename</button>
    </form>
    <form method="POST" action="/session/${s.id}/delete" style="display:inline" onsubmit="return confirm('Delete this session?')">
      <button type="submit" class="btn-action btn-red">Delete</button>
    </form>
  </div>
</div>`;
  }).join("\n");

  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>AC Auth Backend - Session Manager</title>
  <style>
    body { font-family: monospace; background: #0d0d0d; color: #00ff88; padding: 30px; max-width: 900px; margin: 0 auto; }
    h1 { color: #00ff88; margin-bottom: 5px; }
    .summary { background: #1a1a1a; padding: 12px 16px; border-left: 3px solid #00ff88; margin-bottom: 20px; }
    .card { background: #111; border: 1px solid #222; border-radius: 6px; padding: 16px; margin-bottom: 16px; }
    .card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 15px; font-weight: bold; }
    .card-meta { font-size: 12px; color: #aaa; margin-bottom: 8px; line-height: 1.8; }
    .card-meta code { color: #00ff88; font-size: 11px; }
    .token-box { background: #0a0a0a; border: 1px solid #1e1e1e; padding: 6px 8px; font-size: 10px; word-break: break-all; margin-bottom: 4px; color: #888; border-radius: 3px; max-height: 38px; overflow: hidden; }
    .card-actions { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; align-items: flex-start; }
    .btn-sm { background: #1e1e1e; color: #00ff88; border: 1px solid #00ff88; padding: 3px 10px; cursor: pointer; font-size: 11px; border-radius: 3px; }
    .btn-action { background: #00ff88; color: #000; border: none; padding: 6px 14px; cursor: pointer; font-weight: bold; font-size: 12px; border-radius: 3px; }
    .btn-orange { background: #ff8800; }
    .btn-red { background: #ff3333; color: #fff; }
    .btn-blue { background: #0088ff; color: #fff; }
    .global-actions { margin-bottom: 20px; display: flex; gap: 10px; flex-wrap: wrap; }
    .search-bar { background: #1a1a1a; color: #fff; border: 1px solid #333; padding: 8px 12px; font-family: monospace; font-size: 13px; width: 220px; border-radius: 3px; }
    .create-form { background: #111; border: 1px solid #222; border-radius: 6px; padding: 16px; margin-bottom: 20px; }
    .create-form input, .create-form textarea { background: #1a1a1a; color: #fff; border: 1px solid #333; padding: 7px; font-family: monospace; font-size: 11px; width: 100%; margin-bottom: 8px; box-sizing: border-box; border-radius: 3px; }
    label { display: block; color: #aaa; font-size: 11px; margin-bottom: 3px; }
  </style>
</head>
<body>
  <h1>AC Auth Backend - Session Manager</h1>
  <div class="summary">
    <b>Total Sessions:</b> ${total} &nbsp;&nbsp;
    <b>Active Connections:</b> ${active} &nbsp;&nbsp;
    <b>Collision Detection:</b> ✅ Active
  </div>

  <div class="global-actions">
    <input class="search-bar" type="text" placeholder="🔍 Search" oninput="filterCards(this.value)">
    <button class="btn-action" onclick="document.getElementById('create-form').style.display=document.getElementById('create-form').style.display==='none'?'block':'none'">+ Create Session</button>
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
    function copyText(t) { navigator.clipboard.writeText(t); }
    function filterCards(q) {
      document.querySelectorAll('.card').forEach(c => {
        c.style.display = c.innerText.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
      });
    }
  </script>
</body>
</html>`);
});

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Session CRUD ───────────────────────────────────────────────────────────────

app.post("/session/create", (req, res) => {
  const id = crypto.randomBytes(8).toString("hex");
  const { name, token, refresh_token } = req.body;
  sessions[id] = { id, name: name || id, token: token?.trim() || "", refresh_token: refresh_token?.trim() || "", connections: 0 };
  saveSessions();
  console.log(`[Create] Session ${id} (${name})`);
  res.redirect("/");
});

app.post("/session/:id/update", (req, res) => {
  const s = sessions[req.params.id];
  if (!s) return res.status(404).json({ error: "Not found" });
  if (req.body.token) s.token = req.body.token.trim();
  if (req.body.refresh_token) s.refresh_token = req.body.refresh_token.trim();
  saveSessions();
  console.log(`[Update] Session ${s.id}`);
  req.body._from === "ui" ? res.redirect("/") : res.json({ ok: true });
});

app.post("/session/:id/rename", (req, res) => {
  const s = sessions[req.params.id];
  if (!s) return res.status(404).json({ error: "Not found" });
  s.name = req.body.name?.trim() || s.name;
  saveSessions();
  res.redirect("/");
});

app.post("/session/:id/refresh", async (req, res) => {
  const s = sessions[req.params.id];
  if (!s) return res.status(404).json({ error: "Not found" });
  await tryRefresh(s);
  res.redirect("/");
});

app.post("/session/:id/delete", (req, res) => {
  delete sessions[req.params.id];
  saveSessions();
  res.redirect("/");
});

app.post("/refresh-all", async (req, res) => {
  for (const s of Object.values(sessions)) await tryRefresh(s);
  res.redirect("/");
});

app.post("/clean-duplicates", (req, res) => {
  const seen = new Map();
  for (const [id, s] of Object.entries(sessions)) {
    const key = s.refresh_token || id;
    if (seen.has(key)) {
      delete sessions[id];
      console.log(`[Clean] Removed duplicate session ${id}`);
    } else {
      seen.set(key, id);
    }
  }
  saveSessions();
  res.redirect("/");
});

// ── API endpoints (used by mods/clients) ───────────────────────────────────────

// POST /v2/account/authenticate/custom/:client — returns tokens for that session ID
app.post("/v2/account/authenticate/custom/:client", (req, res) => {
  const s = sessions[req.params.client];
  console.log(`[Auth] client=${req.params.client} found=${!!s}`);
  if (s) {
    s.connections = (s.connections || 0) + 1;
    saveSessions();
    return res.json({ token: s.token, refresh_token: s.refresh_token, created: false });
  }
  // fallback: return first session if any
  const first = Object.values(sessions)[0];
  if (first) return res.json({ token: first.token, refresh_token: first.refresh_token, created: false });
  res.json({ token: "", refresh_token: "", created: false });
});

// POST /v2/account/authenticate/refresh
app.post("/v2/account/authenticate/refresh", (req, res) => {
  const first = Object.values(sessions)[0];
  res.json({ token: first?.token || "", refresh_token: first?.refresh_token || "", created: false });
});

// GET /v2/account — proxy to Nakama with first valid session token
app.get("/v2/account", async (req, res) => {
  const s = Object.values(sessions).find(s => !isExpired(s.token));
  if (!s) return res.status(401).json({ error: "No valid session" });
  try {
    const upstream = await fetch(`${NAKAMA_SERVER}/v2/account`, {
      headers: { "Authorization": `Bearer ${s.token}` },
    });
    res.json(await upstream.json());
  } catch (e) {
    res.status(500).json({});
  }
});

// Legacy single-session JSON update
app.post("/update-tokens", (req, res) => {
  const { token, refresh_token, id } = req.body;
  if (!token || !refresh_token) return res.status(400).json({ error: "token and refresh_token required" });
  const target = (id && sessions[id]) ? sessions[id] : Object.values(sessions)[0];
  if (!target) return res.status(404).json({ error: "No session found" });
  target.token = token;
  target.refresh_token = refresh_token;
  saveSessions();
  res.json({ ok: true });
});

app.get("/try-refresh", async (req, res) => {
  const results = {};
  for (const s of Object.values(sessions)) {
    results[s.id] = await tryRefresh(s);
  }
  res.json(results);
});

app.all("*", (req, res) => {
  console.log(`[Unhandled] ${req.method} ${req.path}`);
  res.status(200).json({});
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
