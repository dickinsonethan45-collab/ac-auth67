const express = require("express");
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWQiOiJjMTE2MWI0ZC0yYjM3LTQwZDAtOTczZS05NDEzZjQ3OTk0NzciLCJ1aWQiOiI2YzkxYWM0Ni00ZGEzLTRhMTktYjlhZi1hZWRhMzY0MTljZjQiLCJ1c24iOiJCNUlVQ3I5NTVfRUhqZ2diIiwidnJzIjp7ImF1dGhJRCI6ImMzZWYwMzEzY2FmNTQyMWY5YjJlMmRiZTA2ODk3OWNmIiwiY2xpZW50VXNlckFnZW50IjoiU3RlYW1WUiAxLjc0LjQuMjk1NF9hYTJjNmZmNCIsImRldmljZUlEIjoiMTkzYWYyOTUxMGUyMmI4MzYxNzg1ZjBiMzliNTYzOWZlYmJjZDhmOCJ9LCJleHAiOjE3Nzk2MzA3ODIsImlhdCI6MTc3OTYyNzE4Mn0.X0u59eoEuqIwk924NatxpUtDVBhHdzt5OuiEtUhROsk";
const REFRESH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWQiOiJjMTE2MWI0ZC0yYjM3LTQwZDAtOTczZS05NDEzZjQ3OTk0NzciLCJ1aWQiOiI2YzkxYWM0Ni00ZGEzLTRhMTktYjlhZi1hZWRhMzY0MTljZjQiLCJ1c24iOiJCNUlVQ3I5NTVfRUhqZ2diIiwidnJzIjp7ImF1dGhJRCI6ImMzZWYwMzEzY2FmNTQyMWY5YjJlMmRiZTA2ODk3OWNmIiwiY2xpZW50VXNlckFnZW50IjoiU3RlYW1WUiAxLjc0LjQuMjk1NF9hYTJjNmZmNCIsImRldmljZUlEIjoiMTkzYWYyOTUxMGUyMmI4MzYxNzg1ZjBiMzliNTYzOWZlYmJjZDhmOCJ9LCJleHAiOjE3Nzk2NDg3ODIsImlhdCI6MTc3OTYyNzE4Mn0.0v8Y2bk8v8_mWllcu3zoTIwMrIwjWyAXw_TW8pUZaJk";
const USER_ID = "6c91ac46-4da3-4a19-b9af-aeda36419cf4";
const USERNAME = "B5IUCr955_EHjggb";

// POST /v2/account/authenticate/custom/:client
app.post("/v2/account/authenticate/custom/:client", (req, res) => {
  console.log(`[Auth] client=${req.params.client}`);
  res.json({
    token: TOKEN,
    refresh_token: REFRESH_TOKEN,
    created: false,
  });
});

// POST /v2/account/authenticate/refresh
app.post("/v2/account/authenticate/refresh", (req, res) => {
  res.json({
    token: TOKEN,
    refresh_token: REFRESH_TOKEN,
    created: false,
  });
});

// GET /v2/account
app.get("/v2/account", (req, res) => {
  console.log(`[Account] metadata poll`);
  res.json({
    user: {
      id: USER_ID,
      username: USERNAME,
      display_name: USERNAME,
      avatar_url: "",
      lang_tag: "en",
      location: "",
      timezone: "",
      metadata: "{}",
      edge_count: 0,
      followers_count: 0,
      groups_count: 0,
      online: true,
      create_time: { seconds: "1700000000", nanos: 0 },
      update_time: { seconds: "1700000000", nanos: 0 },
    },
    wallet: "{}",
    email: "",
    devices: [],
    custom_id: USER_ID,
    verify_time: { seconds: "0", nanos: 0 },
    disable_time: { seconds: "0", nanos: 0 },
  });
});

app.all("*", (req, res) => {
  console.log(`[Unhandled] ${req.method} ${req.path}`);
  res.status(200).json({});
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
