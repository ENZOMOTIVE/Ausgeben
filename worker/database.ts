import type { WorkerD1Database } from "./types";

export type AppUserId = "aayushman" | "carlin";

export type ExpenseInput = {
  id?: string;
  description: string;
  amountCents: number;
  date: string;
};

export type ExpenseRecord = {
  id: string;
  description: string;
  amountCents: number;
  date: string;
  monthKey: string;
  createdBy: AppUserId;
  createdAt: string;
  updatedAt: string;
};

export type MonthlySummary = {
  monthKey: string;
  totalCents: number;
  aayushmanTotalCents: number;
  carlinTotalCents: number;
  expenseCount: number;
  archivedAt: string;
};

export type UserTotals = Record<AppUserId, number>;

export type LedgerResult = {
  currentUser: AppUserId;
  today: string;
  currentMonth: string;
  expenses: ExpenseRecord[];
  archive: MonthlySummary[];
  todayTotals: UserTotals;
  monthTotals: UserTotals;
};

export type BerlinClock = {
  today: string;
  monthKey: string;
  timestamp: string;
};

type ErrorCode =
  | "FORBIDDEN"
  | "ID_CONFLICT"
  | "INVALID_AMOUNT"
  | "INVALID_DATE"
  | "INVALID_DESCRIPTION"
  | "INVALID_ID"
  | "MONTH_ARCHIVED"
  | "NOT_FOUND";

export class LedgerDatabaseError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string, status: number) {
    super(message);
    this.name = "LedgerDatabaseError";
    this.code = code;
    this.status = status;
  }
}

type D1BatchResult = {
  results?: unknown[];
  meta?: { changes?: number };
};

type CanonicalMonthRow = {
  currentMonth: string;
};

type CurrentTotalsRow = {
  aayushmanMonthTotalCents: number;
  carlinMonthTotalCents: number;
  aayushmanTodayTotalCents: number;
  carlinTodayTotalCents: number;
};

const MAX_AMOUNT_CENTS = 999_999_999;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const USERS: ReadonlySet<string> = new Set<AppUserId>([
  "aayushman",
  "carlin",
]);

const schemaPromises = new WeakMap<WorkerD1Database, Promise<void>>();

const CREATE_EXPENSES_SQL = `
  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY NOT NULL,
    description TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    date TEXT NOT NULL,
    month_key TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CONSTRAINT expenses_amount_positive
      CHECK (amount_cents > 0),
    CONSTRAINT expenses_description_length
      CHECK (length(description) BETWEEN 1 AND 80),
    CONSTRAINT expenses_month_matches_date
      CHECK (month_key = substr(date, 1, 7)),
    CONSTRAINT expenses_known_creator
      CHECK (created_by IN ('aayushman', 'carlin'))
  )
`;

const CREATE_MONTHLY_SUMMARIES_SQL = `
  CREATE TABLE IF NOT EXISTS monthly_summaries (
    month_key TEXT PRIMARY KEY NOT NULL,
    total_cents INTEGER NOT NULL,
    aayushman_total_cents INTEGER NOT NULL DEFAULT 0,
    carlin_total_cents INTEGER NOT NULL DEFAULT 0,
    expense_count INTEGER NOT NULL,
    archived_at TEXT NOT NULL,
    CONSTRAINT monthly_total_nonnegative CHECK (total_cents >= 0),
    CONSTRAINT monthly_aayushman_total_nonnegative
      CHECK (aayushman_total_cents >= 0),
    CONSTRAINT monthly_carlin_total_nonnegative
      CHECK (carlin_total_cents >= 0),
    CONSTRAINT monthly_count_nonnegative CHECK (expense_count >= 0)
  )
`;

const CREATE_LEDGER_STATE_SQL = `
  CREATE TABLE IF NOT EXISTS ledger_state (
    singleton INTEGER PRIMARY KEY NOT NULL,
    current_month TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CONSTRAINT ledger_singleton CHECK (singleton = 1)
  )
`;

