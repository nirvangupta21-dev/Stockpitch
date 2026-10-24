/**
 * scripts/test-accounts.mjs
 *
 * Integration tests for the account system. Runs against the production build
 * (dist/index.cjs) in an isolated temp directory — it never touches the repo's
 * own database or the live deployment.
 *
 * Usage: npm test   (builds first, then runs these tests)
 */
import { spawn } from "node:child_process";
import { mkdtempSync, existsSync, readdirSync, rmSync, readFileSync as fsReadFileSync } from "node:fs";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, "../dist/index.cjs");
const PORT = 5120;
const BASE = `http://127.0.0.1:${PORT}`;

if (!existsSync(DIST)) {
  console.error("dist/index.cjs not found — run `npm run build` first.");
  process.exit(1);
}

// ── tiny test harness ────────────────────────────────────────────────────────
let failures = 0;
function check(name, cond, detail = "") {
  const mark = cond ? "PASS" : "FAIL";
  if (!cond) failures += 1;
  console.log(`  ${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
}
function section(name) {
  console.log(`\n=== ${name} ===`);
}

// ── server control ───────────────────────────────────────────────────────────
const WORKDIR = mkdtempSync(path.join(tmpdir(), "veridian-test-"));
let server = null;
let serverLog = "";

async function startServer() {
  server = spawn("node", [DIST], {
    cwd: WORKDIR,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: "production", AUTH_RATE_LIMIT: "3", SESSION_SECRET: "test-secret" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", d => (serverLog += d));
  server.stderr.on("data", d => (serverLog += d));
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error("server did not become healthy:\n" + serverLog);
}
function stopServer() {
  return new Promise(resolve => {
    if (!server) return resolve();
    server.on("exit", resolve);
    server.kill("SIGTERM");
    setTimeout(() => { try { server.kill("SIGKILL"); } catch {} resolve(); }, 3000);
  });
}

// ── HTTP client with a manual cookie jar (fetch drops Secure cookies on http) ─
function client() {
  let cookie = null;
  return async function call(method, url, body, extraHeaders = {}) {
    const headers = { "Content-Type": "application/json", ...extraHeaders };
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(`${BASE}${url}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    let json = null;
    try { json = await res.json(); } catch {}
    return { status: res.status, json, setCookie };
  };
}
const PROXY = { "X-Forwarded-Proto": "https", "X-Forwarded-For": "203.0.113.9" };
const pos = (id, ticker, name, shares = 10) => ({
  id, ticker, name, shares, avgCost: 100, purchaseDate: "2026-01-01", notes: "",
});
const tickersOf = pf => (pf ?? []).map(p => p.ticker).sort().join(",");

