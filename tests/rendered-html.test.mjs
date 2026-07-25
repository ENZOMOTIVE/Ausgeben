import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const assets = {
  fetch: async () => new Response("Not found", { status: 404 }),
};

test("server-renders the shared Ausgeben application shell", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: assets },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Ausgeben — Shared expense tracker<\/title>/i);
  assert.match(html, /shared expense tracker for two people in Germany/i);
  assert.doesNotMatch(html, /Passau/i);
  assert.match(html, /Opening your shared ledger/i);
  assert.match(html, /rel="manifest" href="[^"]*\/manifest\.webmanifest"/i);
  assert.match(html, /rel="apple-touch-icon" href="[^"]*\/icon\.png"/i);
  assert.match(html, /name="mobile-web-app-capable" content="yes"/i);
  assert.doesNotMatch(html, /No account|No database|codex-preview/i);
});

test("protects ledger APIs before they reach persistence", async () => {
  const worker = await loadWorker();
  const context = { waitUntil() {}, passThroughOnException() {} };

  const ledgerResponse = await worker.fetch(
    new Request("http://localhost/api/ledger"),
    { ASSETS: assets },
    context,
  );
  assert.equal(ledgerResponse.status, 401);
  assert.equal(ledgerResponse.headers.get("cache-control"), "no-store");
  assert.deepEqual(await ledgerResponse.json(), {
    error: { code: "UNAUTHENTICATED", message: "Sign in to continue." },
    message: "Sign in to continue.",
  });

  const crossOriginWrite = await worker.fetch(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "aayushman", password: "not-a-secret" }),
    }),
    { ASSETS: assets },
    context,
  );
  assert.equal(crossOriginWrite.status, 403);
  assert.match(await crossOriginWrite.text(), /INVALID_ORIGIN/);
});

test("keeps itemized expenses private while sharing per-person totals", async () => {
  const [api, database, clientTypes] = await Promise.all([
    readFile(new URL("../worker/api.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/database.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../src/features/expense-tracker/types.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(database, /AND created_by = \?1/);
  assert.match(database, /SELECT_CURRENT_EXPENSES_SQL\)\.bind\(user\)/);
  assert.match(database, /SELECT_CURRENT_TOTALS_SQL/);

  assert.match(api, /monthlySummaries: ledger\.archive\.map/);
  assert.match(api, /todayTotals: ledger\.todayTotals/);
  assert.match(api, /monthTotals: ledger\.monthTotals/);
  assert.doesNotMatch(api, /todayTotalCents: ledger|monthTotalCents: ledger/);
  assert.doesNotMatch(api, /totalCents: summary|expenseCount: summary/);

  assert.match(clientTypes, /todayTotals: UserTotals/);
  assert.match(clientTypes, /monthTotals: UserTotals/);
  assert.doesNotMatch(clientTypes, /\n\s+totalCents: number/);
  assert.doesNotMatch(clientTypes, /\n\s+expenseCount: number/);
});

test("uses shared D1 storage, hardened sessions, and monthly compaction", async () => {
  const [
    hook,
    workerEntry,
    api,
    auth,
    database,
    initialMigration,
    perPersonMigration,
    summary,
    archive,
    packageJson,
    hosting,
    envExample,
  ] = await Promise.all([
    readFile(
      new URL(
        "../src/features/expense-tracker/hooks/use-shared-ledger.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/api.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/database.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../drizzle/0000_neat_ser_duncan.sql", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/0001_first_morg.sql", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/features/expense-tracker/components/SpendingSummary.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/features/expense-tracker/components/MonthlyArchive.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  assert.match(hook, /fetch\(path/);
  assert.match(hook, /X-Ausgeben-Request/);
  assert.doesNotMatch(hook, /localStorage/);

  assert.match(workerEntry, /handleApiRequest/);
  assert.match(api, /\/api\/auth\/login/);
  assert.match(api, /\/api\/expenses/);
  assert.match(api, /Cache-Control/);

  assert.match(auth, /PBKDF2/);
  assert.match(auth, /100_000/);
  assert.match(auth, /HMAC/);
  assert.match(auth, /HttpOnly/);
  assert.match(auth, /SameSite=Strict/);
  assert.match(auth, /RATE_LIMIT_ATTEMPTS = 5/);

  assert.match(database, /Europe\/Berlin/);
  assert.match(database, /db\.batch/);
  assert.match(database, /monthly_summaries\.total_cents \+ excluded\.total_cents/);
  assert.match(database, /aayushman_total_cents/);
  assert.match(database, /carlin_total_cents/);
  assert.match(database, /DELETE FROM expenses/);
  assert.match(initialMigration, /CREATE TABLE `expenses`/);
  assert.match(initialMigration, /CREATE TABLE `monthly_summaries`/);
  assert.match(perPersonMigration, /ADD COLUMN `aayushman_total_cents`/);
  assert.match(perPersonMigration, /ADD COLUMN `carlin_total_cents`/);
  assert.match(summary, /monthTotals/);
  assert.match(summary, /todayTotals/);
  assert.doesNotMatch(summary, /monthTotal\b|todayTotal\b|Spent together/);
  assert.match(archive, /aayushmanTotalCents/);
  assert.match(archive, /carlinTotalCents/);
  assert.doesNotMatch(archive, /summary\.totalCents/);

  assert.match(packageJson, /drizzle-kit/);
  assert.deepEqual(JSON.parse(hosting), {
    project_id: "appgprj_6a64dd4e5c2881919158461d8ccae0f8",
    d1: "DB",
    r2: null,
  });
  assert.match(envExample, /replace-with-at-least-32-random-bytes/);
  assert.doesNotMatch(envExample, /ZWyC7dla|aJ-hvpeR|ra-TXOPR/);
});
