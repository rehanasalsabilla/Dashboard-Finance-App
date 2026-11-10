// Shared TypeScript types for the analytics module

export type PeriodRange = {
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;   // 'YYYY-MM-DD' first day of next month (exclusive upper bound)
  month: string;     // 'YYYY-MM'
};

export type PreviousPeriodRange = PeriodRange & {
  label: string; // Human-readable label for the previous period
};

export type SummaryData = {
  income: number;
  expense: number;
  difference: number;
  avgDailyExpense: number;
  transferIn: number;
  transferOut: number;
  calendarDays: number;
};

export type PreviousSummaryData = {
  income: number;
  expense: number;
  label: string;
};

export type TrendMonth = {
  month: string;
  income: number;
  expense: number;
};

export type ExpenseCategory = {
  id: number;
  name: string;
  total: number;
  pct: number;
};

export type PrevExpenseCategory = {
  id: number;
  name: string;
  total: number;
};

export type DailyExpense = {
  date: string;
  amount: number;
};

export type WeekdayWeekendData = {
  weekdayTotal: number;
  weekdayDays: number;
  weekdayAvg: number;
  weekendTotal: number;
  weekendDays: number;
  weekendAvg: number;
};

export type BudgetItem = {
  id: number;
  categoryId: number;
  name: string;
  budgeted: number;
  spent: number;
  remaining: number;
  pct: number;
  overBudget: boolean;
};

export type BudgetAnalysis = {
  items: BudgetItem[];
  totalBudgeted: number;
  totalSpent: number;
  totalUnbudgetedExpense: number;
  overBudgetCount: number;
};

export type SavingsAccount = {
  id: number;
  name: string;
};

export type SavingsData = {
  endBalance: number;
  transferInFromExternal: number;
  transferOutToExternal: number;
  netDeposit: number;
};

export type SavingsTrendPoint = {
  month: string;
  balance: number;
};

export type AnalyticsTab = 'ringkasan' | 'pengeluaran' | 'anggaran' | 'tabungan';
