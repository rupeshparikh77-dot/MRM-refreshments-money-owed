// Stand Ledger — server for the kids' refreshment stand.
//
// Storage: if a DATABASE_URL is set (your free Neon Postgres), the whole ledger
// is saved in the database and survives restarts forever. If it isn't set, the
// app falls back to a local data.json file (handy for testing on one computer).

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

const BLANK = { biz: "The Refreshment Stand", partners: [], entries: [] };

// The starting team, used only the first time the store is empty.
function seedState() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "data.json"), "utf8"));
  } catch (e) {
    return { ...BLANK };
  }
}

// ---- Team PIN ----
// Anyone must send this to read or change the ledger. For a public GitHub repo
// this default is visible in the code — to keep it secret, set an APP_PIN
// environment variable in Render (it wins over this default).
const PIN = process.env.APP_PIN || "mrmrefreshments123!";

function checkPin(req, res) {
  const given = req.get("x-stand-pin") || "";
  if (given !== PIN) {
    res.status(401).json({ ok: false, error: "pin" });
    return false;
  }
  return true;
}

// ---- Storage ----
const DATABASE_URL = process.env.DATABASE_URL;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");

let pool = null;

async function initStore() {
  if (!DATABASE_URL) {
    console.log("No DATABASE_URL set — saving to a local file (" + DATA_FILE + ").");
    return;
  }
  const { Pool } = require("pg");
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Neon and most hosted Postgres need SSL
  });
  await pool.query(
    "CREATE TABLE IF NOT EXISTS ledger (id INT PRIMARY KEY, data JSONB NOT NULL)"
  );
  const existing = await pool.query("SELECT data FROM ledger WHERE id = 1");
  if (existing.rowCount === 0) {
    await pool.query("INSERT INTO ledger (id, data) VALUES (1, $1)", [JSON.stringify(seedState())]);
  }
  console.log("Connected to the database — the ledger is saved there.");
}

async function readState() {
  if (pool) {
    const r = await pool.query("SELECT data FROM ledger WHERE id = 1");
    return r.rowCount ? r.rows[0].data : { ...BLANK };
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    return { ...BLANK };
  }
}

async function writeState(state) {
  if (pool) {
    await pool.query(
      "INSERT INTO ledger (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = $1",
      [JSON.stringify(state)]
    );
    return;
  }
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname)); // serves index.html (the page itself isn't PIN-gated; the data is)

// Read the whole ledger (PIN required)
app.get("/api/state", async (req, res) => {
  if (!checkPin(req, res)) return;
  try {
    res.json(await readState());
  } catch (e) {
    res.status(500).json({ ok: false, error: "could not read" });
  }
});

// Save the whole ledger (PIN required)
app.post("/api/state", async (req, res) => {
  if (!checkPin(req, res)) return;
  const body = req.body || {};
  const state = {
    biz: typeof body.biz === "string" ? body.biz : BLANK.biz,
    partners: Array.isArray(body.partners) ? body.partners : [],
    entries: Array.isArray(body.entries) ? body.entries : [],
  };
  try {
    await writeState(state);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "could not save" });
  }
});

const PORT = process.env.PORT || 3000;

initStore()
  .then(() => {
    app.listen(PORT, () => console.log("Stand Ledger running on port " + PORT));
  })
  .catch((err) => {
    console.error("Could not start — storage setup failed:", err.message);
    process.exit(1);
  });