const CREATE_LOGIN_ATTEMPTS_SQL = `
  CREATE TABLE IF NOT EXISTS login_attempts (
    rate_key TEXT PRIMARY KEY NOT NULL,
    failures INTEGER NOT NULL,
    window_started_at INTEGER NOT NULL,
    blocked_until INTEGER NOT NULL
  )
`;

const ADVANCE_MONTH_SQL = `
  INSERT INTO ledger_state (singleton, current_month, updated_at)
  VALUES (1, ?1, ?2)
  ON CONFLICT (singleton) DO UPDATE SET
    current_month = max(ledger_state.current_month, excluded.current_month),
    updated_at = CASE
      WHEN excluded.current_month > ledger_state.current_month
        THEN excluded.updated_at
      ELSE ledger_state.updated_at
    END
`;

const ARCHIVE_OLD_EXPENSES_SQL = `
  INSERT INTO monthly_summaries (
    month_key,
    total_cents,
    aayushman_total_cents,
    carlin_total_cents,
    expense_count,
    archived_at
  )
  SELECT
    month_key,
    sum(amount_cents),
    sum(CASE WHEN created_by = 'aayushman' THEN amount_cents ELSE 0 END),
    sum(CASE WHEN created_by = 'carlin' THEN amount_cents ELSE 0 END),
    count(*),
    ?1
  FROM expenses
  WHERE month_key < (
    SELECT current_month FROM ledger_state WHERE singleton = 1
  )
  GROUP BY month_key
  ON CONFLICT (month_key) DO UPDATE SET
    total_cents = monthly_summaries.total_cents + excluded.total_cents,
    aayushman_total_cents =
      monthly_summaries.aayushman_total_cents
      + excluded.aayushman_total_cents,
    carlin_total_cents =
      monthly_summaries.carlin_total_cents
      + excluded.carlin_total_cents,
    expense_count = monthly_summaries.expense_count + excluded.expense_count,
    archived_at = excluded.archived_at
`;

const DELETE_ARCHIVED_EXPENSES_SQL = `
  DELETE FROM expenses
  WHERE month_key < (
    SELECT current_month FROM ledger_state WHERE singleton = 1
  )
`;

const SELECT_CANONICAL_MONTH_SQL = `
  SELECT current_month AS currentMonth
  FROM ledger_state
  WHERE singleton = 1
`;

const SELECT_CURRENT_EXPENSES_SQL = `
  SELECT
    id,
    description,
    amount_cents AS amountCents,
    date,
    month_key AS monthKey,
    created_by AS createdBy,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM expenses
  WHERE month_key = (
    SELECT current_month FROM ledger_state WHERE singleton = 1
  )
    AND created_by = ?1
  ORDER BY date DESC, created_at DESC
`;

const SELECT_CURRENT_TOTALS_SQL = `
  SELECT
    coalesce(sum(
      CASE WHEN created_by = 'aayushman' THEN amount_cents ELSE 0 END
    ), 0) AS aayushmanMonthTotalCents,
    coalesce(sum(
      CASE WHEN created_by = 'carlin' THEN amount_cents ELSE 0 END
    ), 0) AS carlinMonthTotalCents,
    coalesce(sum(
      CASE
        WHEN created_by = 'aayushman' AND date = ?1 THEN amount_cents
        ELSE 0
      END
    ), 0) AS aayushmanTodayTotalCents,
    coalesce(sum(
      CASE
        WHEN created_by = 'carlin' AND date = ?1 THEN amount_cents
        ELSE 0
      END
    ), 0) AS carlinTodayTotalCents
  FROM expenses
  WHERE month_key = (
    SELECT current_month FROM ledger_state WHERE singleton = 1
  )
`;

const SELECT_ARCHIVE_SQL = `
  SELECT
    month_key AS monthKey,
    total_cents AS totalCents,
    aayushman_total_cents AS aayushmanTotalCents,
    carlin_total_cents AS carlinTotalCents,
    expense_count AS expenseCount,
    archived_at AS archivedAt
  FROM monthly_summaries
  ORDER BY month_key DESC
`;

