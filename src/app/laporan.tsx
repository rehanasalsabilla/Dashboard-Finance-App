import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  buildBudgetInsights,
  buildExpenseInsights,
  buildSavingsInsights,
  buildSummaryInsights,
  type Insight,
} from '@/analytics/insights';
import {
  buildPeriodRange,
  buildPreviousPeriod,
  currentMonthStr,
  dayCount,
  fetchBudgetAnalysis,
  fetchDailyExpense,
  fetchExpenseCategories,
  fetchPrevExpenseCategories,
  fetchPreviousSummary,
  fetchSavingsAccounts,
  fetchSavingsData,
  fetchSavingsTrend,
  fetchSummary,
  fetchTrendMonths,
  fetchWeekdayVsWeekend,
  formatMoney,
  formatMonthLabel,
} from '@/analytics/queries';
import type {
  AnalyticsTab,
  BudgetAnalysis,
  DailyExpense,
  ExpenseCategory,
  PrevExpenseCategory,
  PreviousSummaryData,
  SavingsAccount,
  SavingsData,
  SavingsTrendPoint,
  SummaryData,
  TrendMonth,
  WeekdayWeekendData,
} from '@/analytics/types';

// ─── Category colors ──────────────────────────────────────────────────────────

const CAT_COLORS = [
  '#0B7055',
  '#6554E8',
  '#DD4284',
  '#D98200',
  '#64748B',
  '#178EA0',
  '#B45309',
  '#7C3AED',
];

// ─── Helper: format date as YYYY-MM-DD ───────────────────────────────────────

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function InsightList({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <View style={styles.insightList}>
      <Text style={styles.sectionLabel}>Insight</Text>
      {insights.map((ins) => (
        <View
          key={ins.key}
          style={[
            styles.insightItem,
            ins.kind === 'positive' && styles.insightPositive,
            ins.kind === 'warning' && styles.insightWarning,
            ins.kind === 'info' && styles.insightInfo,
          ]}
        >
          <Text style={styles.insightIcon}>
            {ins.kind === 'positive' ? '✓' : ins.kind === 'warning' ? '!' : 'i'}
          </Text>
          <Text style={styles.insightText}>{ins.text}</Text>
        </View>
      ))}
    </View>
  );
}

function ProgressBar({
  pct,
  color,
  overBudget,
}: {
  pct: number;
  color: string;
  overBudget?: boolean;
}) {
  const clampedPct = Math.min(pct, 100);
  return (
    <View style={styles.track}>
      <View
        style={[
          styles.progressFill,
          {
            width: `${clampedPct}%`,
            backgroundColor: overBudget ? '#D94B20' : color,
          },
        ]}
      />
    </View>
  );
}

function KpiRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.kpiRow}>{children}</View>;
}

function KpiCell({
  label,
  value,
  valueColor,
  onPress,
}: {
  label: string;
  value: string;
  valueColor?: string;
  onPress?: () => void;
}) {
  const inner = (
    <View style={styles.kpiCell}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
      {onPress ? <Text style={styles.smallLink}>Lihat →</Text> : null}
    </View>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.kpiCellWrap, pressed && styles.pressed]}
      >
        {inner}
      </Pressable>
    );
  }
  return <View style={styles.kpiCellWrap}>{inner}</View>;
}

// ─── Bar chart (manual) ───────────────────────────────────────────────────────

