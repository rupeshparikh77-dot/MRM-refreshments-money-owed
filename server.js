// Stand Ledger — tiny server that stores everything in data.json
// No database needed: the whole ledger lives in one JSON file next to this server.

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

// Where the ledger is saved. Set DATA_FILE in Render to a persistent-disk path
// (e.g. /data/data.json) if you add a disk; otherwise it defaults to the file
// shipped with the app.
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");

const BLANK = { biz: "The Refreshment Stand", partners: [], entries: [] };

function readState() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    return { ...BLANK };
  }
}

function writeState(state) {
  // Make sure the folder exists (matters when DATA_FILE points at a mounted disk).
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname)); // serves index.html

// Read the whole ledger
app.get("/api/state", (req, res) => {
  res.json(readState());
});

// Save the whole ledger
app.post("/api/state", (req, res) => {
  const body = req.body || {};
  const state = {
    biz: typeof body.biz === "string" ? body.biz : BLANK.biz,
    partners: Array.isArray(body.partners) ? body.partners : [],
    entries: Array.isArray(body.entries) ? body.entries : [],
  };
  try {
    writeState(state);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "could not save" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Stand Ledger running on port " + PORT);
});
