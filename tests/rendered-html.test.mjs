import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Ausgeben application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Ausgeben — Personal expense tracker<\/title>/i);
  assert.match(html, /Passau, Germany/);
  assert.match(html, /Your spending/);
  assert.match(html, /Add expense/);
  assert.match(html, /No account\. No database\./);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("keeps expense data local and leaves remote storage disabled", async () => {
  const [hook, storage, page, layout, packageJson, hosting] = await Promise.all([
    readFile(new URL("../hooks/use-local-expenses.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/expenses.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.match(hook, /window\.localStorage/);
  assert.match(storage, /ausgeben:expenses:v1/);
  assert.doesNotMatch(hook, /\bfetch\s*\(/);
  assert.match(page, /ExpenseTracker/);
  assert.match(layout, /Personal expense tracker/);
  assert.doesNotMatch(packageJson, /drizzle|react-loading-skeleton/);
  assert.deepEqual(JSON.parse(hosting), { d1: null, r2: null });
});
