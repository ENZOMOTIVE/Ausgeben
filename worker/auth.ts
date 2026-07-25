import type {
  AuthenticatedUser,
  UserId,
  WorkerD1Database,
  WorkerEnv,
} from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

const ACCOUNTS: Readonly<Record<UserId, AuthenticatedUser>> = {
  aayushman: { id: "aayushman", displayName: "Aayushman" },
  carlin: { id: "carlin", displayName: "Carlin" },
};

const PASSWORD_ALGORITHM = "pbkdf2-sha256";
const PASSWORD_ITERATIONS = 600_000;
const SESSION_VERSION = 1;
const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;
const SESSION_CLOCK_SKEW_SECONDS = 60;
const PRODUCTION_COOKIE_NAME = "__Host-ausgeben_session";
const LOCAL_COOKIE_NAME = "ausgeben_session";
const RATE_LIMIT_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

type SessionPayload = {
  sub: UserId;
  iat: number;
  exp: number;
  sv: typeof SESSION_VERSION;
};

export type LoginRateLimit =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

function toBase64Url(bytes: Uint8Array<ArrayBufferLike>): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid base64url value");
  }

  const standard = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function isUserId(value: unknown): value is UserId {
  return value === "aayushman" || value === "carlin";
}

export function normalizeUserId(value: unknown): UserId | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLocaleLowerCase("en-US");
  return isUserId(normalized) ? normalized : null;
}

function verifierForUser(env: WorkerEnv, userId: UserId | null): string {
  if (userId === "carlin") return env.PASSWORD_VERIFIER_CARLIN;
  if (userId === "aayushman") return env.PASSWORD_VERIFIER_AAYUSHMAN;
  return env.PASSWORD_VERIFIER_DUMMY || env.PASSWORD_VERIFIER_AAYUSHMAN;
}

function parsePasswordVerifier(value: string): {
  salt: Uint8Array<ArrayBuffer>;
  expectedHash: Uint8Array<ArrayBuffer>;
} {
  const [algorithm, iterations, encodedSalt, encodedHash, extra] =
    value?.split("$") ?? [];

  if (
    algorithm !== PASSWORD_ALGORITHM ||
    iterations !== String(PASSWORD_ITERATIONS) ||
    !encodedSalt ||
    !encodedHash ||
    extra !== undefined
  ) {
    throw new AuthConfigurationError(
      "Password verifier must use pbkdf2-sha256 with 600000 iterations.",
    );
  }

  try {
    const salt = fromBase64Url(encodedSalt);
    const expectedHash = fromBase64Url(encodedHash);

    if (salt.byteLength < 16 || expectedHash.byteLength !== 32) {
      throw new Error("Invalid verifier length");
    }

    return { salt, expectedHash };
  } catch (error) {
    if (error instanceof AuthConfigurationError) throw error;
    throw new AuthConfigurationError("Password verifier is malformed.");
  }
}

function constantTimeEqual(
  left: Uint8Array<ArrayBufferLike>,
  right: Uint8Array<ArrayBufferLike>,
): boolean {
  if (left.byteLength !== right.byteLength) return false;

  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }

  return difference === 0;
}

async function verifyPassword(password: string, verifier: string): Promise<boolean> {
  const { salt, expectedHash } = parsePasswordVerifier(verifier);
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedHash = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt,
        iterations: PASSWORD_ITERATIONS,
      },
      passwordKey,
      256,
    ),
  );

  return constantTimeEqual(derivedHash, expectedHash);
}

export async function authenticateCredentials(
  claimedUserId: unknown,
  password: string,
  env: WorkerEnv,
): Promise<AuthenticatedUser | null> {
  const userId = normalizeUserId(claimedUserId);
  const passwordMatches = await verifyPassword(
    password,
    verifierForUser(env, userId),
  );

  return passwordMatches && userId ? ACCOUNTS[userId] : null;
}

function getSigningKeyBytes(env: WorkerEnv): Uint8Array<ArrayBuffer> {
  const configuredKey = env.SESSION_SIGNING_KEY;

  try {
    const decoded = fromBase64Url(configuredKey);
    if (decoded.byteLength >= 32) return decoded;
  } catch {
    // A high-entropy raw secret is also valid and convenient for local Sites envs.
  }

  const raw = encoder.encode(configuredKey);
  if (raw.byteLength >= 32) return raw;

  throw new AuthConfigurationError(
    "SESSION_SIGNING_KEY must contain at least 32 random bytes.",
  );
}

async function importSigningKey(env: WorkerEnv): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    getSigningKeyBytes(env),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signValue(
  value: string,
  env: WorkerEnv,
): Promise<Uint8Array<ArrayBuffer>> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importSigningKey(env),
    encoder.encode(value),
  );
  return new Uint8Array(signature);
}

export async function createSessionToken(
  userId: UserId,
  env: WorkerEnv,
  now = new Date(),
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload: SessionPayload = {
    sub: userId,
    iat: issuedAt,
    exp: issuedAt + SESSION_MAX_AGE_SECONDS,
    sv: SESSION_VERSION,
  };
  const encodedPayload = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signedValue = `v${SESSION_VERSION}.${encodedPayload}`;
  const signature = toBase64Url(await signValue(signedValue, env));

  return `${signedValue}.${signature}`;
}

