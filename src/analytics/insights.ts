// Deterministic rule-based insight generation for the analytics module

export type Insight = {
  key: string;
  text: string;
  kind: 'neutral' | 'positive' | 'warning' | 'info';
};

function pct(value: number, base: number): number {
  if (base === 0) return 0;
  return Math.round((value / base) * 100);
}

function formatMoney(value: number): string {
  return `Rp\u00a0${Math.abs(value).toLocaleString('id-ID')}`;
}

// ─── Summary Insights ─────────────────────────────────────────────────────────

export function buildSummaryInsights(params: {
  income: number;
  expense: number;
  difference: number;
  prevIncome: number;
  prevExpense: number;
  prevLabel: string;
  topCategory: { name: string; total: number; pct: number } | null;
  avgDailyExpense: number;
  calendarDays: number;
}): Insight[] {
  const { income, expense, difference, prevIncome, prevExpense, prevLabel, topCategory, avgDailyExpense } = params;

  // No data at all
  if (income === 0 && expense === 0) return [];

  const insights: Insight[] = [];

  // 1. Difference: surplus or deficit
  if (income > 0 || expense > 0) {
    if (difference > 0) {
      insights.push({
        key: 'surplus',
        text: `Surplus ${formatMoney(difference)} bulan ini. Pemasukan lebih besar dari pengeluaran.`,
        kind: 'positive',
      });
    } else if (difference < 0) {
      insights.push({
        key: 'deficit',
        text: `Defisit ${formatMoney(Math.abs(difference))} bulan ini. Pengeluaran melebihi pemasukan.`,
        kind: 'warning',
      });
    } else {
      insights.push({
        key: 'balanced',
        text: 'Pemasukan dan pengeluaran seimbang bulan ini.',
        kind: 'neutral',
      });
    }
  }

  // 2. Income change vs previous period
  if (prevIncome > 0 && income > 0) {
    const incomeDiff = income - prevIncome;
    const incomeChangePct = pct(Math.abs(incomeDiff), prevIncome);
    if (incomeChangePct >= 10) {
      if (incomeDiff > 0) {
        insights.push({
          key: 'income_up',
          text: `Pemasukan naik ${incomeChangePct}% dibanding ${prevLabel}.`,
          kind: 'positive',
        });
      } else {
        insights.push({
          key: 'income_down',
          text: `Pemasukan turun ${incomeChangePct}% dibanding ${prevLabel}.`,
          kind: 'warning',
        });
      }
    }
  }

  // 3. Expense change vs previous period
  if (insights.length < 4 && prevExpense > 0 && expense > 0) {
    const expDiff = expense - prevExpense;
    const expChangePct = pct(Math.abs(expDiff), prevExpense);
    if (expChangePct >= 10) {
      if (expDiff > 0) {
        insights.push({
          key: 'expense_up',
          text: `Pengeluaran naik ${expChangePct}% dibanding ${prevLabel}.`,
          kind: 'warning',
        });
      } else {
        insights.push({
          key: 'expense_down',
          text: `Pengeluaran turun ${expChangePct}% dibanding ${prevLabel}. Bagus!`,
          kind: 'positive',
        });
      }
    }
  }

  // 4. Top category
  if (insights.length < 4 && topCategory !== null && topCategory.total > 0 && topCategory.pct >= 10) {
    insights.push({
      key: 'top_category',
      text: `Kategori terbesar: ${topCategory.name} (${topCategory.pct.toLocaleString('id-ID', { maximumFractionDigits: 1 })}% dari pengeluaran).`,
      kind: 'info',
    });
  }

  return insights.slice(0, 4);
}

// ─── Expense Insights ─────────────────────────────────────────────────────────

export function buildExpenseInsights(params: {
  categories: Array<{ name: string; total: number; pct: number }>;
  prevCategories: Array<{ id: number; name: string; total: number }>;
  weekdayAvg: number;
  weekendAvg: number;
  weekdayDays: number;
  weekendDays: number;
}): Insight[] {
  const { categories, prevCategories, weekdayAvg, weekendAvg, weekdayDays, weekendDays } = params;
  const insights: Insight[] = [];

  // 1. Weekend vs weekday comparison
  if (weekdayDays >= 3 && weekendDays >= 2) {
    if (weekendAvg > weekdayAvg && weekdayAvg > 0) {
      const diff = weekendAvg - weekdayAvg;
      const pctDiff = pct(diff, weekdayAvg);
      insights.push({
        key: 'weekend_higher',
        text: `Rata-rata pengeluaran akhir pekan ${pctDiff}% lebih tinggi dari hari kerja (${formatMoney(weekendAvg)} vs ${formatMoney(weekdayAvg)}/hari).`,
        kind: 'info',
      });
    } else if (weekdayAvg > weekendAvg && weekendAvg > 0) {
      const diff = weekdayAvg - weekendAvg;
      const pctDiff = pct(diff, weekendAvg);
      insights.push({
        key: 'weekday_higher',
        text: `Rata-rata pengeluaran hari kerja ${pctDiff}% lebih tinggi dari akhir pekan (${formatMoney(weekdayAvg)} vs ${formatMoney(weekendAvg)}/hari).`,
        kind: 'info',
      });
    }
  }

  // 2. Category changes vs previous period
  const prevMap = new Map(prevCategories.map((c) => [c.id, c]));

  // We need category id for comparison — but categories here don't have id
  // The parent passes categories from fetchExpenseCategories which has id
  // We receive them without id here. Let's use name matching as fallback.
  const prevByName = new Map(prevCategories.map((c) => [c.name, c.total]));

  for (const cat of categories) {
    if (insights.length >= 4) break;
    const prevTotal = prevByName.get(cat.name) ?? 0;
    if (prevTotal === 0) continue;
    const diff = cat.total - prevTotal;
    const changePct = pct(Math.abs(diff), prevTotal);
    if (changePct > 15 || Math.abs(diff) > 50_000) {
      if (diff > 0) {
        insights.push({
          key: `cat_up_${cat.name}`,
          text: `Pengeluaran ${cat.name} naik ${changePct}% dibanding periode sebelumnya.`,
          kind: 'warning',
        });
      } else {
        insights.push({
          key: `cat_down_${cat.name}`,
          text: `Pengeluaran ${cat.name} turun ${changePct}% dibanding periode sebelumnya.`,
          kind: 'positive',
        });
      }
    }
  }

  // Suppress unused import warning
  void prevMap;

  return insights.slice(0, 4);
}

