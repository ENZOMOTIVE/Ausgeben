/** Shared Cloudflare Worker and API types. */

export type UserId = "aayushman" | "carlin";

export type AuthenticatedUser = {
  id: UserId;
  displayName: "Aayushman" | "Carlin";
};

export type ExpenseRecord = {
  id: string;
  description: string;
  amountCents: number;
  date: string;
  createdAt: string;
  updatedAt: string;
  createdBy: UserId;
};

export type ExpenseInput = Pick<
  ExpenseRecord,
  "description" | "amountCents" | "date"
>;

export type MonthlySummaryRecord = {
  monthKey: string;
  totalCents: number;
  expenseCount: number;
  archivedAt: string;
};

export type LedgerRecord = {
  currentMonth: string;
  expenses: ExpenseRecord[];
  monthlySummaries: MonthlySummaryRecord[];
};

/** Minimal structural types keep the Worker independent of Node-only packages. */
export interface WorkerD1PreparedStatement {
  bind(...values: unknown[]): WorkerD1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{
    success: boolean;
    results: T[];
    meta?: Record<string, unknown>;
  }>;
  run(): Promise<{
    success: boolean;
    meta?: Record<string, unknown> & { changes?: number };
  }>;
}

export interface WorkerD1Database {
  prepare(query: string): WorkerD1PreparedStatement;
  batch<T = unknown>(
    statements: WorkerD1PreparedStatement[],
  ): Promise<Array<{ success: boolean; results?: T[]; meta?: Record<string, unknown> }>>;
}

export interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

export interface ImageBinding {
  input(stream: ReadableStream): {
    transform(options: Record<string, unknown>): {
      output(options: {
        format: string;
        quality: number;
      }): Promise<{ response(): Response }>;
    };
  };
}

export interface WorkerEnv {
  ASSETS: AssetFetcher;
  IMAGES: ImageBinding;
  DB: WorkerD1Database;
  PASSWORD_VERIFIER_AAYUSHMAN: string;
  PASSWORD_VERIFIER_CARLIN: string;
  /** Optional; the Aayushman verifier is used as the timing dummy if omitted. */
  PASSWORD_VERIFIER_DUMMY?: string;
  /** Raw or base64url-encoded random secret (at least 32 bytes). */
  SESSION_SIGNING_KEY: string;
}

export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