export async function verifySessionToken(
  token: string,
  env: WorkerEnv,
  now = new Date(),
): Promise<AuthenticatedUser | null> {
  if (!token || token.length > 2_048) return null;

  try {
    const [version, encodedPayload, encodedSignature, extra] = token.split(".");
    if (
      version !== `v${SESSION_VERSION}` ||
      !encodedPayload ||
      !encodedSignature ||
      extra !== undefined
    ) {
      return null;
    }

    const signedValue = `${version}.${encodedPayload}`;
    const signatureIsValid = await crypto.subtle.verify(
      "HMAC",
      await importSigningKey(env),
      fromBase64Url(encodedSignature),
      encoder.encode(signedValue),
    );
    if (!signatureIsValid) return null;

    const payload = JSON.parse(
      decoder.decode(fromBase64Url(encodedPayload)),
    ) as Partial<SessionPayload>;
    const currentTime = Math.floor(now.getTime() / 1000);

    if (
      !isUserId(payload.sub) ||
      payload.sv !== SESSION_VERSION ||
      !Number.isSafeInteger(payload.iat) ||
      !Number.isSafeInteger(payload.exp) ||
      (payload.iat as number) > currentTime + SESSION_CLOCK_SKEW_SECONDS ||
      (payload.exp as number) <= currentTime ||
      (payload.exp as number) - (payload.iat as number) >
        SESSION_MAX_AGE_SECONDS + SESSION_CLOCK_SKEW_SECONDS
    ) {
      return null;
    }

    return ACCOUNTS[payload.sub];
  } catch (error) {
    if (error instanceof AuthConfigurationError) throw error;
    return null;
  }
}

function cookieName(request: Request): string {
  return new URL(request.url).protocol === "https:"
    ? PRODUCTION_COOKIE_NAME
    : LOCAL_COOKIE_NAME;
}

function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }

  return null;
}

export async function getAuthenticatedUser(
  request: Request,
  env: WorkerEnv,
): Promise<AuthenticatedUser | null> {
  const token = readCookie(request, cookieName(request));
  return token ? verifySessionToken(token, env) : null;
}

function cookieSecurityAttributes(request: Request): string {
  return new URL(request.url).protocol === "https:" ? "; Secure" : "";
}

export function makeSessionCookie(request: Request, token: string): string {
  return `${cookieName(request)}=${token}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; SameSite=Strict${cookieSecurityAttributes(request)}`;
}

export function makeExpiredSessionCookie(request: Request): string {
  return `${cookieName(request)}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${cookieSecurityAttributes(request)}`;
}

export function isSameOriginJsonWrite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return false;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return false;
  }

  return request.headers.get("x-ausgeben-request") === "1";
}

async function makeRateKey(request: Request, env: WorkerEnv): Promise<string> {
  const connectingIp = request.headers.get("cf-connecting-ip") ?? "unknown";
  return `login:${toBase64Url(await signValue(`login\0${connectingIp}`, env))}`;
}

export async function checkLoginRateLimit(
  request: Request,
  env: WorkerEnv,
  now = new Date(),
): Promise<LoginRateLimit> {
  const rateKey = await makeRateKey(request, env);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const row = await env.DB.prepare(
    `SELECT failures, window_started_at AS windowStartedAt,
            blocked_until AS blockedUntil
       FROM login_attempts
      WHERE rate_key = ?`,
  )
    .bind(rateKey)
    .first<{
      failures: number;
      windowStartedAt: number;
      blockedUntil: number;
    }>();

  if (!row) return { allowed: true };

  if (row.blockedUntil > nowSeconds) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, row.blockedUntil - nowSeconds),
    };
  }

  if (
    row.failures >= RATE_LIMIT_ATTEMPTS &&
    row.windowStartedAt + RATE_LIMIT_WINDOW_SECONDS > nowSeconds
  ) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        row.windowStartedAt + RATE_LIMIT_WINDOW_SECONDS - nowSeconds,
      ),
    };
  }

  return { allowed: true };
}

export async function recordLoginFailure(
  request: Request,
  env: WorkerEnv,
  now = new Date(),
): Promise<void> {
  const rateKey = await makeRateKey(request, env);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const expiredBefore = nowSeconds - RATE_LIMIT_WINDOW_SECONDS;
  const blockedUntil = nowSeconds + RATE_LIMIT_WINDOW_SECONDS;

  await env.DB.prepare(
    `INSERT INTO login_attempts
       (rate_key, failures, window_started_at, blocked_until)
     VALUES (?, 1, ?, 0)
     ON CONFLICT(rate_key) DO UPDATE SET
       failures = CASE
         WHEN login_attempts.window_started_at <= ? THEN 1
         ELSE login_attempts.failures + 1
       END,
       window_started_at = CASE
         WHEN login_attempts.window_started_at <= ? THEN ?
         ELSE login_attempts.window_started_at
       END,
       blocked_until = CASE
         WHEN login_attempts.window_started_at <= ? THEN 0
         WHEN login_attempts.failures + 1 >= ? THEN ?
         ELSE login_attempts.blocked_until
       END`,
  )
    .bind(
      rateKey,
      nowSeconds,
      expiredBefore,
      expiredBefore,
      nowSeconds,
      expiredBefore,
      RATE_LIMIT_ATTEMPTS,
      blockedUntil,
    )
    .run();
}

export async function clearLoginFailures(
  request: Request,
  env: WorkerEnv,
): Promise<void> {
  const rateKey = await makeRateKey(request, env);
  await env.DB.prepare("DELETE FROM login_attempts WHERE rate_key = ?")
    .bind(rateKey)
    .run();
}

/** Exported for narrow database/test contracts without exposing mutable data. */
export function getAccount(userId: UserId): AuthenticatedUser {
  return ACCOUNTS[userId];
}

/** Structural alias used by database helpers that do not need all Worker env. */
export type AuthDatabase = WorkerD1Database;