// ─── Budget Insights ──────────────────────────────────────────────────────────

export function buildBudgetInsights(params: {
  overBudgetCount: number;
  items: Array<{ name: string; pct: number; overBudget: boolean }>;
  totalBudgeted: number;
  totalSpent: number;
  totalUnbudgetedExpense: number;
}): Insight[] {
  const { overBudgetCount, items, totalBudgeted, totalSpent, totalUnbudgetedExpense } = params;
  const insights: Insight[] = [];

  // 1. Over-budget categories
  if (overBudgetCount > 0) {
    const overNames = items.filter((it) => it.overBudget).map((it) => it.name);
    const names = overNames.slice(0, 2).join(', ');
    const more = overNames.length > 2 ? ` dan ${overNames.length - 2} lainnya` : '';
    insights.push({
      key: 'over_budget',
      text: `${overBudgetCount} kategori melebihi anggaran: ${names}${more}.`,
      kind: 'warning',
    });
  } else if (items.length > 0) {
    insights.push({
      key: 'on_budget',
      text: 'Semua kategori masih dalam batas anggaran. Bagus!',
      kind: 'positive',
    });
  }

  // 2. Overall budget utilization
  if (insights.length < 4 && totalBudgeted > 0) {
    const utilPct = pct(totalSpent, totalBudgeted);
    if (utilPct >= 90) {
      insights.push({
        key: 'budget_high',
        text: `Anggaran keseluruhan terpakai ${utilPct}% — hampir habis.`,
        kind: 'warning',
      });
    } else if (utilPct >= 50) {
      insights.push({
        key: 'budget_mid',
        text: `Anggaran keseluruhan terpakai ${utilPct}%.`,
        kind: 'neutral',
      });
    } else if (utilPct > 0) {
      insights.push({
        key: 'budget_low',
        text: `Anggaran keseluruhan baru terpakai ${utilPct}%.`,
        kind: 'info',
      });
    }
  }

  // 3. Unbudgeted expense
  if (insights.length < 4 && totalUnbudgetedExpense > 0) {
    insights.push({
      key: 'unbudgeted',
      text: `Ada ${formatMoney(totalUnbudgetedExpense)} pengeluaran dari kategori tanpa anggaran.`,
      kind: 'info',
    });
  }

  return insights.slice(0, 4);
}

// ─── Savings Insights ─────────────────────────────────────────────────────────

export function buildSavingsInsights(params: {
  netDeposit: number;
  endBalance: number;
  prevNetDeposit?: number;
  prevLabel: string;
}): Insight[] {
  const { netDeposit, endBalance, prevNetDeposit, prevLabel } = params;
  const insights: Insight[] = [];

  // 1. Net deposit this period
  if (netDeposit > 0) {
    insights.push({
      key: 'net_deposit_pos',
      text: `Setoran bersih bulan ini: ${formatMoney(netDeposit)}. Tabunganmu bertambah!`,
      kind: 'positive',
    });
  } else if (netDeposit < 0) {
    insights.push({
      key: 'net_deposit_neg',
      text: `Penarikan bersih bulan ini: ${formatMoney(Math.abs(netDeposit))}. Saldo tabungan berkurang.`,
      kind: 'warning',
    });
  } else if (endBalance > 0) {
    insights.push({
      key: 'net_deposit_zero',
      text: 'Tidak ada perubahan setoran ke tabungan bulan ini.',
      kind: 'neutral',
    });
  }

  // 2. Change vs previous period
  if (insights.length < 3 && prevNetDeposit !== undefined && prevNetDeposit !== 0) {
    const diff = netDeposit - prevNetDeposit;
    const changePct = pct(Math.abs(diff), Math.abs(prevNetDeposit));
    if (changePct >= 10) {
      if (diff > 0) {
        insights.push({
          key: 'savings_up',
          text: `Setoran bersih naik ${changePct}% dibanding ${prevLabel}.`,
          kind: 'positive',
        });
      } else {
        insights.push({
          key: 'savings_down',
          text: `Setoran bersih turun ${changePct}% dibanding ${prevLabel}.`,
          kind: 'warning',
        });
      }
    }
  }

  // 3. Balance info
  if (insights.length < 3 && endBalance > 0) {
    insights.push({
      key: 'balance_info',
      text: `Saldo tabungan akhir periode: ${formatMoney(endBalance)}.`,
      kind: 'info',
    });
  }

  return insights.slice(0, 3);
}
