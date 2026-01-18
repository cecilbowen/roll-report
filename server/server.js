/* eslint-disable consistent-return */
/* eslint-disable no-process-env */
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import Database from "better-sqlite3";
import yauzl from "yauzl";
import { createPerkComboService } from "./perkCombos.js";
import crypto from "crypto";
import cookieParser from "cookie-parser";

const router = express.Router();

const BUNGIE_BASE = "https://www.bungie.net/Platform";
const BUNGIE_AUTH_URL = "https://www.bungie.net/en/OAuth/Authorize";
const BUNGIE_TOKEN_URL = "https://www.bungie.net/platform/app/oauth/token/";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_CLEANUP_MINUTES = 10; // clear deleted sessions every x minutes
const OAUTH_ENABLED = process.env.BUNGIE_OAUTH_ENABLED === "1";

router.use(cookieParser());

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const API_KEY = process.env.BUNGIE_API_KEY; // only on server
const CACHE_DIR = process.env.D2_MANIFEST_DIR || "./.d2manifest";
const LANG = process.env.D2_LANG || "en";

if (!API_KEY) {
  throw new Error("Missing BUNGIE_API_KEY");
}

// temporary, you and me are only temp-po-rar-y, but-
const sessions = new Map(); // sessionId -> tokenData

const ensureDir = dir => fs.mkdirSync(dir, { recursive: true });

let perkSvc;

const bungieGet = async endpointPath => {
  const res = await fetch(`${BUNGIE_BASE}${endpointPath}`, {
    headers: { "X-API-Key": API_KEY },
  });
  const json = await res.json();
  if (!res.ok || json.ErrorCode !== 1) {
    throw new Error(
      `Bungie error for ${endpointPath}: HTTP ${res.status} ${json.ErrorStatus} - ${json.Message}`
    );
  }
  if (!("Response" in json)) {
    throw new Error(
      `No Response for ${endpointPath}. Keys: ${Object.keys(json).join(", ")}`
    );
  }
  return json.Response;
};

const downloadToFile = async(url, outPath) => {
  const res = await fetch(url);
  if (!res.ok) { throw new Error(`Download failed: ${res.status} ${res.statusText}`); }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
};

const unzipFirstFile = async(zipPath, outPath) => {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) { return reject(err); }
      zipfile.readEntry();
      zipfile.on("entry", entry => {
        zipfile.openReadStream(entry, (err2, readStream) => {
          if (err2) { return reject(err2); }
          const ws = fs.createWriteStream(outPath);
          readStream.pipe(ws);
          ws.on("finish", () => {
            zipfile.close();
            resolve();
          });
          ws.on("error", reject);
        });
      });
      zipfile.on("error", reject);
    });
  });
};

const prepareManifestSqlite = async() => {
  ensureDir(CACHE_DIR);
  const metaPath = path.join(CACHE_DIR, "manifest_meta.json");
  const manifest = await bungieGet("/Destiny2/Manifest/");

  const version = manifest?.version;
  const rel = manifest?.mobileWorldContentPaths?.[LANG];
  if (!version || !rel) { throw new Error(`Manifest missing version or mobileWorldContentPaths.${LANG}`); }

  const contentUrl = `https://www.bungie.net${rel}`;
  const contentPath = path.join(CACHE_DIR, `world_${LANG}.content`);
  const sqlitePath = path.join(CACHE_DIR, `world_${LANG}.sqlite3`);

  const prev = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : null;

  const needs = !fs.existsSync(sqlitePath) || !prev || prev.version !== version || prev.contentUrl !== contentUrl;
  if (needs) {
    console.log("Downloading manifest:", contentUrl);
    await downloadToFile(contentUrl, contentPath);
    console.log("Unzipping sqlite:", sqlitePath);
    await unzipFirstFile(contentPath, sqlitePath);
    fs.writeFileSync(metaPath, JSON.stringify({ version, contentUrl }, null, 2));
    console.log("Manifest ready:", version);
  } else {
    console.log("Using cached manifest:", prev.version);
  }

  const db = new Database(sqlitePath, { readonly: true });
  return { db, version };
};

