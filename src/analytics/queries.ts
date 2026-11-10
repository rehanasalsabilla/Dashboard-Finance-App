import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  BudgetAnalysis,
  DailyExpense,
  ExpenseCategory,
  PeriodRange,
  PrevExpenseCategory,
  PreviousPeriodRange,
  PreviousSummaryData,
  SavingsAccount,
  SavingsData,
  SavingsTrendPoint,
  SummaryData,
  TrendMonth,
  WeekdayWeekendData,
} from './types';

// ─── Helper: get current month as 'YYYY-MM' ───────────────────────────────────

export function currentMonthStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// ─── Helper: build a PeriodRange for a given year/month ──────────────────────

export function buildPeriodRange(year: number, month: number): PeriodRange {
  // month is 0-based (same as JS Date)
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 1);
  const monthStr = [
    startDate.getFullYear(),
    String(startDate.getMonth() + 1).padStart(2, '0'),
  ].join('-');
  return {
    startDate: formatDateObj(startDate),
    endDate: formatDateObj(endDate),
    month: monthStr,
  };
}

function formatDateObj(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Helper: build previous period range ─────────────────────────────────────
// If the current period is in progress (current month), use the same day-count
// from the previous month. If the current period is complete, use full prev month.

export function buildPreviousPeriod(
  year: number,
  month: number, // 0-based
  today: string, // 'YYYY-MM-DD'
): PreviousPeriodRange {
  const currentMonthDate = new Date(year, month, 1);
  const currentMonthStr = [
    currentMonthDate.getFullYear(),
    String(currentMonthDate.getMonth() + 1).padStart(2, '0'),
  ].join('-');
  const todayMonthStr = today.slice(0, 7);
  const isCurrentMonth = currentMonthStr === todayMonthStr;

  // Previous month: year/month-1 (JS Date handles wrapping)
  const prevMonthStart = new Date(year, month - 1, 1);
  const prevMonthEnd = new Date(year, month, 1);
  const prevMonthLabel = formatMonthLabel(
    [
      prevMonthStart.getFullYear(),
      String(prevMonthStart.getMonth() + 1).padStart(2, '0'),
    ].join('-'),
  );

  if (isCurrentMonth) {
    // Find max day available in previous month
    const daysInPrevMonth = new Date(year, month, 0).getDate(); // last day of prev month
    const todayDay = parseInt(today.slice(8, 10), 10);
    const comparableDay = Math.min(todayDay, daysInPrevMonth);

    // Previous period: from 1st to comparable day (inclusive), so endDate = day+1
    const prevEndDay = Math.min(comparableDay + 1, daysInPrevMonth + 1);
    const prevEndDate =
      prevEndDay > daysInPrevMonth
        ? formatDateObj(prevMonthEnd)
        : formatDateObj(
            new Date(
              prevMonthStart.getFullYear(),
              prevMonthStart.getMonth(),
              prevEndDay,
            ),
          );

    const label = `${comparableDay} hari pertama ${prevMonthLabel}`;
    return {
      startDate: formatDateObj(prevMonthStart),
      endDate: prevEndDate,
      month: [
        prevMonthStart.getFullYear(),
        String(prevMonthStart.getMonth() + 1).padStart(2, '0'),
      ].join('-'),
      label,
    };
  } else {
    // Full previous month
    return {
      startDate: formatDateObj(prevMonthStart),
      endDate: formatDateObj(prevMonthEnd),
      month: [
        prevMonthStart.getFullYear(),
        String(prevMonthStart.getMonth() + 1).padStart(2, '0'),
      ].join('-'),
      label: prevMonthLabel,
    };
  }
}

// ─── Helper: format money ─────────────────────────────────────────────────────

export function formatMoney(value: number): string {
  if (value < 0) {
    return `\u2212Rp\u00a0${Math.abs(value).toLocaleString('id-ID')}`;
  }
  return `Rp\u00a0${value.toLocaleString('id-ID')}`;
}

// ─── Helper: format month label ───────────────────────────────────────────────

export function formatMonthLabel(yyyymm: string, short = false): string {
  const [year, month] = yyyymm.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('id-ID', {
    month: short ? 'short' : 'long',
    ...(short ? {} : { year: 'numeric' as const }),
  });
}

// ─── Helper: day count between two dates (exclusive end) ─────────────────────

export function dayCount(startDate: string, endDateExclusive: string): number {
  const start = new Date(startDate).getTime();
  const end = new Date(endDateExclusive).getTime();
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

// ─── RINGKASAN TAB ────────────────────────────────────────────────────────────

export async function fetchSummary(
  db: SQLiteDatabase,
  range: PeriodRange,
  accountId: number | null,
): Promise<SummaryData> {
  const { startDate, endDate } = range;

  const totals = await db.getFirstAsync<{ income: number; expense: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
     FROM transactions
     WHERE date >= ? AND date < ?
       AND (? IS NULL OR account_id = ?)`,
    startDate,
    endDate,
    accountId,
    accountId,
  );

  const income = totals?.income ?? 0;
  const expense = totals?.expense ?? 0;
  const difference = income - expense;
  const days = dayCount(startDate, endDate);
  const avgDailyExpense = days > 0 ? Math.round(expense / days) : 0;

  let transferIn = 0;
  let transferOut = 0;

  if (accountId !== null) {
    const transferTotals = await db.getFirstAsync<{
      incoming: number;
      outgoing: number;
    }>(
      `SELECT
         COALESCE(SUM(CASE WHEN to_account_id = ? THEN amount ELSE 0 END), 0) AS incoming,
         COALESCE(SUM(CASE WHEN from_account_id = ? THEN amount ELSE 0 END), 0) AS outgoing
       FROM transfers
       WHERE date >= ? AND date < ?
         AND (from_account_id = ? OR to_account_id = ?)`,
      accountId,
      accountId,
      startDate,
      endDate,
      accountId,
      accountId,
    );
    transferIn = transferTotals?.incoming ?? 0;
    transferOut = transferTotals?.outgoing ?? 0;
  }

  return {
    income,
    expense,
    difference,
    avgDailyExpense,
    transferIn,
    transferOut,
    calendarDays: days,
  };
}

export async function fetchPreviousSummary(
  db: SQLiteDatabase,
  prevRange: PreviousPeriodRange,
  accountId: number | null,
): Promise<PreviousSummaryData> {
  const { startDate, endDate, label } = prevRange;

  const totals = await db.getFirstAsync<{ income: number; expense: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
     FROM transactions
     WHERE date >= ? AND date < ?
       AND (? IS NULL OR account_id = ?)`,
    startDate,
    endDate,
    accountId,
    accountId,
  );

  return {
    income: totals?.income ?? 0,
    expense: totals?.expense ?? 0,
    label,
  };
}

export async function fetchTrendMonths(
  db: SQLiteDatabase,
  endMonth: string,  // 'YYYY-MM', inclusive
  accountId: number | null,
): Promise<TrendMonth[]> {
  const [endYear, endMonthNum] = endMonth.split('-').map(Number);
  // Start from 5 months before endMonth
  const startMonthDate = new Date(endYear, endMonthNum - 1 - 5, 1);
  const startDateStr = formatDateObj(startMonthDate);
  const endDateObj = new Date(endYear, endMonthNum, 1); // first of next month
  const endDateStr = formatDateObj(endDateObj);

  const rows = await db.getAllAsync<{ month: string; income: number; expense: number }>(
    `SELECT
       substr(date, 1, 7) AS month,
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
     FROM transactions
     WHERE date >= ? AND date < ?
       AND (? IS NULL OR account_id = ?)
     GROUP BY substr(date, 1, 7)
     ORDER BY month`,
    startDateStr,
    endDateStr,
    accountId,
    accountId,
  );

  // Build 6-month array, filling 0 for months without data
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(endYear, endMonthNum - 1 - 5 + i, 1);
    const key = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0')].join('-');
    const existing = rows.find((r) => r.month === key);
    return { month: key, income: existing?.income ?? 0, expense: existing?.expense ?? 0 };
  });
}

