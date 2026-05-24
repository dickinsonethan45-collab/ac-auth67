const express = require("express");
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const NAKAMA_SERVER = "https://animalcompany.us-east1.nakamacloud.io";
const SERVER_KEY = "RuTSlDKKfYbuDW";

// Current session - updated automatically
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
    console.log("[Refresh] Refreshing token from AC server...");
    const res = await fetch(`${NAKAMA_SERVER}/v2/account/authenticate/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic " + Buffer.from(`${SERVER_KEY}:`).toString("base64"),
      },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });

    if (!res.ok) {
      console.error(`[Refresh] Failed: ${res.status} ${await res.text()}`);
      return;
    }

    const data = await res.json();
    session.token = data.token;
    session.refresh_token = data.refresh_token;
    console.log(`[Refresh] Success! Expires: ${new Date(getExp(data.token) * 1000).toISOString()}`);
  } catch (e) {
    console.error("[Refresh] Error:", e.message);
  }
}

// Check every minute, refresh if <10 mins left
setInterval(async () => {
  const secsLeft = getExp(session.token) - Math.floor(Date.now() / 1000);
  console.log(`[Timer] Token expires in ${Math.floor(secsLeft / 60)}m ${secsLeft % 60}s`);
  if (secsLeft < 600) await refreshSession();
}, 60 * 1000);

// POST /v2/account/authenticate/custom/:client
app.post("/v2/account/authenticate/custom/:client", async (req, res) => {
  console.log(`[Auth] client=${req.params.client}`);
  if (getExp(session.token) - Math.floor(Date.now() / 1000) < 600) {
    await refreshSession();
  }
  res.json({
    token: session.token,
    refresh_token: session.refresh_token,
    created: false,
  });
});

// POST /v2/account/authenticate/refresh
app.post("/v2/account/authenticate/refresh", async (req, res) => {
  await refreshSession();
  res.json({
    token: session.token,
    refresh_token: session.refresh_token,
    created: false,
  });
});

// GET /v2/account — proxy to real AC server
app.get("/v2/account", async (req, res) => {
  try {
    const upstream = await fetch(`${NAKAMA_SERVER}/v2/account`, {
      headers: { "Authorization": `Bearer ${session.token}` },
    });
    const data = await upstream.json();
    res.json(data);
  } catch (e) {
    console.error("[Account] Error:", e.message);
    res.status(500).json({});
  }
});

app.all("*", (req, res) => {
  console.log(`[Unhandled] ${req.method} ${req.path}`);
  res.status(200).json({});
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Token expires at: ${new Date(getExp(session.token) * 1000).toISOString()}`);
});
