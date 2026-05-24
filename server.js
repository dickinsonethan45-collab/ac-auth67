const express = require("express");
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const NAKAMA_SERVER = "https://animalcompany.us-east1.nakamacloud.io";
const SERVER_KEY = "RuTSlDKKfYbuDW";

let session = {
  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWQiOiJjMTE2MWI0ZC0yYjM3LTQwZDAtOTczZS05NDEzZjQ3OTk0NzciLCJ1aWQiOiI2YzkxYWM0Ni00ZGEzLTRhMTktYjlhZi1hZWRhMzY0MTljZjQiLCJ1c24iOiJCNUlVQ3I5NTVfRUhqZ2diIiwidnJzIjp7ImF1dGhJRCI6ImMzZWYwMzEzY2FmNTQyMWY5YjJlMmRiZTA2ODk3OWNmIiwiY2xpZW50VXNlckFnZW50IjoiU3RlYW1WUiAxLjc0LjQuMjk1NF9hYTJjNmZmNCIsImRldmljZUlEIjoiMTkzYWYyOTUxMGUyMmI4MzYxNzg1ZjBiMzliNTYzOWZlYmJjZDhmOCJ9LCJleHAiOjE3Nzk2MzA3ODIsImlhdCI6MTc3OTYyNzE4Mn0.X0u59eoEuqIwk924NatxpUtDVBhHdzt5OuiEtUhROsk",
  refresh_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWQiOiJjMTE2MWI0ZC0yYjM3LTQwZDAtOTczZS05NDEzZjQ3OTk0NzciLCJ1aWQiOiI2YzkxYWM0Ni00ZGEzLTRhMTktYjlhZi1hZWRhMzY0MTljZjQiLCJ1c24iOiJCNUlVQ3I5NTVfRUhqZ2diIiwidnJzIjp7ImF1dGhJRCI6ImMzZWYwMzEzY2FmNTQyMWY5YjJlMmRiZTA2ODk3OWNmIiwiY2xpZW50VXNlckFnZW50IjoiU3RlYW1WUiAxLjc0LjQuMjk1NF9hYTJjNmZmNCIsImRldmljZUlEIjoiMTkzYWYyOTUxMGUyMmI4MzYxNzg1ZjBiMzliNTYzOWZlYmJjZDhmOCJ9LCJleHAiOjE3Nzk2NDg3ODIsImlhdCI6MTc3OTYyNzE4Mn0.0v8Y2bk8v8_mWllcu3zoTIwMrIwjWyAXw_TW8pUZaJk",
};

function getExp(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    return payload.exp;
  } catch { return 0; }
}

async function refreshSession() {
  try {
    console.log("[Refresh] Calling AC refresh endpoint...");
    const res = await fetch(`${NAKAMA_SERVER}/v2/account/authenticate/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic " + Buffer.from(`${SERVER_KEY}:`).toString("base64"),
        "User-Agent": "UnityPlayer/6000.3.12f1 (UnityWebRequest/1.0, libcurl/8.10.0-DEV)",
        "x-unity-version": "6000.3.12f1",
      },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });

    const text = await res.text();
    console.log(`[Refresh] Response ${res.status}: ${text}`);

    if (!res.ok) return;

    const data = JSON.parse(text);
    session.token = data.token;
    session.refresh_token = data.refresh_token;
    console.log(`[Refresh] Success! Token expires: ${new Date(getExp(data.token) * 1000).toISOString()}`);
  } catch (e) {
    console.error("[Refresh] Error:", e.message);
  }
}

// Refresh every 4 hours
setInterval(refreshSession, 4 * 60 * 60 * 1000);

// Also refresh on startup
setTimeout(refreshSession, 5000);

// POST /update-tokens — update tokens manually
app.post("/update-tokens", (req, res) => {
  const { token, refresh_token } = req.body;
  if (!token || !refresh_token) return res.status(400).json({ error: "token and refresh_token required" });
  session.token = token;
  session.refresh_token = refresh_token;
  console.log(`[Update] Tokens updated manually. Expires: ${new Date(getExp(token) * 1000).toISOString()}`);
  res.json({ ok: true });
});

// POST /v2/account/authenticate/custom/:client
app.post("/v2/account/authenticate/custom/:client", (req, res) => {
  console.log(`[Auth] client=${req.params.client}`);
  res.json({ token: session.token, refresh_token: session.refresh_token, created: false });
});

// POST /v2/account/authenticate/refresh
app.post("/v2/account/authenticate/refresh", async (req, res) => {
  await refreshSession();
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
