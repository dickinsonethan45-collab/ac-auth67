const express = require("express");
const SteamUser = require("steam-user");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const NAKAMA_SERVER = "https://animalcompany.us-east1.nakamacloud.io";
const SERVER_KEY = "RuTSlDKKfYbuDW";
const AC_APP_ID = 2552550;

const STEAM_USERNAME = process.env.STEAM_USERNAME;
const STEAM_PASSWORD = process.env.STEAM_PASSWORD;

let session = { token: null, refresh_token: null };
let steamClient = null;
let steamLoggedIn = false;
let guardCodeResolver = null;

function getExp(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    return payload.exp;
  } catch { return 0; }
}

async function getSessionTicket() {
  return new Promise((resolve, reject) => {
    steamClient.createAuthSessionTicket(AC_APP_ID, (err, ticket) => {
      if (err) return reject(err);
      resolve(ticket.sessionTicket.toString("hex"));
    });
  });
}

async function authenticateWithSteam() {
  try {
    console.log("[Steam] Getting session ticket...");
    const ticket = await getSessionTicket();
    console.log("[Steam] Authenticating with AC server...");
    const res = await fetch(`${NAKAMA_SERVER}/v2/account/authenticate/steam?create=true&sync=false&`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic " + Buffer.from(`${SERVER_KEY}:`).toString("base64"),
        "User-Agent": "UnityPlayer/6000.3.12f1 (UnityWebRequest/1.0, libcurl/8.10.0-DEV)",
        "x-unity-version": "6000.3.12f1",
      },
      body: JSON.stringify({ token: ticket }),
    });

    if (!res.ok) {
      console.error(`[Steam] Auth failed: ${res.status} ${await res.text()}`);
      return;
    }

    const data = await res.json();
    session.token = data.token;
    session.refresh_token = data.refresh_token;
    console.log(`[Steam] Auth success! Token expires: ${new Date(getExp(data.token) * 1000).toISOString()}`);
  } catch (e) {
    console.error("[Steam] Error:", e.message);
  }
}

function initSteam() {
  steamClient = new SteamUser();

  steamClient.logOn({
    accountName: STEAM_USERNAME,
    password: STEAM_PASSWORD,
    rememberPassword: true,
  });

  steamClient.on("loggedOn", async () => {
    console.log("[Steam] Logged into Steam!");
    steamLoggedIn = true;
    steamClient.gamesPlayed([AC_APP_ID]);
    setTimeout(async () => {
      await authenticateWithSteam();
    }, 3000);
  });

  steamClient.on("steamGuard", (domain, callback) => {
    console.log(`[Steam] Steam Guard code required (${domain || "mobile app"})`);
    console.log(`[Steam] Visit: https://ac-auth67-production.up.railway.app/steam-guard/YOURCODE`);
    guardCodeResolver = callback;
  });

  steamClient.on("error", (err) => {
    console.error("[Steam] Error:", err.message);
    steamLoggedIn = false;
    setTimeout(initSteam, 30000);
  });

  steamClient.on("disconnected", () => {
    console.log("[Steam] Disconnected, reconnecting...");
    steamLoggedIn = false;
    setTimeout(initSteam, 10000);
  });
}

// Auto-refresh every 50 minutes
setInterval(async () => {
  if (!steamLoggedIn) return;
  console.log("[Timer] Refreshing token via Steam...");
  await authenticateWithSteam();
}, 50 * 60 * 1000);

// GET /steam-guard/:code
app.get("/steam-guard/:code", (req, res) => {
  const code = req.params.code;
  if (!guardCodeResolver) return res.json({ error: "No Steam Guard prompt active" });
  console.log(`[Steam] Submitting Guard code: ${code}`);
  guardCodeResolver(code);
  guardCodeResolver = null;
  res.json({ ok: true, message: "Code submitted, logging in..." });
});

// POST /v2/account/authenticate/custom/:client
app.post("/v2/account/authenticate/custom/:client", async (req, res) => {
  console.log(`[Auth] client=${req.params.client}`);
  if (!session.token) {
    return res.status(503).json({ code: 14, message: "Session not ready yet, try again in a few seconds." });
  }
  res.json({ token: session.token, refresh_token: session.refresh_token, created: false });
});

// POST /v2/account/authenticate/refresh
app.post("/v2/account/authenticate/refresh", async (req, res) => {
  await authenticateWithSteam();
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
  initSteam();
});