const SELECT_EXPENSE_BY_ID_SQL = `
  SELECT
    id,
    description,
    amount_cents AS amountCents,
    date,
    month_key AS monthKey,
    created_by AS createdBy,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM expenses
  WHERE id = ?1
`;

function rows<T>(result: D1BatchResult | undefined): T[] {
  return (result?.results ?? []) as T[];
}

function changedRows(result: D1BatchResult | undefined): number {
  return result?.meta?.changes ?? 0;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1];
}

function requireUser(user: AppUserId): AppUserId {
  if (!USERS.has(user)) {
    throw new LedgerDatabaseError(
      "FORBIDDEN",
      "This account cannot access the ledger.",
      403,
    );
  }

  return user;
}

function normalizeExpenseInput(
  input: ExpenseInput,
  clock: BerlinClock,
): Required<ExpenseInput> {
  const id = input.id ?? crypto.randomUUID();
  const description =
    typeof input.description === "string" ? input.description.trim() : "";

  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    throw new LedgerDatabaseError(
      "INVALID_ID",
      "The expense identifier is invalid.",
      422,
    );
  }

  if (description.length < 1 || description.length > 80) {
    throw new LedgerDatabaseError(
      "INVALID_DESCRIPTION",
      "Describe the expense using 1 to 80 characters.",
      422,
    );
  }

  if (
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents < 1 ||
    input.amountCents > MAX_AMOUNT_CENTS
  ) {
    throw new LedgerDatabaseError(
      "INVALID_AMOUNT",
      "The amount must be a positive whole number of cents.",
      422,
    );
  }

  if (
    typeof input.date !== "string" ||
    !isValidDate(input.date) ||
    input.date > clock.today
  ) {
    throw new LedgerDatabaseError(
      "INVALID_DATE",
      "Choose today or an earlier valid date.",
      422,
    );
  }

  if (input.date.slice(0, 7) !== clock.monthKey) {
    throw new LedgerDatabaseError(
      "MONTH_ARCHIVED",
      "Previous months have already been archived.",
      409,
    );
  }

  return {
    id,
    description,
    amountCents: input.amountCents,
    date: input.date,
  };
}

function rolloverStatements(db: WorkerD1Database, clock: BerlinClock) {
  return [
    db.prepare(ADVANCE_MONTH_SQL).bind(clock.monthKey, clock.timestamp),
    db.prepare(ARCHIVE_OLD_EXPENSES_SQL).bind(clock.timestamp),
    db.prepare(DELETE_ARCHIVED_EXPENSES_SQL),
  ];
}

function isSameExpense(
  expense: ExpenseRecord,
  user: AppUserId,
  input: Required<ExpenseInput>,
): boolean {
  return (
    expense.createdBy === user &&
    expense.description === input.description &&
    expense.amountCents === input.amountCents &&
    expense.date === input.date
  );
}

async function monthlySummaryColumnExists(
  db: WorkerD1Database,
  columnName: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `
        SELECT 1 AS present
        FROM pragma_table_info('monthly_summaries')
        WHERE name = ?1
      `,
    )
    .bind(columnName)
    .first<{ present: number }>();

  return row?.present === 1;
}

async function ensureMonthlySummaryColumn(
  db: WorkerD1Database,
  columnName: string,
  alterSql: string,
): Promise<void> {
  if (await monthlySummaryColumnExists(db, columnName)) return;

  try {
    await db.prepare(alterSql).run();
  } catch (error) {
    // Another Worker isolate may have completed the same upgrade after our
    // metadata read. Rechecking makes the upgrade safe to retry in that race.
    if (await monthlySummaryColumnExists(db, columnName)) return;
    throw error;
  }
}

