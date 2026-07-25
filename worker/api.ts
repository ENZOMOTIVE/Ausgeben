import {
  AuthConfigurationError,
  authenticateCredentials,
  checkLoginRateLimit,
  clearLoginFailures,
  createSessionToken,
  getAuthenticatedUser,
  isSameOriginJsonWrite,
  makeExpiredSessionCookie,
  makeSessionCookie,
  recordLoginFailure,
} from "./auth";
import {
  LedgerDatabaseError,
  createExpense,
  deleteExpense,
  ensureSchema,
  getLedger,
  updateExpense,
  type ExpenseInput,
} from "./database";
import type { WorkerEnv } from "./types";

const MAX_JSON_BODY_BYTES = 2_048;
const MAX_PASSWORD_BYTES = 128;
const MAX_USER_ID_LENGTH = 64;

type JsonObject = Record<string, unknown>;

function apiHeaders(additional?: HeadersInit): Headers {
  const headers = new Headers(additional);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Vary", "Cookie, Origin, Sec-Fetch-Site");
  return headers;
}

function jsonResponse(
  body: unknown,
  status = 200,
  additionalHeaders?: HeadersInit,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: apiHeaders(additionalHeaders),
  });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  additionalHeaders?: HeadersInit,
): Response {
  return jsonResponse(
    { error: { code, message }, message },
    status,
    additionalHeaders,
  );
}

function methodNotAllowed(allowedMethods: string[]): Response {
  return errorResponse(
    405,
    "METHOD_NOT_ALLOWED",
    "That method is not allowed.",
    { Allow: allowedMethods.join(", ") },
  );
}

async function readJsonObject(request: Request): Promise<JsonObject | null> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    return null;
  }

  const text = await request.text();
  if (encoderLength(text) > MAX_JSON_BODY_BYTES) return null;

  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as JsonObject;
  } catch {
    return null;
  }
}

function encoderLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function parseExpenseInput(value: JsonObject | null): ExpenseInput | null {
  if (!value) return null;

  const { amountCents, date, description } = value;
  if (
    typeof description !== "string" ||
    typeof amountCents !== "number" ||
    typeof date !== "string"
  ) {
    return null;
  }

  const input: ExpenseInput = { description, amountCents, date };
  if (value.id !== undefined) {
    if (typeof value.id !== "string") return null;
    input.id = value.id;
  }

  return input;
}

async function handleLogin(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);

  await ensureSchema(env.DB);
  const rateLimit = await checkLoginRateLimit(request, env);
  if (!rateLimit.allowed) {
    return errorResponse(
      429,
      "RATE_LIMITED",
      "Too many login attempts. Try again later.",
      { "Retry-After": String(rateLimit.retryAfterSeconds) },
    );
  }

  const body = await readJsonObject(request);
  const claimedUserId = body?.userId ?? body?.username;
  const password = body?.password;
  const shapeIsValid =
    typeof claimedUserId === "string" &&
    claimedUserId.length <= MAX_USER_ID_LENGTH &&
    typeof password === "string" &&
    encoderLength(password) <= MAX_PASSWORD_BYTES;

  // A malformed attempt still performs the same expensive verifier operation.
  const user = await authenticateCredentials(
    shapeIsValid ? claimedUserId : null,
    shapeIsValid ? password : "",
    env,
  );

  if (!shapeIsValid || !user) {
    await recordLoginFailure(request, env);
    return errorResponse(401, "INVALID_CREDENTIALS", "Invalid username or password.");
  }

  await clearLoginFailures(request, env);
  const token = await createSessionToken(user.id, env);
  return jsonResponse(
    { user },
    200,
    { "Set-Cookie": makeSessionCookie(request, token) },
  );
}

async function handleSession(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const user = await getAuthenticatedUser(request, env);
  return user
    ? jsonResponse({ user })
    : errorResponse(401, "UNAUTHENTICATED", "Sign in to continue.");
}

function handleLogout(request: Request): Response {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);

  const headers = apiHeaders({
    "Set-Cookie": makeExpiredSessionCookie(request),
  });
  headers.delete("Content-Type");
  return new Response(null, { status: 204, headers });
}

async function handleLedger(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const user = await getAuthenticatedUser(request, env);
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in to continue.");

  const ledger = await getLedger(env.DB, user.id);
  return jsonResponse({
    currentMonth: ledger.currentMonth,
    today: ledger.today,
    expenses: ledger.expenses,
    monthlySummaries: ledger.archive,
    todayTotalCents: ledger.todayTotalCents,
    monthTotalCents: ledger.monthTotalCents,
  });
}

async function handleExpensesCollection(
  request: Request,
  env: WorkerEnv,
): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await getAuthenticatedUser(request, env);
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in to continue.");

  const input = parseExpenseInput(await readJsonObject(request));
  if (!input) {
    return errorResponse(400, "INVALID_REQUEST", "Enter a valid expense.");
  }

  const expense = await createExpense(env.DB, user.id, input);
  return jsonResponse({ expense }, 201);
}

async function handleExpenseItem(
  request: Request,
  env: WorkerEnv,
  rawId: string,
): Promise<Response> {
  const user = await getAuthenticatedUser(request, env);
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in to continue.");

  let id: string;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    return errorResponse(400, "INVALID_REQUEST", "The expense identifier is invalid.");
  }

  if (request.method === "PATCH") {
    const input = parseExpenseInput(await readJsonObject(request));
    if (!input) {
      return errorResponse(400, "INVALID_REQUEST", "Enter a valid expense.");
    }

    const expense = await updateExpense(env.DB, user.id, id, input);
    return jsonResponse({ expense });
  }

  if (request.method === "DELETE") {
    await deleteExpense(env.DB, user.id, id);
    const headers = apiHeaders();
    headers.delete("Content-Type");
    return new Response(null, { status: 204, headers });
  }

  return methodNotAllowed(["PATCH", "DELETE"]);
}

function mapApiError(error: unknown): Response {
  if (error instanceof LedgerDatabaseError) {
    return errorResponse(error.status, error.code, error.message);
  }

  if (error instanceof AuthConfigurationError) {
    return errorResponse(
      503,
      "AUTH_UNAVAILABLE",
      "Sign-in is temporarily unavailable.",
    );
  }

  return errorResponse(
    500,
    "INTERNAL_ERROR",
    "Something went wrong. Please try again.",
  );
}

/** Returns null only when the request is not for the JSON API. */
export async function handleApiRequest(
  request: Request,
  env: WorkerEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;

  const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
  if (isWrite && !isSameOriginJsonWrite(request)) {
    return errorResponse(403, "INVALID_ORIGIN", "This request was not accepted.");
  }

  try {
    if (url.pathname === "/api/auth/login") {
      return await handleLogin(request, env);
    }
    if (url.pathname === "/api/auth/session") {
      return await handleSession(request, env);
    }
    if (url.pathname === "/api/auth/logout") return handleLogout(request);
    if (url.pathname === "/api/ledger") {
      return await handleLedger(request, env);
    }
    if (url.pathname === "/api/expenses") {
      return await handleExpensesCollection(request, env);
    }

    const expenseMatch = url.pathname.match(/^\/api\/expenses\/([^/]+)$/);
    if (expenseMatch) {
      return await handleExpenseItem(request, env, expenseMatch[1]);
    }

    return errorResponse(404, "NOT_FOUND", "API route not found.");
  } catch (error) {
    return mapApiError(error);
  }
}