function BarChart({
  data,
  maxHeight,
  onBarPress,
}: {
  data: Array<{ key: string; label: string; a: number; b: number; colorA: string; colorB: string }>;
  maxHeight: number;
  onBarPress?: (key: string) => void;
}) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.a, d.b)));
  return (
    <View style={styles.chartContainer}>
      {data.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => onBarPress?.(item.key)}
          style={styles.chartColumn}
          accessibilityRole="button"
          accessibilityLabel={item.label}
        >
          <View style={[styles.barArea, { height: maxHeight }]}>
            <View
              style={[
                styles.bar,
                { height: (item.a / max) * maxHeight, backgroundColor: item.colorA },
              ]}
            />
            <View
              style={[
                styles.bar,
                { height: (item.b / max) * maxHeight, backgroundColor: item.colorB },
              ]}
            />
          </View>
          <Text style={styles.chartLabel}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Period Picker ────────────────────────────────────────────────────────────

function PeriodPicker({
  year,
  month,
  onChange,
  onReset,
}: {
  year: number;
  month: number;
  onChange: (direction: number) => void;
  onReset: () => void;
}) {
  const monthStr = [year, String(month + 1).padStart(2, '0')].join('-');
  const isCurrentMonth = monthStr === currentMonthStr();
  return (
    <View style={styles.periodRow}>
      <Pressable
        onPress={() => onChange(-1)}
        accessibilityRole="button"
        accessibilityLabel="Bulan sebelumnya"
        style={styles.periodButton}
      >
        <Text style={styles.arrow}>‹</Text>
      </Pressable>

      <Text style={styles.periodText}>{formatMonthLabel(monthStr)}</Text>

      <Pressable
        onPress={() => onChange(1)}
        accessibilityRole="button"
        accessibilityLabel="Bulan berikutnya"
        style={styles.periodButton}
      >
        <Text style={styles.arrow}>›</Text>
      </Pressable>

      {!isCurrentMonth ? (
        <Pressable
          onPress={onReset}
          accessibilityRole="button"
          style={styles.todayButton}
        >
          <Text style={styles.todayButtonText}>Bulan ini</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Account filter chips ─────────────────────────────────────────────────────

type AccountChip = { id: number; name: string };

function AccountFilter({
  accounts,
  selectedId,
  onSelect,
}: {
  accounts: AccountChip[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      <Pressable
        onPress={() => onSelect(null)}
        accessibilityRole="button"
        accessibilityState={{ selected: selectedId === null }}
        style={[styles.chip, selectedId === null && styles.chipActive]}
      >
        <Text style={[styles.chipText, selectedId === null && styles.chipTextActive]}>
          Semua akun
        </Text>
      </Pressable>
      {accounts.map((acc) => (
        <Pressable
          key={acc.id}
          onPress={() => onSelect(acc.id)}
          accessibilityRole="button"
          accessibilityState={{ selected: selectedId === acc.id }}
          style={[styles.chip, selectedId === acc.id && styles.chipActive]}
        >
          <Text style={[styles.chipText, selectedId === acc.id && styles.chipTextActive]}>
            {acc.name}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// ─── Segmented control ────────────────────────────────────────────────────────

const TABS: Array<{ key: AnalyticsTab; label: string }> = [
  { key: 'ringkasan', label: 'Ringkasan' },
  { key: 'pengeluaran', label: 'Pengeluaran' },
  { key: 'anggaran', label: 'Anggaran' },
  { key: 'tabungan', label: 'Tabungan' },
];

function SegmentedControl({
  active,
  onChange,
}: {
  active: AnalyticsTab;
  onChange: (tab: AnalyticsTab) => void;
}) {
  return (
    <View style={styles.segmentedWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.segmented}
      >
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active === tab.key }}
            style={[styles.segmentItem, active === tab.key && styles.segmentItemActive]}
          >
            <Text
              style={[
                styles.segmentText,
                active === tab.key && styles.segmentTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Loading / Error states ───────────────────────────────────────────────────

function LoadingState({ label }: { label?: string }) {
  return (
    <View style={styles.stateBox}>
      <ActivityIndicator color="#0B7055" />
      <Text style={styles.caption}>{label ?? 'Memuat data...'}</Text>
    </View>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.stateBox}>
      <Text style={styles.errorText}>{message}</Text>
      <Pressable onPress={onRetry}>
        <Text style={styles.linkText}>Coba lagi</Text>
      </Pressable>
    </View>
  );
}

// ─── Tab: Ringkasan ───────────────────────────────────────────────────────────

function TabRingkasan({
  summary,
  prevSummary,
  trendMonths,
  expenseCategories,
  selectedMonth,
  accountId,
  onOpenTransactions,
}: {
  summary: SummaryData;
  prevSummary: PreviousSummaryData;
  trendMonths: TrendMonth[];
  expenseCategories: ExpenseCategory[];
  selectedMonth: string;
  accountId: number | null;
  onOpenTransactions: (month: string, kind?: 'all' | 'income' | 'expense' | 'transfer', categoryId?: number) => void;
}) {
  const topCategory = expenseCategories.length > 0 ? expenseCategories[0] : null;

  const insights = buildSummaryInsights({
    income: summary.income,
    expense: summary.expense,
    difference: summary.difference,
    prevIncome: prevSummary.income,
    prevExpense: prevSummary.expense,
    prevLabel: prevSummary.label,
    topCategory,
    avgDailyExpense: summary.avgDailyExpense,
    calendarDays: summary.calendarDays,
  });

  const trendMax = Math.max(1, ...trendMonths.map((m) => Math.max(m.income, m.expense)));

  return (
    <View style={styles.tabContent}>
      {/* Main summary card */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>
          Selisih pemasukan – pengeluaran
        </Text>
        <Text style={styles.summaryValue}>
          {summary.difference > 0 ? '+' : ''}
          {formatMoney(summary.difference)}
        </Text>

        <KpiRow>
          <KpiCell
            label="Pemasukan →"
            value={formatMoney(summary.income)}
            valueColor="#D8F0E9"
            onPress={() => onOpenTransactions(selectedMonth, 'income')}
          />
          <KpiCell
            label="Pengeluaran →"
            value={formatMoney(summary.expense)}
            valueColor="#FFE0D6"
            onPress={() => onOpenTransactions(selectedMonth, 'expense')}
          />
        </KpiRow>

        <Text style={styles.summaryCaption}>
          Selisih transaksi, bukan saldo. Saldo awal dan transfer tidak termasuk.
        </Text>
      </View>

      {/* Daily average */}
      <View style={styles.card}>
        <KpiRow>
          <KpiCell
            label="Rata-rata pengeluaran/hari"
            value={formatMoney(summary.avgDailyExpense)}
            valueColor="#D94B20"
          />
          <KpiCell
            label="Hari kalender"
            value={String(summary.calendarDays)}
          />
        </KpiRow>
      </View>

      {/* Comparison with previous period */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Dibanding {prevSummary.label}</Text>
        <KpiRow>
          <KpiCell
            label="Pemasukan sebelumnya"
            value={formatMoney(prevSummary.income)}
          />
          <KpiCell
            label="Pengeluaran sebelumnya"
            value={formatMoney(prevSummary.expense)}
          />
        </KpiRow>
      </View>

      {/* Transfer section (account filter active) */}
      {accountId !== null ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Transfer akun terpilih</Text>
          <KpiRow>
            <KpiCell
              label="Transfer masuk"
              value={formatMoney(summary.transferIn)}
              valueColor="#5264B8"
              onPress={() => onOpenTransactions(selectedMonth, 'transfer')}
            />
            <KpiCell
              label="Transfer keluar"
              value={formatMoney(summary.transferOut)}
              valueColor="#5264B8"
            />
          </KpiRow>
          <Text style={styles.caption}>
            Perpindahan antar akun. Biaya admin dihitung di akun asal sebagai pengeluaran.
          </Text>
        </View>
      ) : null}

      {/* 6-month trend */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Tren 6 bulan</Text>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: '#0B7055' }]} />
            <Text style={styles.caption}>Pemasukan</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: '#D94B20' }]} />
            <Text style={styles.caption}>Pengeluaran</Text>
          </View>
        </View>

        {trendMonths.some((m) => m.income > 0 || m.expense > 0) ? (
          <View style={styles.chartContainer}>
            {trendMonths.map((item) => (
              <Pressable
                key={item.month}
                onPress={() => onOpenTransactions(item.month)}
                style={styles.chartColumn}
                accessibilityRole="button"
              >
                <View style={[styles.barArea, { height: 120 }]}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: (item.income / trendMax) * 120,
                        backgroundColor: '#0B7055',
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.bar,
                      {
                        height: (item.expense / trendMax) * 120,
                        backgroundColor: '#D94B20',
                      },
                    ]}
                  />
                </View>
                <Text style={styles.chartLabel}>{formatMonthLabel(item.month, true)}</Text>
                <Text style={styles.yearLabel}>{item.month.slice(0, 4)}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.caption}>Belum ada data untuk ditampilkan.</Text>
        )}
      </View>

      {/* Top 3 expense categories */}
      {expenseCategories.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Kategori pengeluaran terbesar</Text>
          {expenseCategories.slice(0, 3).map((cat, i) => (
            <Pressable
              key={cat.id}
              onPress={() => onOpenTransactions(selectedMonth, 'expense', cat.id)}
              style={({ pressed }) => [styles.catItem, pressed && styles.pressed]}
            >
              <View style={styles.row}>
                <View style={styles.catNameRow}>
                  <View style={[styles.dot, { backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }]} />
                  <Text style={styles.catName}>{cat.name}</Text>
                </View>
                <Text style={styles.percentage}>
                  {cat.pct.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%
                </Text>
              </View>
              <ProgressBar pct={cat.pct} color={CAT_COLORS[i % CAT_COLORS.length]} />
              <Text style={styles.caption}>{formatMoney(cat.total)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <InsightList insights={insights} />

      <Text style={styles.footer}>
        Data mengikuti tanggal catatan. Transfer antar akun tidak dihitung sebagai pemasukan atau pengeluaran.
      </Text>
    </View>
  );
}

// ─── Tab: Pengeluaran ─────────────────────────────────────────────────────────

function TabPengeluaran({
  expenseCategories,
  prevExpenseCategories,
  dailyExpenses,
  weekdayWeekend,
  selectedMonth,
  totalExpense,
  accountId,
  onOpenTransactions,
}: {
  expenseCategories: ExpenseCategory[];
  prevExpenseCategories: PrevExpenseCategory[];
  dailyExpenses: DailyExpense[];
  weekdayWeekend: WeekdayWeekendData;
  selectedMonth: string;
  totalExpense: number;
  accountId: number | null;
  onOpenTransactions: (month: string, kind?: 'all' | 'income' | 'expense' | 'transfer', categoryId?: number, date?: string) => void;
}) {
  const insights = buildExpenseInsights({
    categories: expenseCategories,
    prevCategories: prevExpenseCategories,
    weekdayAvg: weekdayWeekend.weekdayAvg,
    weekendAvg: weekdayWeekend.weekendAvg,
    weekdayDays: weekdayWeekend.weekdayDays,
    weekendDays: weekdayWeekend.weekendDays,
  });

  const dailyMax = Math.max(1, ...dailyExpenses.map((d) => d.amount));

  // Build daily bar data: only days with transactions
  const hasDaily = dailyExpenses.length > 0;

  return (
    <View style={styles.tabContent}>
      {/* Total */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Total pengeluaran</Text>
        <Text style={styles.bigAmount}>{formatMoney(totalExpense)}</Text>
        {totalExpense === 0 ? (
          <Text style={styles.caption}>Belum ada pengeluaran pada periode ini.</Text>
        ) : null}
      </View>

      {/* Categories */}
      {expenseCategories.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Per kategori</Text>
          <Text style={styles.caption}>Tekan untuk melihat transaksi.</Text>
          {expenseCategories.map((cat, i) => (
            <Pressable
              key={cat.id}
              onPress={() => onOpenTransactions(selectedMonth, 'expense', cat.id)}
              style={({ pressed }) => [styles.catItem, pressed && styles.pressed]}
            >
              <View style={styles.row}>
                <View style={styles.catNameRow}>
                  <View style={[styles.dot, { backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }]} />
                  <Text style={styles.catName}>{cat.name}</Text>
                </View>
                <Text style={styles.percentage}>
                  {cat.pct.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%
                </Text>
              </View>
              <ProgressBar pct={cat.pct} color={CAT_COLORS[i % CAT_COLORS.length]} />
              <View style={styles.row}>
                <Text style={styles.caption}>{formatMoney(cat.total)}</Text>
                <Text style={styles.smallLink}>Rincian →</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Daily trend */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Harian</Text>
        {!hasDaily ? (
          <Text style={styles.caption}>Belum ada data harian.</Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dailyChart}
          >
            {dailyExpenses.map((item) => {
              const barH = Math.max(2, (item.amount / dailyMax) * 80);
              const dayLabel = item.date.slice(8); // DD
              return (
                <Pressable
                  key={item.date}
                  onPress={() => onOpenTransactions(selectedMonth, 'expense', undefined, item.date)}
                  style={styles.dailyColumn}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.date}: ${formatMoney(item.amount)}`}
                >
                  <View style={[styles.dailyBarArea, { height: 80 }]}>
                    <View
                      style={[styles.dailyBar, { height: barH, backgroundColor: '#D94B20' }]}
                    />
                  </View>
                  <Text style={styles.dailyLabel}>{dayLabel}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        <Text style={styles.caption}>Tekan bar untuk melihat transaksi hari itu.</Text>
      </View>

      {/* Weekday vs Weekend */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Hari kerja vs akhir pekan</Text>
        <KpiRow>
          <KpiCell
            label={`Hari kerja (${weekdayWeekend.weekdayDays} hari)`}
            value={`${formatMoney(weekdayWeekend.weekdayAvg)}/hari`}
          />
          <KpiCell
            label={`Akhir pekan (${weekdayWeekend.weekendDays} hari)`}
            value={`${formatMoney(weekdayWeekend.weekendAvg)}/hari`}
          />
        </KpiRow>
        <View style={styles.row}>
          <Text style={styles.caption}>
            Total hari kerja: {formatMoney(weekdayWeekend.weekdayTotal)}
          </Text>
          <Text style={styles.caption}>
            Total akhir pekan: {formatMoney(weekdayWeekend.weekendTotal)}
          </Text>
        </View>
      </View>

      <InsightList insights={insights} />

      {accountId === null ? null : (
        <Text style={styles.caption}>
          Data ditampilkan untuk akun terpilih saja.
        </Text>
      )}
    </View>
  );
}

// ─── Tab: Anggaran ────────────────────────────────────────────────────────────

function TabAnggaran({
  budget,
  selectedMonth,
  onOpenTransactions,
}: {
  budget: BudgetAnalysis;
  selectedMonth: string;
  onOpenTransactions: (month: string, kind?: 'all' | 'income' | 'expense' | 'transfer', categoryId?: number) => void;
}) {
  const insights = buildBudgetInsights({
    overBudgetCount: budget.overBudgetCount,
    items: budget.items,
    totalBudgeted: budget.totalBudgeted,
    totalSpent: budget.totalSpent,
    totalUnbudgetedExpense: budget.totalUnbudgetedExpense,
  });

  const overallPct = budget.totalBudgeted > 0
    ? Math.min(100, Math.round((budget.totalSpent / budget.totalBudgeted) * 100))
    : 0;

  return (
    <View style={styles.tabContent}>
      {/* KPI overview */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Ringkasan anggaran</Text>
        <KpiRow>
          <KpiCell label="Total anggaran" value={formatMoney(budget.totalBudgeted)} />
          <KpiCell label="Terpakai" value={formatMoney(budget.totalSpent)} valueColor={budget.overBudgetCount > 0 ? '#D94B20' : '#0B7055'} />
        </KpiRow>
        <KpiRow>
          <KpiCell label="Sisa" value={formatMoney(budget.totalBudgeted - budget.totalSpent)} />
          <KpiCell label="Kategori melebihi" value={String(budget.overBudgetCount)} valueColor={budget.overBudgetCount > 0 ? '#D94B20' : '#102A23'} />
        </KpiRow>
        {budget.totalBudgeted > 0 ? (
          <>
            <ProgressBar
              pct={overallPct}
              color="#0B7055"
              overBudget={budget.overBudgetCount > 0}
            />
            <Text style={styles.caption}>{overallPct}% anggaran keseluruhan terpakai.</Text>
          </>
        ) : null}
      </View>

      {/* Per category */}
      {budget.items.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.caption}>
            Belum ada anggaran untuk bulan ini. Tambahkan anggaran melalui tab Anggaran.
          </Text>
          <Pressable onPress={() => router.navigate('/anggaran')}>
            <Text style={styles.linkText}>Buka halaman Anggaran →</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Per kategori</Text>
          {budget.items.map((item) => {
            const statusLabel = item.overBudget
              ? 'Melebihi'
              : item.pct >= 80
              ? 'Hampir habis'
              : 'Aman';
            const statusColor = item.overBudget
              ? '#D94B20'
              : item.pct >= 80
              ? '#D98200'
              : '#0B7055';

            return (
              <Pressable
                key={item.id}
                onPress={() => onOpenTransactions(selectedMonth, 'expense', item.categoryId)}
                style={({ pressed }) => [styles.catItem, pressed && styles.pressed]}
              >
                <View style={styles.row}>
                  <Text style={styles.catName}>{item.name}</Text>
                  <Text style={[styles.statusBadge, { color: statusColor }]}>
                    {statusLabel}
                  </Text>
                </View>
                <ProgressBar pct={item.pct} color="#0B7055" overBudget={item.overBudget} />
                <View style={styles.row}>
                  <Text style={styles.caption}>
                    {formatMoney(item.spent)} / {formatMoney(item.budgeted)}
                  </Text>
                  <Text style={styles.smallLink}>Lihat →</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Unbudgeted expense */}
      {budget.totalUnbudgetedExpense > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Pengeluaran tanpa anggaran</Text>
          <Text style={styles.bigAmount}>{formatMoney(budget.totalUnbudgetedExpense)}</Text>
          <Text style={styles.caption}>
            Pengeluaran dari kategori yang tidak memiliki anggaran pada bulan ini.
          </Text>
          <Pressable onPress={() => onOpenTransactions(selectedMonth, 'expense')}>
            <Text style={styles.linkText}>Lihat semua pengeluaran →</Text>
          </Pressable>
        </View>
      ) : null}

      <InsightList insights={insights} />

      <Pressable onPress={() => router.navigate('/anggaran')} style={styles.outlineButton}>
        <Text style={styles.linkText}>Kelola anggaran →</Text>
      </Pressable>
    </View>
  );
}

// ─── Tab: Tabungan ────────────────────────────────────────────────────────────

function TabTabungan({
  savingsAccounts,
  savingsData,
  savingsTrend,
  prevSavingsData,
  prevLabel,
  selectedSavingsIds,
  onSelectSavings,
  selectedMonth,
}: {
  savingsAccounts: SavingsAccount[];
  savingsData: SavingsData;
  savingsTrend: SavingsTrendPoint[];
  prevSavingsData: SavingsData | null;
  prevLabel: string;
  selectedSavingsIds: number[];
  onSelectSavings: (ids: number[]) => void;
  selectedMonth: string;
}) {
  const insights = buildSavingsInsights({
    netDeposit: savingsData.netDeposit,
    endBalance: savingsData.endBalance,
    prevNetDeposit: prevSavingsData?.netDeposit,
    prevLabel,
  });

  const trendMax = Math.max(1, ...savingsTrend.map((p) => Math.abs(p.balance)));

  if (savingsAccounts.length === 0) {
    return (
      <View style={styles.tabContent}>
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Tidak ada akun tabungan</Text>
          <Text style={styles.caption}>
            Tambahkan akun dengan peran "Tabungan" di halaman Dompet untuk melihat analitik tabungan.
          </Text>
          <Pressable onPress={() => router.navigate('/dompet')}>
            <Text style={styles.linkText}>Buka Dompet →</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const isAllSelected = selectedSavingsIds.length === 0;

  return (
    <View style={styles.tabContent}>
      {/* Selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        <Pressable
          onPress={() => onSelectSavings([])}
          style={[styles.chip, isAllSelected && styles.chipActive]}
        >
          <Text style={[styles.chipText, isAllSelected && styles.chipTextActive]}>
            Semua tabungan
          </Text>
        </Pressable>
        {savingsAccounts.map((acc) => {
          const selected =
            !isAllSelected && selectedSavingsIds.length === 1 && selectedSavingsIds[0] === acc.id;
          return (
            <Pressable
              key={acc.id}
              onPress={() => onSelectSavings([acc.id])}
              style={[styles.chip, selected && styles.chipActive]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextActive]}>{acc.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* KPI */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Periode: {formatMonthLabel(selectedMonth)}</Text>
        <KpiRow>
          <KpiCell label="Saldo akhir" value={formatMoney(savingsData.endBalance)} />
          <KpiCell label="Setoran bersih" value={formatMoney(savingsData.netDeposit)} valueColor={savingsData.netDeposit >= 0 ? '#0B7055' : '#D94B20'} />
        </KpiRow>
        <KpiRow>
          <KpiCell label="Masuk dari luar" value={formatMoney(savingsData.transferInFromExternal)} />
          <KpiCell label="Keluar ke luar" value={formatMoney(savingsData.transferOutToExternal)} />
        </KpiRow>
        <Text style={styles.caption}>
          Saldo dihitung dari saldo awal + semua transaksi + transfer. Transfer antar sesama akun tabungan tidak dihitung.
        </Text>
      </View>

      {/* Trend */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Tren saldo 6 bulan</Text>
        {trendMax > 1 ? (
          <View style={styles.chartContainer}>
            {savingsTrend.map((item) => {
              const barH = Math.max(2, (Math.abs(item.balance) / trendMax) * 100);
              return (
                <View key={item.month} style={styles.chartColumn}>
                  <View style={[styles.barArea, { height: 100 }]}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: barH,
                          backgroundColor: item.balance >= 0 ? '#0B7055' : '#D94B20',
                          width: '70%',
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.chartLabel}>{formatMonthLabel(item.month, true)}</Text>
                  <Text style={styles.yearLabel}>{item.month.slice(0, 4)}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.caption}>Belum ada data tren.</Text>
        )}
      </View>

      <InsightList insights={insights} />

      <Text style={styles.footer}>
        Saldo tabungan dihitung dari saldo awal ditambah semua transaksi dan transfer hingga akhir periode.
        Periksa saldo aktual melalui halaman Dompet.
      </Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const db = useSQLiteContext();

  // Period state (0-based month)
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const [activeTab, setActiveTab] = useState<AnalyticsTab>('ringkasan');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<AccountChip[]>([]);

  // Tabungan-specific selector
  const [selectedSavingsIds, setSelectedSavingsIds] = useState<number[]>([]);

  // Data states
  const [summary, setSummary] = useState<SummaryData>({
    income: 0, expense: 0, difference: 0, avgDailyExpense: 0,
    transferIn: 0, transferOut: 0, calendarDays: 30,
  });
  const [prevSummary, setPrevSummary] = useState<PreviousSummaryData>({
    income: 0, expense: 0, label: '',
  });
  const [trendMonths, setTrendMonths] = useState<TrendMonth[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [prevExpenseCategories, setPrevExpenseCategories] = useState<PrevExpenseCategory[]>([]);
  const [dailyExpenses, setDailyExpenses] = useState<DailyExpense[]>([]);
  const [weekdayWeekend, setWeekdayWeekend] = useState<WeekdayWeekendData>({
    weekdayTotal: 0, weekdayDays: 0, weekdayAvg: 0,
    weekendTotal: 0, weekendDays: 0, weekendAvg: 0,
  });
  const [budgetData, setBudgetData] = useState<BudgetAnalysis>({
    items: [], totalBudgeted: 0, totalSpent: 0,
    totalUnbudgetedExpense: 0, overBudgetCount: 0,
  });
  const [savingsAccounts, setSavingsAccounts] = useState<SavingsAccount[]>([]);
  const [savingsData, setSavingsData] = useState<SavingsData>({
    endBalance: 0, transferInFromExternal: 0, transferOutToExternal: 0, netDeposit: 0,
  });
  const [prevSavingsData, setPrevSavingsData] = useState<SavingsData | null>(null);
  const [savingsTrend, setSavingsTrend] = useState<SavingsTrendPoint[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  const selectedMonthStr = [
    period.year,
    String(period.month + 1).padStart(2, '0'),
  ].join('-');

  const today = todayStr();

  function changeMonth(direction: number) {
    setPeriod((cur) => {
      const d = new Date(cur.year, cur.month + direction, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function resetToCurrentMonth() {
    const d = new Date();
    setPeriod({ year: d.getFullYear(), month: d.getMonth() });
  }

  function openTransactions(
    month: string,
    kind: 'all' | 'income' | 'expense' | 'transfer' = 'all',
    categoryId?: number,
    date?: string,
  ) {
    router.navigate({
      pathname: '/transaksi',
      params: {
        month: date ? date.slice(0, 7) : month,
        accountId: accountId === null ? '' : String(accountId),
        categoryId: categoryId === undefined ? '' : String(categoryId),
        kind,
        ...(date ? { date } : {}),
      },
    });
  }

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function loadData() {
        setLoading(true);
        setError('');

        try {
          const range = buildPeriodRange(period.year, period.month);
          const prevRange = buildPreviousPeriod(period.year, period.month, today);

          // Load accounts
          const accountRows = await db.getAllAsync<AccountChip>(
            'SELECT id, name FROM accounts ORDER BY id',
          );
          if (!active) return;
          setAccounts(accountRows);

          // Validate accountId still exists
          if (accountId !== null && !accountRows.some((a) => a.id === accountId)) {
            setAccountId(null);
            return;
          }

          // Load all data in parallel
          const [
            sumData,
            prevSumData,
            trend,
            expCats,
            prevExpCats,
            daily,
            wdwe,
            budget,
            savAccounts,
          ] = await Promise.all([
            fetchSummary(db, range, accountId),
            fetchPreviousSummary(db, prevRange, accountId),
            fetchTrendMonths(db, selectedMonthStr, accountId),
            fetchExpenseCategories(db, range, accountId),
            fetchPrevExpenseCategories(db, prevRange, accountId),
            fetchDailyExpense(db, range, accountId),
            fetchWeekdayVsWeekend(db, range, accountId),
            fetchBudgetAnalysis(db, selectedMonthStr),
            fetchSavingsAccounts(db),
          ]);

          if (!active) return;

          setSummary(sumData);
          setPrevSummary(prevSumData);
          setTrendMonths(trend);
          setExpenseCategories(expCats);
          setPrevExpenseCategories(prevExpCats);
          setDailyExpenses(daily);
          setWeekdayWeekend(wdwe);
          setBudgetData(budget);
          setSavingsAccounts(savAccounts);

          // Load savings data
          const savIds = selectedSavingsIds.length > 0
            ? selectedSavingsIds
            : savAccounts.map((a) => a.id);

          const [savData, prevSavData, savTrend] = await Promise.all([
            fetchSavingsData(db, range, selectedSavingsIds),
            fetchSavingsData(db, prevRange, selectedSavingsIds),
            fetchSavingsTrend(db, selectedMonthStr, selectedSavingsIds),
          ]);

          if (!active) return;

          // Suppress unused variable
          void savIds;

          setSavingsData(savData);
          setPrevSavingsData(prevSavData);
          setSavingsTrend(savTrend);
        } catch (err) {
          console.error('Gagal memuat analitik:', err);
          if (active) setError('Gagal memuat data. Tekan Coba lagi.');
        } finally {
          if (active) setLoading(false);
        }
      }

      void loadData();
      return () => { active = false; };
    }, [db, period.year, period.month, selectedMonthStr, accountId, selectedSavingsIds, reload, today]),
  );

  const showAccountFilter = activeTab !== 'anggaran' && activeTab !== 'tabungan';

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Analitik</Text>

        {/* Period picker */}
        <PeriodPicker
          year={period.year}
          month={period.month}
          onChange={changeMonth}
          onReset={resetToCurrentMonth}
        />

        {/* Account filter */}
        {showAccountFilter ? (
          <AccountFilter
            accounts={accounts}
            selectedId={accountId}
            onSelect={setAccountId}
          />
        ) : null}

        {/* Tab selector */}
        <SegmentedControl active={activeTab} onChange={setActiveTab} />

        {/* Content */}
        {loading ? (
          <LoadingState label="Memuat analitik..." />
        ) : error ? (
          <ErrorState message={error} onRetry={() => setReload((v) => v + 1)} />
        ) : (
          <>
            {activeTab === 'ringkasan' ? (
              <TabRingkasan
                summary={summary}
                prevSummary={prevSummary}
                trendMonths={trendMonths}
                expenseCategories={expenseCategories}
                selectedMonth={selectedMonthStr}
                accountId={accountId}
                onOpenTransactions={openTransactions}
              />
            ) : activeTab === 'pengeluaran' ? (
              <TabPengeluaran
                expenseCategories={expenseCategories}
                prevExpenseCategories={prevExpenseCategories}
                dailyExpenses={dailyExpenses}
                weekdayWeekend={weekdayWeekend}
                selectedMonth={selectedMonthStr}
                totalExpense={summary.expense}
                accountId={accountId}
                onOpenTransactions={openTransactions}
              />
            ) : activeTab === 'anggaran' ? (
              <TabAnggaran
                budget={budgetData}
                selectedMonth={selectedMonthStr}
                onOpenTransactions={openTransactions}
              />
            ) : (
              <TabTabungan
                savingsAccounts={savingsAccounts}
                savingsData={savingsData}
                savingsTrend={savingsTrend}
                prevSavingsData={prevSavingsData}
                prevLabel={prevSummary.label}
                selectedSavingsIds={selectedSavingsIds}
                onSelectSavings={setSelectedSavingsIds}
                selectedMonth={selectedMonthStr}
              />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F6F3' },
  content: { padding: 20, paddingBottom: 60, gap: 16 },

  title: { fontSize: 24, fontWeight: '700', color: '#102A23' },

  // Period picker
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  periodButton: {
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  arrow: { fontSize: 30, color: '#0B7055' },
  periodText: {
    flex: 1, textAlign: 'center',
    fontSize: 14, fontWeight: '600', color: '#102A23',
  },
  todayButton: {
    paddingHorizontal: 10, paddingVertical: 6,
    marginRight: 4,
    borderRadius: 10,
    backgroundColor: '#E8F5EF',
  },
  todayButtonText: { fontSize: 11, fontWeight: '600', color: '#0B7055' },

  // Chips
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: '#DCE4DF',
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  chipActive: { backgroundColor: '#D8F0E9', borderColor: '#0B7055' },
  chipText: { fontSize: 12, color: '#102A23' },
  chipTextActive: { color: '#0B7055', fontWeight: '600' },

  // Segmented control
  segmentedWrap: {
    backgroundColor: '#E2E9E4',
    borderRadius: 14,
    padding: 4,
  },
  segmented: { flexDirection: 'row', gap: 2 },
  segmentItem: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10,
  },
  segmentItemActive: { backgroundColor: '#FFFFFF' },
  segmentText: { fontSize: 13, color: '#738078', fontWeight: '500' },
  segmentTextActive: { color: '#102A23', fontWeight: '600' },

  // Cards
  card: {
    padding: 18, gap: 14,
    borderRadius: 20, backgroundColor: '#FFFFFF',
  },
  summaryCard: {
    padding: 20, gap: 12,
    borderRadius: 22, backgroundColor: '#0B7055',
  },
  summaryLabel: { fontSize: 12, color: '#E0F2EB' },
  summaryValue: { fontSize: 28, fontWeight: '700', color: '#FFFFFF' },
  summaryCaption: { fontSize: 11, lineHeight: 18, color: '#B2D9CC' },

  // KPI
  kpiRow: { flexDirection: 'row', gap: 12 },
  kpiCellWrap: { flex: 1 },
  kpiCell: {
    gap: 4, padding: 12,
    backgroundColor: '#F3F6F3',
    borderRadius: 14,
  },
  kpiLabel: { fontSize: 11, color: '#738078' },
  kpiValue: { fontSize: 15, fontWeight: '700', color: '#102A23' },

  // Section labels
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#102A23' },

  // Progress bar
  track: {
    height: 7, borderRadius: 10,
    backgroundColor: '#E6ECE8', overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 10 },

  // Category item
  catItem: { gap: 8, paddingVertical: 4 },
  catNameRow: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
  catName: { flex: 1, fontSize: 13, color: '#102A23' },
  percentage: { fontSize: 12, fontWeight: '600', color: '#102A23' },
  statusBadge: { fontSize: 11, fontWeight: '600' },

  // Legend
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 3 },

  // Trend chart
  chartContainer: { flexDirection: 'row', gap: 4 },
  chartColumn: { flex: 1, alignItems: 'center', gap: 4 },
  barArea: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
    borderBottomWidth: 1,
    borderBottomColor: '#E6ECE8',
  },
  bar: {
    width: '30%', maxWidth: 16,
    borderTopLeftRadius: 3, borderTopRightRadius: 3,
  },
  chartLabel: { fontSize: 10, color: '#102A23', textAlign: 'center' },
  yearLabel: { fontSize: 9, color: '#738078', textAlign: 'center' },

  // Daily chart
  dailyChart: { flexDirection: 'row', gap: 4, paddingVertical: 4 },
  dailyColumn: { width: 24, alignItems: 'center', gap: 2 },
  dailyBarArea: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  dailyBar: { width: 14, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  dailyLabel: { fontSize: 8, color: '#738078' },

  // Row helpers
  row: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 10,
  },

  // Typography
  bigAmount: { fontSize: 26, fontWeight: '700', color: '#102A23' },
  caption: { fontSize: 11, lineHeight: 18, color: '#738078' },
  smallLink: { fontSize: 11, color: '#0B7055' },
  linkText: { fontSize: 13, fontWeight: '600', color: '#0B7055', paddingVertical: 4 },
  errorText: { fontSize: 13, color: '#BD3C23' },
  footer: {
    fontSize: 11, lineHeight: 18,
    textAlign: 'center', color: '#738078',
  },

  // Outline button
  outlineButton: {
    alignItems: 'center',
    borderWidth: 1, borderColor: '#0B7055',
    borderRadius: 14, padding: 10,
  },

  // Insights
  insightList: { gap: 10 },
  insightItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 12, borderRadius: 14,
    backgroundColor: '#F3F6F3',
  },
  insightPositive: { backgroundColor: '#E8F5EF' },
  insightWarning: { backgroundColor: '#FFF3ED' },
  insightInfo: { backgroundColor: '#EEF2FF' },
  insightIcon: { fontSize: 14, fontWeight: '700', color: '#102A23', minWidth: 18 },
  insightText: { flex: 1, fontSize: 12, lineHeight: 18, color: '#102A23' },

  // States
  stateBox: { paddingVertical: 48, alignItems: 'center', gap: 12 },

  // Tab content
  tabContent: { gap: 16 },

  // Misc
  pressed: { opacity: 0.65 },
});