async function initializeSchema(db: WorkerD1Database): Promise<void> {
  await db.batch([
    db.prepare(CREATE_EXPENSES_SQL),
    db.prepare(CREATE_MONTHLY_SUMMARIES_SQL),
    db.prepare(CREATE_LEDGER_STATE_SQL),
    db.prepare(CREATE_LOGIN_ATTEMPTS_SQL),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS expenses_month_date_idx ON expenses (month_key, date, created_at)",
    ),
  ]);

  await ensureMonthlySummaryColumn(
    db,
    "aayushman_total_cents",
    `
      ALTER TABLE monthly_summaries
      ADD COLUMN aayushman_total_cents INTEGER NOT NULL DEFAULT 0
      CONSTRAINT monthly_aayushman_total_nonnegative CHECK (
        aayushman_total_cents >= 0
      )
    `,
  );
  await ensureMonthlySummaryColumn(
    db,
    "carlin_total_cents",
    `
      ALTER TABLE monthly_summaries
      ADD COLUMN carlin_total_cents INTEGER NOT NULL DEFAULT 0
      CONSTRAINT monthly_carlin_total_nonnegative CHECK (
        carlin_total_cents >= 0
      )
    `,
  );
}

export function getBerlinClock(now = new Date()): BerlinClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const today = `${values.year}-${values.month}-${values.day}`;

  return {
    today,
    monthKey: today.slice(0, 7),
    timestamp: now.toISOString(),
  };
}

export function ensureSchema(db: WorkerD1Database): Promise<void> {
  const pendingSchema = schemaPromises.get(db);
  if (pendingSchema) return pendingSchema;

  const schemaPromise = initializeSchema(db)
    .catch((error: unknown) => {
      schemaPromises.delete(db);
      throw error;
    });

  schemaPromises.set(db, schemaPromise);
  return schemaPromise;
}

export async function getLedger(
  db: WorkerD1Database,
  user: AppUserId,
): Promise<LedgerResult> {
  requireUser(user);
  await ensureSchema(db);
  const clock = getBerlinClock();

  const results = (await db.batch([
    ...rolloverStatements(db, clock),
    db.prepare(SELECT_CANONICAL_MONTH_SQL),
    db.prepare(SELECT_CURRENT_EXPENSES_SQL).bind(user),
    db.prepare(SELECT_CURRENT_TOTALS_SQL).bind(clock.today),
    db.prepare(SELECT_ARCHIVE_SQL),
  ])) as unknown as D1BatchResult[];

  const currentMonth = rows<CanonicalMonthRow>(results[3])[0]?.currentMonth;
  if (!currentMonth) {
    throw new Error("The ledger month could not be initialized.");
  }

  const expenses = rows<ExpenseRecord>(results[4]);
  const totals = rows<CurrentTotalsRow>(results[5])[0];
  const archive = rows<MonthlySummary>(results[6]);

  if (!totals) {
    throw new Error("The ledger totals could not be calculated.");
  }

  return {
    currentUser: user,
    today: clock.today,
    currentMonth,
    expenses,
    archive,
    todayTotals: {
      aayushman: totals.aayushmanTodayTotalCents,
      carlin: totals.carlinTodayTotalCents,
    },
    monthTotals: {
      aayushman: totals.aayushmanMonthTotalCents,
      carlin: totals.carlinMonthTotalCents,
    },
  };
}

export async function createExpense(
  db: WorkerD1Database,
  user: AppUserId,
  input: ExpenseInput,
): Promise<ExpenseRecord> {
  requireUser(user);
  await ensureSchema(db);
  const clock = getBerlinClock();
  const expense = normalizeExpenseInput(input, clock);

  const results = (await db.batch([
    ...rolloverStatements(db, clock),
    db.prepare(
      `
        INSERT INTO expenses (
          id,
          description,
          amount_cents,
          date,
          month_key,
          created_by,
          created_at,
          updated_at
        )
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7
        WHERE ?5 = (
          SELECT current_month FROM ledger_state WHERE singleton = 1
        )
        ON CONFLICT (id) DO NOTHING
      `,
    ).bind(
      expense.id,
      expense.description,
      expense.amountCents,
      expense.date,
      clock.monthKey,
      user,
      clock.timestamp,
    ),
    db.prepare(SELECT_EXPENSE_BY_ID_SQL).bind(expense.id),
  ])) as unknown as D1BatchResult[];

  const storedExpense = rows<ExpenseRecord>(results[4])[0];
  if (changedRows(results[3]) === 0) {
    if (storedExpense && isSameExpense(storedExpense, user, expense)) {
      return storedExpense;
    }

    if (storedExpense) {
      throw new LedgerDatabaseError(
        "ID_CONFLICT",
        "That expense identifier is already in use.",
        409,
      );
    }

    throw new LedgerDatabaseError(
      "MONTH_ARCHIVED",
      "The month changed before this expense could be saved. Please try again.",
      409,
    );
  }

  if (!storedExpense) {
    throw new Error("The saved expense could not be read.");
  }

  return storedExpense;
}