// ─── PENGELUARAN TAB ──────────────────────────────────────────────────────────

export async function fetchExpenseCategories(
  db: SQLiteDatabase,
  range: PeriodRange,
  accountId: number | null,
): Promise<ExpenseCategory[]> {
  const { startDate, endDate } = range;

  const rows = await db.getAllAsync<{ id: number; name: string; total: number }>(
    `SELECT
       c.id,
       c.name,
       SUM(t.amount) AS total
     FROM transactions AS t
     JOIN categories AS c ON c.id = t.category_id
     WHERE t.type = 'expense'
       AND t.date >= ? AND t.date < ?
       AND (? IS NULL OR t.account_id = ?)
     GROUP BY c.id, c.name
     ORDER BY total DESC, c.name ASC`,
    startDate,
    endDate,
    accountId,
    accountId,
  );

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  return rows.map((r) => ({
    ...r,
    pct: grandTotal > 0 ? Math.round((r.total / grandTotal) * 1000) / 10 : 0,
  }));
}

export async function fetchPrevExpenseCategories(
  db: SQLiteDatabase,
  prevRange: PreviousPeriodRange,
  accountId: number | null,
): Promise<PrevExpenseCategory[]> {
  const { startDate, endDate } = prevRange;

  return db.getAllAsync<PrevExpenseCategory>(
    `SELECT
       c.id,
       c.name,
       SUM(t.amount) AS total
     FROM transactions AS t
     JOIN categories AS c ON c.id = t.category_id
     WHERE t.type = 'expense'
       AND t.date >= ? AND t.date < ?
       AND (? IS NULL OR t.account_id = ?)
     GROUP BY c.id, c.name
     ORDER BY total DESC`,
    startDate,
    endDate,
    accountId,
    accountId,
  );
}

