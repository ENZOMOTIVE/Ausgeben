const API_ORIGIN = "https://ausgeben-passau.aayushmanbhabapadhy.chatgpt.site";
const MAX_BODY_BYTES = 2_048;
const UPSTREAM_TIMEOUT_MS = 10_000;
const PRODUCTION_COOKIE_NAME = "__Host-ausgeben_session";
const LOCAL_COOKIE_NAME = "ausgeben_session";
const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

const REQUEST_HEADERS = [
  "accept",
  "content-type",
  "user-agent",
  "x-ausgeben-request",
] as const;
const RESPONSE_HEADERS = [
  "allow",
  "content-type",
  "retry-after",
  "x-content-type-options",
] as const;

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function protectedHeaders(additional?: HeadersInit): Headers {
  const headers = new Headers(additional);
  headers.set("Cache-Control", "no-store");
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("Vercel-CDN-Cache-Control", "no-store");
  headers.set("Vary", "Cookie, Origin, Sec-Fetch-Site");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  additionalHeaders?: HeadersInit,
): Response {
  return Response.json(
    { error: { code, message }, message },
    { status, headers: protectedHeaders(additionalHeaders) },
  );
}

function allowedMethods(path: string[]): readonly string[] | null {
  const route = path.join("/");

  if (route === "auth/login") return ["POST"];
  if (route === "auth/session") return ["GET"];
  if (route === "auth/logout") return ["POST"];
  if (route === "ledger") return ["GET"];
  if (route === "expenses") return ["POST"];

  if (
    path.length === 2 &&
    path[0] === "expenses" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(path[1])
  ) {
    return ["PATCH", "DELETE"];
  }

  return null;
}

function isAllowedWrite(request: Request): boolean {
  const origin = request.headers.get("origin");

  try {
    if (!origin || new URL(origin).origin !== new URL(request.url).origin) {
      return false;
    }
  } catch {
    return false;
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return false;
  }

  return request.headers.get("x-ausgeben-request") === "1";
}

function clientCookieName(request: Request): string {
  return new URL(request.url).protocol === "https:"
    ? PRODUCTION_COOKIE_NAME
    : LOCAL_COOKIE_NAME;
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;

    const value = part.slice(separator + 1).trim();
    return /^[A-Za-z0-9._-]{1,2048}$/.test(value) ? value : null;
  }

  return null;
}

function upstreamUrl(path: string[]): URL {
  return new URL(
    `/api/${path.map((segment) => encodeURIComponent(segment)).join("/")}`,
    API_ORIGIN,
  );
}

function upstreamHeaders(request: Request): Headers {
  const headers = new Headers();

  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  const sessionToken = readCookie(
    request.headers.get("cookie"),
    clientCookieName(request),
  );
  if (sessionToken) {
    headers.set("cookie", `${PRODUCTION_COOKIE_NAME}=${sessionToken}`);
  }

  // Vercel validates the browser's origin first. The Worker then repeats its
  // same-origin check against the only upstream this bridge can reach.
  headers.set("origin", API_ORIGIN);
  headers.set("sec-fetch-site", "same-origin");
  return headers;
}

function sanitizeSessionCookie(
  request: Request,
  setCookie: string,
): string | null {
  const parts = setCookie.split(";").map((part) => part.trim());
  const separator = parts[0]?.indexOf("=") ?? -1;
  if (separator < 0 || parts[0].slice(0, separator) !== PRODUCTION_COOKIE_NAME) {
    return null;
  }

  const value = parts[0].slice(separator + 1);
  if (!/^[A-Za-z0-9._-]{0,2048}$/.test(value)) return null;

  const attributes = new Map<string, string | true>();
  for (const rawAttribute of parts.slice(1)) {
    const attributeSeparator = rawAttribute.indexOf("=");
    if (attributeSeparator < 0) {
      attributes.set(rawAttribute.toLowerCase(), true);
    } else {
      attributes.set(
        rawAttribute.slice(0, attributeSeparator).trim().toLowerCase(),
        rawAttribute.slice(attributeSeparator + 1).trim(),
      );
    }
  }

  const maxAge = attributes.get("max-age");
  const numericMaxAge =
    typeof maxAge === "string" && /^\d+$/.test(maxAge)
      ? Number(maxAge)
      : Number.NaN;
  if (
    attributes.get("path") !== "/" ||
    attributes.get("httponly") !== true ||
    attributes.get("secure") !== true ||
    String(attributes.get("samesite")).toLowerCase() !== "strict" ||
    attributes.has("domain") ||
    !Number.isSafeInteger(numericMaxAge) ||
    numericMaxAge < 0 ||
    numericMaxAge > SESSION_MAX_AGE_SECONDS
  ) {
    return null;
  }

  const isSecure = new URL(request.url).protocol === "https:";
  return `${clientCookieName(request)}=${value}; Path=/; Max-Age=${numericMaxAge}; HttpOnly; SameSite=Strict${isSecure ? "; Secure" : ""}`;
}

function clientHeaders(request: Request, upstream: Response): Headers {
  const headers = protectedHeaders();

  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  const upstreamHeadersWithCookies = upstream.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const cookies =
    typeof upstreamHeadersWithCookies.getSetCookie === "function"
      ? upstreamHeadersWithCookies.getSetCookie()
      : [upstream.headers.get("set-cookie")].filter(
          (value): value is string => value !== null,
        );

  for (const cookie of cookies) {
    const sanitizedCookie = sanitizeSessionCookie(request, cookie);
    if (sanitizedCookie) headers.append("set-cookie", sanitizedCookie);
  }

  return headers;
}

async function readBody(request: Request): Promise<ArrayBuffer | null> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return null;
  }

  const body = await request.arrayBuffer();
  return body.byteLength <= MAX_BODY_BYTES ? body : null;
}

export async function proxyApiRequest(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { path } = await context.params;
  const methods = Array.isArray(path) ? allowedMethods(path) : null;
  if (!methods) {
    return errorResponse(404, "NOT_FOUND", "API route not found.");
  }
  if (!methods.includes(request.method)) {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "That method is not allowed.", {
      Allow: methods.join(", "),
    });
  }

  if (new URL(request.url).search) {
    return errorResponse(400, "INVALID_REQUEST", "Query parameters are not allowed.");
  }

  if (request.method !== "GET" && !isAllowedWrite(request)) {
    return errorResponse(403, "INVALID_ORIGIN", "This request was not accepted.");
  }

  const body = request.method === "GET" ? undefined : await readBody(request);
  if (body === null) {
    return errorResponse(413, "PAYLOAD_TOO_LARGE", "The request is too large.");
  }

  const timeoutSignal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(upstreamUrl(path), {
      method: request.method,
      headers: upstreamHeaders(request),
      body,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.any([request.signal, timeoutSignal]),
    });

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: clientHeaders(request, upstream),
    });
  } catch {
    if (timeoutSignal.aborted) {
      return errorResponse(
        504,
        "UPSTREAM_TIMEOUT",
        "The expense service took too long to respond.",
      );
    }

    return errorResponse(
      502,
      "UPSTREAM_UNAVAILABLE",
      "The expense service could not be reached.",
    );
  }
}

export const GET = proxyApiRequest;
export const POST = proxyApiRequest;
export const PATCH = proxyApiRequest;
export const DELETE = proxyApiRequest;