export async function updateExpense(
  db: WorkerD1Database,
  user: AppUserId,
  id: string,
  input: ExpenseInput,
): Promise<ExpenseRecord> {
  requireUser(user);
  await ensureSchema(db);
  const clock = getBerlinClock();
  const expense = normalizeExpenseInput({ ...input, id }, clock);

  const results = (await db.batch([
    ...rolloverStatements(db, clock),
    db.prepare(
      `
        UPDATE expenses
        SET
          description = ?1,
          amount_cents = ?2,
          date = ?3,
          month_key = ?4,
          updated_at = ?5
        WHERE id = ?6
          AND created_by = ?7
          AND month_key = (
            SELECT current_month FROM ledger_state WHERE singleton = 1
          )
          AND ?4 = (
            SELECT current_month FROM ledger_state WHERE singleton = 1
          )
      `,
    ).bind(
      expense.description,
      expense.amountCents,
      expense.date,
      clock.monthKey,
      clock.timestamp,
      expense.id,
      user,
    ),
    db.prepare(SELECT_EXPENSE_BY_ID_SQL).bind(expense.id),
  ])) as unknown as D1BatchResult[];

  const storedExpense = rows<ExpenseRecord>(results[4])[0];
  if (changedRows(results[3]) === 0) {
    if (!storedExpense) {
      throw new LedgerDatabaseError(
        "NOT_FOUND",
        "This expense no longer exists.",
        404,
      );
    }

    if (storedExpense.createdBy !== user) {
      throw new LedgerDatabaseError(
        "FORBIDDEN",
        "Only the person who added this expense can edit it.",
        403,
      );
    }

    if (isSameExpense(storedExpense, user, expense)) return storedExpense;

    throw new LedgerDatabaseError(
      "MONTH_ARCHIVED",
      "The month changed before this expense could be updated.",
      409,
    );
  }

  if (!storedExpense) {
    throw new Error("The updated expense could not be read.");
  }

  return storedExpense;
}

export async function deleteExpense(
  db: WorkerD1Database,
  user: AppUserId,
  id: string,
): Promise<{ id: string }> {
  requireUser(user);
  await ensureSchema(db);
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    throw new LedgerDatabaseError(
      "INVALID_ID",
      "The expense identifier is invalid.",
      422,
    );
  }

  const clock = getBerlinClock();
  const results = (await db.batch([
    ...rolloverStatements(db, clock),
    db.prepare(
      `
        DELETE FROM expenses
        WHERE id = ?1
          AND created_by = ?2
          AND month_key = (
            SELECT current_month FROM ledger_state WHERE singleton = 1
          )
      `,
    ).bind(id, user),
    db.prepare(SELECT_EXPENSE_BY_ID_SQL).bind(id),
  ])) as unknown as D1BatchResult[];

  if (changedRows(results[3]) > 0) return { id };

  const storedExpense = rows<ExpenseRecord>(results[4])[0];
  if (storedExpense && storedExpense.createdBy !== user) {
    throw new LedgerDatabaseError(
      "FORBIDDEN",
      "Only the person who added this expense can delete it.",
      403,
    );
  }

  throw new LedgerDatabaseError(
    "NOT_FOUND",
    "This expense no longer exists.",
    404,
  );
}
