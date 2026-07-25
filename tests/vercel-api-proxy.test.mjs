import assert from "node:assert/strict";
import test from "node:test";
import { DELETE, GET, POST } from "../app/api/[...path]/route.ts";

const routeContext = (path) => ({ params: Promise.resolve({ path }) });

function loginRequest(overrides = {}) {
  return new Request("https://ausgeben.vercel.app/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://ausgeben.vercel.app",
      "sec-fetch-site": "same-origin",
      "x-ausgeben-request": "1",
      ...overrides,
    },
    body: JSON.stringify({ userId: "aayushman", password: "test-password" }),
  });
}

test("the Vercel bridge rejects untrusted and unknown requests locally", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    throw new Error("A rejected request must not reach the upstream API");
  };

  try {
    const crossOrigin = await POST(
      loginRequest({ origin: "https://attacker.example" }),
      routeContext(["auth", "login"]),
    );
    assert.equal(crossOrigin.status, 403);
    assert.match(await crossOrigin.text(), /INVALID_ORIGIN/);

    const query = await GET(
      new Request("https://ausgeben.vercel.app/api/ledger?unexpected=1"),
      routeContext(["ledger"]),
    );
    assert.equal(query.status, 400);
    assert.match(await query.text(), /Query parameters are not allowed/);

    const unknownPath = await GET(
      new Request("https://ausgeben.vercel.app/api/admin"),
      routeContext(["admin"]),
    );
    assert.equal(unknownPath.status, 404);

    const wrongMethod = await GET(
      new Request("https://ausgeben.vercel.app/api/auth/login"),
      routeContext(["auth", "login"]),
    );
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get("allow"), "POST");
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the bridge forwards only its session cookie and safe headers", async () => {
  const originalFetch = globalThis.fetch;
  let forwardedRequest;

  globalThis.fetch = async (input, init) => {
    forwardedRequest = { input, init };
    const headers = new Headers({
      "cache-control": "public, max-age=3600",
      "content-type": "application/json; charset=utf-8",
      server: "private-upstream-detail",
    });
    headers.append(
      "set-cookie",
      "__Host-ausgeben_session=test-token; Path=/; Max-Age=1209600; HttpOnly; SameSite=Strict; Secure",
    );
    headers.append(
      "set-cookie",
      "tracking=must-not-reach-browser; Path=/; Secure",
    );
    return new Response(JSON.stringify({ user: { id: "aayushman" } }), {
      headers,
    });
  };

  try {
    const response = await POST(
      loginRequest({
        authorization: "must-not-be-forwarded",
        cookie:
          "preference=compact; __Host-ausgeben_session=test-token; theme=dark",
        "x-forwarded-host": "attacker.example",
      }),
      routeContext(["auth", "login"]),
    );

    assert.ok(forwardedRequest);
    assert.equal(
      String(forwardedRequest.input),
      "https://ausgeben-passau.aayushmanbhabapadhy.chatgpt.site/api/auth/login",
    );
    assert.equal(forwardedRequest.init.method, "POST");
    assert.equal(
      forwardedRequest.init.headers.get("origin"),
      "https://ausgeben-passau.aayushmanbhabapadhy.chatgpt.site",
    );
    assert.equal(forwardedRequest.init.headers.get("sec-fetch-site"), "same-origin");
    assert.equal(
      forwardedRequest.init.headers.get("cookie"),
      "__Host-ausgeben_session=test-token",
    );
    assert.equal(forwardedRequest.init.headers.has("authorization"), false);
    assert.equal(forwardedRequest.init.headers.has("x-forwarded-host"), false);

    assert.equal(response.status, 200);
    assert.equal(
      response.headers.getSetCookie().length,
      1,
    );
    assert.equal(
      response.headers.getSetCookie()[0],
      "__Host-ausgeben_session=test-token; Path=/; Max-Age=1209600; HttpOnly; SameSite=Strict; Secure",
    );
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("cdn-cache-control"), "no-store");
    assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
    assert.equal(response.headers.get("vary"), "Cookie, Origin, Sec-Fetch-Site");
    assert.equal(response.headers.has("server"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the bridge rejects declared and actual bodies over 2048 bytes", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response();
  };

  try {
    const declaredTooLarge = await POST(
      loginRequest({ "content-length": "2049" }),
      routeContext(["auth", "login"]),
    );
    assert.equal(declaredTooLarge.status, 413);

    const actualTooLarge = await POST(
      new Request("https://ausgeben.vercel.app/api/expenses", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://ausgeben.vercel.app",
          "x-ausgeben-request": "1",
        },
        body: `{"description":"${"x".repeat(2049)}"}`,
      }),
      routeContext(["expenses"]),
    );
    assert.equal(actualTooLarge.status, 413);
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the local bridge translates only the session cookie without Secure", async () => {
  const originalFetch = globalThis.fetch;
  let forwardedCookie = null;
  globalThis.fetch = async (_input, init) => {
    forwardedCookie = init.headers.get("cookie");
    return new Response(null, {
      status: 204,
      headers: {
        "set-cookie":
          "__Host-ausgeben_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict; Secure",
      },
    });
  };

  try {
    const response = await POST(
      new Request("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: {
          cookie: "preference=compact; ausgeben_session=test-token",
          "content-type": "application/json",
          origin: "http://localhost:3000",
          "x-ausgeben-request": "1",
        },
        body: "{}",
      }),
      routeContext(["auth", "logout"]),
    );

    assert.equal(forwardedCookie, "__Host-ausgeben_session=test-token");
    assert.equal(
      response.headers.get("set-cookie"),
      "ausgeben_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the bridge returns a distinct timeout response", async () => {
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  AbortSignal.timeout = () => AbortSignal.abort(new DOMException("Timed out", "TimeoutError"));
  globalThis.fetch = async (_input, init) => {
    assert.equal(init.signal.aborted, true);
    throw init.signal.reason;
  };

  try {
    const response = await GET(
      new Request("https://ausgeben.vercel.app/api/ledger"),
      routeContext(["ledger"]),
    );
    assert.equal(response.status, 504);
    assert.match(await response.text(), /UPSTREAM_TIMEOUT/);
  } finally {
    AbortSignal.timeout = originalTimeout;
    globalThis.fetch = originalFetch;
  }
});

test("the expense item allowlist permits only patch and delete", async () => {
  const originalFetch = globalThis.fetch;
  let forwardedMethod = null;
  globalThis.fetch = async (_input, init) => {
    forwardedMethod = init.method;
    return new Response(null, { status: 204 });
  };

  try {
    const response = await DELETE(
      new Request("https://ausgeben.vercel.app/api/expenses/expense_123", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          origin: "https://ausgeben.vercel.app",
          "x-ausgeben-request": "1",
        },
        body: "{}",
      }),
      routeContext(["expenses", "expense_123"]),
    );
    assert.equal(response.status, 204);
    assert.equal(forwardedMethod, "DELETE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