// ---- Server startup ----
const app = express();
// app.use(cors({ origin: ["http://localhost:3000"], credentials: false }));
app.use(cors({
  origin: ["http://localhost:3000", "https://roll.report", "http://www.roll.report"],
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));
app.use(router);
app.use(cookieParser());

let db = null;
let manifestVersion = null;

const getDef = (table, id) => {
  const stmt = db.prepare(`SELECT json FROM ${table} WHERE id = ?`);
  const row = stmt.get(Number(id));
  if (!row?.json) { return null; }
  return JSON.parse(row.json);
};

app.get("/", (req, res) => {
  res.send("OK");
});

// Health + version
app.get("/api/manifest/version", (req, res) => {
  res.json({ version: manifestVersion });
});

// Single definition fetch
app.get("/api/defs/:table/:id", (req, res) => {
  const { table, id } = req.params;
  try {
    const def = getDef(table, id);
    if (!def) { return res.status(404).json({ error: "Not found" }); }
    res.json(def);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// Batch definition fetch (preferred)
app.post("/api/defs/batch", (req, res) => {
  const { table, ids } = req.body || {};
  if (!table || !Array.isArray(ids)) {
    return res.status(400).json({ error: "Body must be { table, ids: [] }" });
  }

  try {
    // faster: reuse prepared statement
    const stmt = db.prepare(`SELECT id, json FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`);
    const rows = stmt.all(...ids.map(Number));

    // return as map id->def for easy lookup
    const out = {};
    for (const r of rows) { out[String(r.id)] = JSON.parse(r.json); }
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.all("/api/bungie", async(req, res) => {
  try {
    // Call like: /api/bungie?path=/Destiny2/Manifest/
    const path = req.query.path;
    if (!path || typeof path !== "string") {
      return res.status(400).json({ error: "Missing ?path=/Destiny2/..." });
    }

    // preserve querystring that the caller might include in `path`
    const url = `https://www.bungie.net/Platform${path.startsWith("/") ? path : `/${path}`}`;

    const bungieRes = await fetch(url, {
      method: req.method,
      headers: {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json",
      },
      body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
    });

    const text = await bungieRes.text();
    res.status(bungieRes.status).send(text);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/weapons", (req, res) => {
  if (!perkSvc) {
    res.statusMessage("Not yet initialized");
    return;
  }

  try {
    const out = perkSvc.buildWeaponIndex();
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/perk-combos", (req, res) => {
  if (!perkSvc) {
    res.statusMessage("Not yet initialized");
    return;
  }

  try {
    const weaponHash = req.query.weaponHash;
    if (!weaponHash) { return res.status(400).json({ error: "weaponHash required" }); }

    const sameWeaponType = req.query.sameWeaponType === "1";
    const sameDamageType = req.query.sameDamageType === "1";
    const sameFrame = req.query.sameFrame === "1";
    const sameName = req.query.sameName === "1";
    const sameAmmo = req.query.sameAmmo === "1";
    const newGear = req.query.newGear === "1";
    const leniency = Number(req.query.leniency ?? 0);

    const out = perkSvc.computeUniqueCombos({
      weaponHash: Number(weaponHash),
      sameWeaponType,
      sameDamageType,
      sameFrame,
      sameName,
      sameAmmo,
      newGear,
      leniency,
    });

    res.json(out);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/inventory-uniques", async(req, res) => {
  if (!perkSvc) {
    res.statusMessage("Not yet initialized");
    return;
  }

  try {
    const out = await perkSvc.callInventory({ bungieName: req.query.bungieName });

    res.json(out);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
app.get("/api/inventory-uniques/me", async(req, res) => {
  if (!OAUTH_ENABLED) {
    return res.status(403).json({
      error: "Bungie OAuth is currently disabled",
    });
  }

  try {
    const sid = req.cookies?.d2sid;
    if (!sid) { return res.status(401).json({ error: "Not logged in" }); }

    // const sess = sessions.get(sid);
    // if (!sess) { return res.status(401).json({ error: "Session expired" }); }

    // if expired: refresh using sess.refresh_token, update DB
    const { accessToken, membershipId } = await getValidAccessTokenAndMembershipIdForSession(sid);
    if (!accessToken || !membershipId) { return res.status(401).json({ error: "Session expired" }); }

    const out = await perkSvc.callInventory({ accessToken, membershipId });

    res.json(out);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/status", async(req, res) => {
  if (!perkSvc) {
    res.json(false);
    return;
  }

  try {
    const out = await perkSvc.status();

    res.json(out);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/me", (req, res) => {
  if (!OAUTH_ENABLED) {
    return res.json({
      loggedIn: false,
      oauthEnabled: false,
    });
  }

  const sid = req.cookies?.d2sid;
  const sess = getSession(sid); // your 24h-expiring helper
  if (!sess) { return res.status(401).json({ loggedIn: false }); }

  res.json({
    loggedIn: true,
    bungieMembershipId: sess.membership_id, // optional
  });
});

// Bungie OAUTH ///////////////////////////////////////////////////////////////////////////////

const getSession = sid => {
  if (!sid) { return null; }

  const sess = sessions.get(sid);
  if (!sess) { return null; }

  if (Date.now() >= sess.session_expires_at) {
    sessions.delete(sid);
    return null;
  }

  return sess;
};

export const refreshBungieToken = async refreshToken => {
  const res = await fetch(BUNGIE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.BUNGIE_CLIENT_ID,
      client_secret: process.env.BUNGIE_CLIENT_SECRET,
    }),
  });

  return res.json();
};

const getValidAccessTokenAndMembershipIdForSession = async sid => {
  const sess = getSession(sid);
  if (!sess) { return null; }

  const nowSec = Math.floor(Date.now() / 1000);
  const safetyWindow = 30; // seconds

  if (sess.expires_at && nowSec < sess.expires_at - safetyWindow) {
    return { accessToken: sess.access_token, membershipId: sess.membership_id };
  }

  const refreshed = await refreshBungieToken(sess.refresh_token);

  if (!refreshed?.access_token) {
    sessions.delete(sid);
    return null;
  }

  const newExpiresAt = nowSec + Number(refreshed.expires_in || 0);

  sessions.set(sid, {
    ...sess,
    ...refreshed,
    expires_at: newExpiresAt,
  });

  return {
    accessToken: refreshed.access_token,
    membershipId: refreshed.membership_id
  };
};

router.get("/auth/bungie", (req, res) => {
  if (!OAUTH_ENABLED) {
    return res.status(410).json({
      error: "Bungie OAuth is currently disabled",
    });
  }

  const state = crypto.randomBytes(16).toString("hex");

  // res.cookie("bungie_oauth_state", state, {
  //   httpOnly: true,
  //   sameSite: "lax",
  // });

  res.cookie("bungie_oauth_state", state, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
  });

  const params = new URLSearchParams({
    client_id: process.env.BUNGIE_CLIENT_ID,
    response_type: "code",
    state,
  });

  res.redirect(`${BUNGIE_AUTH_URL}?${params.toString()}`);
});

router.get("/auth/bungie/callback", async(req, res) => {
  if (!OAUTH_ENABLED) {
    return res.status(410).send("Bungie OAuth is currently disabled");
  }

  const { code, state } = req.query;
  const savedState = req.cookies.bungie_oauth_state;

  if (!code || state !== savedState) {
    return res.status(400).send("Invalid OAuth state");
  }

  try {
    const tokenRes = await fetch(BUNGIE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: process.env.BUNGIE_CLIENT_ID,
        client_secret: process.env.BUNGIE_CLIENT_SECRET,
      }),
    });

    const tokenData = await tokenRes.json();

    /*
      tokenData contains:
      - access_token
      - refresh_token
      - expires_in
      - membership_id
    */

    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    const expiresAt = nowSec + Number(tokenData.expires_in || 0);
    const accessExpiresAtSec = nowSec + Number(tokenData.expires_in || 0);

    // todo: Store tokens securely (DB or encrypted cookie)
    const sessionId = crypto.randomBytes(24).toString("hex");

    sessions.set(sessionId, {
      ...tokenData,
      expires_at: expiresAt,
      created_at: nowMs,
      session_expires_at: nowMs + SESSION_TTL_MS,
    });

    res.cookie("d2sid", sessionId, {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      maxAge: SESSION_TTL_MS,
    });
    // console.log(`session id: ${sessionId}`);

    // res.redirect(`${process.env.FRONTEND_URL}/auth/success`);
    res.send(`
    <script>
      if (window.opener) {
        window.opener.postMessage("bungie-auth-success", "${process.env.FRONTEND_URL}");
        window.close();
      } else {
        document.body.innerText = "Logged in! You can close this tab.";
      }
    </script>
  `);
  } catch (err) {
    console.error(err);
    res.status(500).send("OAuth failed");
  }
});

// ///////////////////////////////////////////////////////////////////////////////////////////

(async() => {
  const prepared = await prepareManifestSqlite();
  db = prepared.db;
  manifestVersion = prepared.version;

  perkSvc = createPerkComboService({ db });
  perkSvc.buildWeaponIndex();

  setInterval(() => {
    const now = Date.now();
    for (const [sid, sess] of sessions) {
      if (!sess?.session_expires_at || now >= sess.session_expires_at) {
        sessions.delete(sid);
      }
    }
  }, SESSION_CLEANUP_MINUTES * 60 * 1000);

  const server = app.listen(PORT, () => {
    const addressInfo = server.address();

    if (typeof addressInfo === 'object' && addressInfo !== null) {
        const host = addressInfo.address;
        const port = addressInfo.port;
        console.log(`Manifest API server running on http://${host === '::' ? 'localhost' : host}:${port}`);
    } else {
        console.log(`Server listening on port ${PORT}`);
    }
  });
})();
