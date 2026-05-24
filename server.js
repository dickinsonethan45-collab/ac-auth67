const express = require("express");
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const NAKAMA_SERVER = "https://animalcompany.us-east1.nakamacloud.io";
const SERVER_KEY = "RuTSlDKKfYbuDW";

let session = {
  token: "",
  refresh_token: "",
};

function getExp(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    return payload.exp;
  } catch { return 0; }
}

function timeLeft(token) {
  const secs = getExp(token) - Math.floor(Date.now() / 1000);
  if (secs <= 0) return "EXPIRED";
  const m = Math.floor(secs / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m ${secs % 60}s`;
}

async function tryRefresh() {
  const endpoints = [
    "/v2/session/refresh",
    "/v2/account/authenticate/refresh",
  ];
  for (const ep of endpoints) {
    try {
      const r = await fetch(`${NAKAMA_SERVER}${ep}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Basic " + Buffer.from(`${SERVER_KEY}:`).toString("base64"),
          "User-Agent": "UnityPlayer/6000.3.12f1 (UnityWebRequest/1.0, libcurl/8.10.0-DEV)",
          "x-unity-version": "6000.3.12f1",
        },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      const text = await r.text();
      console.log(`[Refresh] ${ep} -> ${r.status}: ${text.substring(0, 200)}`);
      if (r.status === 200) {
        const data = JSON.parse(text);
        session.token = data.token;
        session.refresh_token = data.refresh_token;
        console.log(`[Refresh] Success! Token expires: ${new Date(getExp(data.token) * 1000).toISOString()}`);
        return { success: true, endpoint: ep };
      }
    } catch(e) {
      console.log(`[Refresh] ${ep} error: ${e.message}`);
    }
  }
  return { success: false };
}

// Auto refresh every 50 mins
setInterval(async () => {
  if (!session.refresh_token) return;
  console.log("[Timer] Auto-refreshing...");
  await tryRefresh();
}, 50 * 60 * 1000);

// Webpage
app.get("/", (req, res) => {
  const exp = session.token ? timeLeft(session.token) : "No token set";
  const refExp = session.refresh_token ? timeLeft(session.refresh_token) : "No token set";
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>AC Auth Backend</title>
  <style>
    body { font-family: monospace; background: #0d0d0d; color: #00ff88; padding: 30px; }
    h1 { color: #00ff88; }
    textarea { width: 100%; height: 80px; background: #1a1a1a; color: #fff; border: 1px solid #333; padding: 10px; font-family: monospace; font-size: 11px; }
    button { background: #00ff88; color: #000; border: none; padding: 10px 30px; cursor: pointer; font-size: 16px; margin-top: 10px; font-weight: bold; margin-right: 10px; }
    .status { background: #1a1a1a; padding: 15px; margin-bottom: 20px; border-left: 3px solid #00ff88; }
    label { display: block; margin-top: 15px; margin-bottom: 5px; color: #aaa; }
  </style>
</head>
<body>
  <h1>AC Auth Backend</h1>
  <div class="status">
    <div>Token expires in: <b>${exp}</b></div>
    <div>Refresh token expires in: <b>${refExp}</b></div>
  </div>
  <form method="POST" action="/update-tokens-form">
    <label>Token:</label>
    <textarea name="token" placeholder="Paste token here...">${session.token}</textarea>
    <label>Refresh Token:</label>
    <textarea name="refresh_token" placeholder="Paste refresh_token here...">${session.refresh_token}</textarea>
    <br>
    <button type="submit">Update Tokens</button>
  </form>
  <br>
  <form method="POST" action="/do-refresh">
    <button type="submit" style="background:#ff8800">Try Auto-Refresh</button>
  </form>
</body>
</html>
  `);
});

// Form submission
app.post("/update-tokens-form", (req, res) => {
  const { token, refresh_token } = req.body;
  if (token) session.token = token.trim();
  if (refresh_token) session.refresh_token = refresh_token.trim();
  console.log(`[Update] Tokens updated via webpage.`);
  res.redirect("/");
});

// Try refresh button
app.post("/do-refresh", async (req, res) => {
  const result = await tryRefresh();
  res.redirect("/");
});

// Test refresh endpoint
app.get("/try-refresh", async (req, res) => {
  const result = await tryRefresh();
  res.json(result);
});

// JSON update endpoint
app.post("/update-tokens", (req, res) => {
  const { token, refresh_token } = req.body;
  if (!token || !refresh_token) return res.status(400).json({ error: "token and refresh_token required" });
  session.token = token;
  session.refresh_token = refresh_token;
  console.log(`[Update] Tokens updated via API.`);
  res.json({ ok: true });
});

// POST /v2/account/authenticate/custom/:client
app.post("/v2/account/authenticate/custom/:client", (req, res) => {
  console.log(`[Auth] client=${req.params.client}`);
  res.json({ token: session.token, refresh_token: session.refresh_token, created: false });
});

// POST /v2/account/authenticate/refresh
app.post("/v2/account/authenticate/refresh", (req, res) => {
  res.json({ token: session.token, refresh_token: session.refresh_token, created: false });
});

// GET /v2/account
app.get("/v2/account", async (req, res) => {
  try {
    const upstream = await fetch(`${NAKAMA_SERVER}/v2/account`, {
      headers: { "Authorization": `Bearer ${session.token}` },
    });
    const data = await upstream.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({});
  }
});

app.all("*", (req, res) => {
  console.log(`[Unhandled] ${req.method} ${req.path}`);
  res.status(200).json({});
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