export async function fetchDailyExpense(
  db: SQLiteDatabase,
  range: PeriodRange,
  accountId: number | null,
): Promise<DailyExpense[]> {
  const { startDate, endDate } = range;

  return db.getAllAsync<DailyExpense>(
    `SELECT
       date,
       SUM(amount) AS amount
     FROM transactions
     WHERE type = 'expense'
       AND date >= ? AND date < ?
       AND (? IS NULL OR account_id = ?)
     GROUP BY date
     ORDER BY date`,
    startDate,
    endDate,
    accountId,
    accountId,
  );
}

export async function fetchWeekdayVsWeekend(
  db: SQLiteDatabase,
  range: PeriodRange,
  accountId: number | null,
): Promise<WeekdayWeekendData> {
  const { startDate, endDate } = range;

  // Get daily totals from DB
  const rows = await db.getAllAsync<{ date: string; amount: number }>(
    `SELECT
       date,
       SUM(amount) AS amount
     FROM transactions
     WHERE type = 'expense'
       AND date >= ? AND date < ?
       AND (? IS NULL OR account_id = ?)
     GROUP BY date`,
    startDate,
    endDate,
    accountId,
    accountId,
  );

  const dailyMap: Record<string, number> = {};
  for (const r of rows) {
    dailyMap[r.date] = r.amount;
  }

  let weekdayTotal = 0;
  let weekdayDays = 0;
  let weekendTotal = 0;
  let weekendDays = 0;

  // Iterate calendar days from startDate to endDate-1
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  for (let ms = startMs; ms < endMs; ms += dayMs) {
    const d = new Date(ms);
    const dow = d.getDay(); // 0 = Sunday, 6 = Saturday
    const dateStr = formatDateObj(d);
    const amount = dailyMap[dateStr] ?? 0;

    if (dow === 0 || dow === 6) {
      weekendTotal += amount;
      weekendDays++;
    } else {
      weekdayTotal += amount;
      weekdayDays++;
    }
  }

  const weekdayAvg = weekdayDays > 0 ? Math.round(weekdayTotal / weekdayDays) : 0;
  const weekendAvg = weekendDays > 0 ? Math.round(weekendTotal / weekendDays) : 0;

  return { weekdayTotal, weekdayDays, weekdayAvg, weekendTotal, weekendDays, weekendAvg };
}

// ─── ANGGARAN TAB ─────────────────────────────────────────────────────────────

export async function fetchBudgetAnalysis(
  db: SQLiteDatabase,
  month: string, // 'YYYY-MM'
): Promise<BudgetAnalysis> {
  const startDate = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const endDate = formatDateObj(new Date(y, m, 1));

  // Get all budgets for this month with category name and total spent
  const budgetRows = await db.getAllAsync<{
    id: number;
    category_id: number;
    name: string;
    budgeted: number;
    spent: number;
  }>(
    `SELECT
       b.id,
       b.category_id,
       c.name,
       b.amount AS budgeted,
       COALESCE(
         (SELECT SUM(t.amount)
          FROM transactions t
          WHERE t.category_id = b.category_id
            AND t.type = 'expense'
            AND t.date >= ? AND t.date < ?),
         0
       ) AS spent
     FROM budgets b
     JOIN categories c ON c.id = b.category_id
     WHERE b.month = ?
     ORDER BY b.amount DESC`,
    startDate,
    endDate,
    month,
  );

  // Get IDs of categories that have a budget
  const budgetedCategoryIds = budgetRows.map((r) => r.category_id);

  // Total unbudgeted expense
  let totalUnbudgetedExpense = 0;
  if (budgetedCategoryIds.length > 0) {
    const placeholders = budgetedCategoryIds.map(() => '?').join(', ');
    const unbudgeted = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE type = 'expense'
         AND date >= ? AND date < ?
         AND category_id NOT IN (${placeholders})`,
      startDate,
      endDate,
      ...budgetedCategoryIds,
    );
    totalUnbudgetedExpense = unbudgeted?.total ?? 0;
  } else {
    // No budgets at all — all expense is unbudgeted
    const all = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE type = 'expense' AND date >= ? AND date < ?`,
      startDate,
      endDate,
    );
    totalUnbudgetedExpense = all?.total ?? 0;
  }

  const items = budgetRows.map((r) => {
    const remaining = r.budgeted - r.spent;
    const pct = r.budgeted > 0 ? Math.round((r.spent / r.budgeted) * 1000) / 10 : 0;
    return {
      id: r.id,
      categoryId: r.category_id,
      name: r.name,
      budgeted: r.budgeted,
      spent: r.spent,
      remaining,
      pct,
      overBudget: r.spent > r.budgeted,
    };
  });

  const totalBudgeted = items.reduce((s, it) => s + it.budgeted, 0);
  const totalSpent = items.reduce((s, it) => s + it.spent, 0);
  const overBudgetCount = items.filter((it) => it.overBudget).length;

  return { items, totalBudgeted, totalSpent, totalUnbudgetedExpense, overBudgetCount };
}