// ── run ──────────────────────────────────────────────────────────────────────
try {
  await startServer();

  section("health endpoint");
  {
    const r = await fetch(`${BASE}/api/health`);
    const j = await r.json();
    check("GET /api/health → 200 { ok: true }", r.status === 200 && j.ok === true);
  }

  section("signup / login behind a TLS proxy (the original bug)");
  let alice = client();
  let bob = client();
  {
    const r = await alice("POST", "/api/auth/signup", { name: "Alice", email: "alice@t.dev", password: "password123" }, PROXY);
    check("signup returns 200 with a user", r.status === 200 && !!r.json?.user?.id);
    check("signup issues a Secure session cookie", !!r.setCookie && r.setCookie.includes("stockpitch.sid"));
    const me = await alice("GET", "/api/auth/me", null, PROXY);
    check("session persists (/api/auth/me knows Alice)", me.json?.user?.name === "Alice");
    const bad = await alice("POST", "/api/auth/login", { email: "alice@t.dev", password: "wrongwrong" }, PROXY);
    check("wrong password → 401", bad.status === 401);
  }

  section("rate limiting on auth endpoints");
  {
    const anon = client();
    let got429 = false;
    for (let i = 0; i < 5; i++) {
      const r = await anon("POST", "/api/auth/login", { email: "alice@t.dev", password: "nope-nope" }, PROXY);
      if (r.status === 429) { got429 = true; break; }
    }
    check("repeated failures → 429", got429);
  }

  section("anonymous visitors get isolated guest buckets");
  {
    const v1 = client(), v2 = client();
    const me1 = await v1("GET", "/api/auth/me", null, PROXY);
    const me2 = await v2("GET", "/api/auth/me", null, PROXY);
    check("each visitor gets its own guestId", !!me1.json?.guestId && me1.json.guestId !== me2.json.guestId);
    await v1("POST", "/api/portfolio", pos("g1", "AAPL", "Visitor1 holding"), PROXY);
    const v2pf = await v2("GET", "/api/portfolio", null, PROXY);
    check("visitor2 cannot see visitor1's position", (v2pf.json ?? []).length === 0);
    await v2("DELETE", "/api/portfolio/g1", null, PROXY);
    const v1pf = await v1("GET", "/api/portfolio", null, PROXY);
    check("visitor2 cannot delete visitor1's position", tickersOf(v1pf.json) === "AAPL");
  }

  section("cross-user position takeover is rejected");
  {
    await alice("POST", "/api/portfolio", pos("shared-1", "NVDA", "Alice NVDA"), PROXY);
    await bob("POST", "/api/auth/signup", { name: "Bob", email: "bob@t.dev", password: "password123" }, PROXY);
    const hijack = await bob("POST", "/api/portfolio", pos("shared-1", "TSLA", "Bob TSLA", 1), PROXY);
    check("Bob POSTing Alice's position id → 403", hijack.status === 403, `got ${hijack.status}`);
    const alicePf = await alice("GET", "/api/portfolio", null, PROXY);
    check("Alice still owns her position", tickersOf(alicePf.json) === "NVDA");
    const bobPf = await bob("GET", "/api/portfolio", null, PROXY);
    check("Bob's portfolio stays empty", (bobPf.json ?? []).length === 0);
  }

  section("per-account backup files");
  {
    await alice("POST", "/api/portfolio", pos("a2", "MSFT", "Alice MSFT"), PROXY);
    await bob("POST", "/api/portfolio", pos("b1", "AMZN", "Bob AMZN"), PROXY);
    const backupDir = path.join(WORKDIR, "portfolio_backups");
    const files = existsSync(backupDir) ? readdirSync(backupDir).filter(f => f.endsWith(".json")).map(f => path.join(backupDir, f)) : [];
    const contents = files.map(f => JSON.parse(fs.readFileSync(f, "utf-8")));
    const aliceId = (await alice("GET", "/api/auth/me", null, PROXY)).json.user.id;
    const bobId = (await bob("GET", "/api/auth/me", null, PROXY)).json.user.id;
    check("a backup file exists for each account", contents.some(c => c.userId === aliceId) && contents.some(c => c.userId === bobId));
    const accountBackups = contents.filter(c => c.userId === aliceId || c.userId === bobId);
    check("no backup mixes two accounts' rows", accountBackups.every(c => c.positions.every(p => c.userId === aliceId ? ["NVDA", "MSFT"].includes(p.ticker) : p.ticker === "AMZN")));
    const aliceRows = contents.find(c => c.userId === aliceId).positions;
    check("Alice's backup contains only her rows", aliceRows.every(p => ["NVDA", "MSFT"].includes(p.ticker)), tickersOf(aliceRows));
  }

  section("sessions survive a server restart (SESSION_SECRET set)");
  {
    await stopServer();
    await startServer();
    const me = await alice("GET", "/api/auth/me", null, PROXY);
    check("Alice still signed in after restart", me.json?.user?.name === "Alice");
    const pf = await alice("GET", "/api/portfolio", null, PROXY);
    check("portfolio intact after restart", tickersOf(pf.json) === "MSFT,NVDA");
  }

  section("cold start with lost filesystem (users gone, backups remain)");
  {
    await stopServer();
    rmSync(path.join(WORKDIR, "stockpitch.db"), { force: true });
    rmSync(path.join(WORKDIR, "sessions.db"), { force: true });
    await startServer();
    const login = await alice("POST", "/api/auth/login", { email: "alice@t.dev", password: "password123" }, PROXY);
    check("login fails after accounts are lost", login.status === 401);
    const anon = client();
    const pf = await anon("GET", "/api/portfolio", null, PROXY);
    check("no orphaned positions restored for missing users", (pf.json ?? []).length === 0);
  }
} finally {
  await stopServer();
  try { rmSync(WORKDIR, { recursive: true, force: true }); } catch {}
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