// ─── TABUNGAN TAB ─────────────────────────────────────────────────────────────

export async function fetchSavingsAccounts(
  db: SQLiteDatabase,
): Promise<SavingsAccount[]> {
  return db.getAllAsync<SavingsAccount>(
    `SELECT id, name FROM accounts WHERE role = 'savings' ORDER BY id`,
  );
}

export async function fetchSavingsData(
  db: SQLiteDatabase,
  range: PeriodRange,
  savingsAccountIds: number[],
): Promise<SavingsData> {
  const { endDate } = range;

  // If no specific accounts, fetch all savings accounts
  let accountIds = savingsAccountIds;
  if (accountIds.length === 0) {
    const allSavings = await fetchSavingsAccounts(db);
    accountIds = allSavings.map((a) => a.id);
  }

  if (accountIds.length === 0) {
    return { endBalance: 0, transferInFromExternal: 0, transferOutToExternal: 0, netDeposit: 0 };
  }

  const placeholders = accountIds.map(() => '?').join(', ');

  // End balance = initial_balance + all income - all expense + all transfer in - all transfer out
  // All transactions up to endDate (exclusive)
  const balanceRow = await db.getFirstAsync<{ balance: number }>(
    `SELECT
       COALESCE(SUM(a.initial_balance), 0)
       + COALESCE(
           (SELECT SUM(t.amount) FROM transactions t
            WHERE t.account_id IN (${placeholders})
              AND t.type = 'income'
              AND t.date < ?),
           0
         )
       - COALESCE(
           (SELECT SUM(t.amount) FROM transactions t
            WHERE t.account_id IN (${placeholders})
              AND t.type = 'expense'
              AND t.date < ?),
           0
         )
       + COALESCE(
           (SELECT SUM(tr.amount) FROM transfers tr
            WHERE tr.to_account_id IN (${placeholders})
              AND tr.date < ?),
           0
         )
       - COALESCE(
           (SELECT SUM(tr.amount) FROM transfers tr
            WHERE tr.from_account_id IN (${placeholders})
              AND tr.date < ?),
           0
         )
       AS balance
     FROM accounts a
     WHERE a.id IN (${placeholders})`,
    ...accountIds,       // for initial_balance
    ...accountIds, endDate,  // income
    ...accountIds, endDate,  // expense
    ...accountIds, endDate,  // transfer in
    ...accountIds, endDate,  // transfer out
    ...accountIds,           // WHERE clause
  );

  const endBalance = balanceRow?.balance ?? 0;

  // Transfer in from external (non-savings → savings group) during range
  const { startDate } = range;
  const transferInRow = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM transfers
     WHERE to_account_id IN (${placeholders})
       AND from_account_id NOT IN (${placeholders})
       AND date >= ? AND date < ?`,
    ...accountIds,
    ...accountIds,
    startDate,
    endDate,
  );
  const transferInFromExternal = transferInRow?.total ?? 0;

  // Transfer out to external (savings → non-savings) during range
  const transferOutRow = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM transfers
     WHERE from_account_id IN (${placeholders})
       AND to_account_id NOT IN (${placeholders})
       AND date >= ? AND date < ?`,
    ...accountIds,
    ...accountIds,
    startDate,
    endDate,
  );
  const transferOutToExternal = transferOutRow?.total ?? 0;

  const netDeposit = transferInFromExternal - transferOutToExternal;

  return { endBalance, transferInFromExternal, transferOutToExternal, netDeposit };
}

export async function fetchSavingsTrend(
  db: SQLiteDatabase,
  endMonth: string,
  savingsAccountIds: number[],
): Promise<SavingsTrendPoint[]> {
  const [endYear, endMonthNum] = endMonth.split('-').map(Number);

  return Promise.all(
    Array.from({ length: 6 }, async (_, i) => {
      const d = new Date(endYear, endMonthNum - 1 - 5 + i, 1);
      const nextD = new Date(endYear, endMonthNum - 1 - 5 + i + 1, 1);
      const monthStr = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0')].join('-');
      const rangeForMonth: PeriodRange = {
        startDate: formatDateObj(d),
        endDate: formatDateObj(nextD),
        month: monthStr,
      };
      const data = await fetchSavingsData(db, rangeForMonth, savingsAccountIds);
      return { month: monthStr, balance: data.endBalance };
    }),
  );
}
