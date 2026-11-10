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

type AccountRole = 'unassigned' | 'main' | 'savings' | 'spending';

type Account = {
  id: number;
  name: string;
  role: AccountRole;
  balance: number;
};

type MonthlySummary = {
  income: number;
  expense: number;
};

type Activity = {
  entry_key: string;
  kind: 'income' | 'expense' | 'transfer';
  amount: number;
  date: string;
  note: string;
  category: string | null;
  account: string;
  destination: string | null;
  fee: number;
};

function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function monthKey(year: number, month: number) {
  return dateKey(new Date(year, month, 1)).slice(0, 7);
}

function money(value: number) {
  return `${value < 0 ? '−' : ''}Rp ${Math.abs(value).toLocaleString(
    'id-ID',
  )}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export default function HomeScreen() {
  const db = useSQLiteContext();

  const [period, setPeriod] = useState(() => {
    const now = new Date();

    return {
      year: now.getFullYear(),
      month: now.getMonth(),
    };
  });

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [monthly, setMonthly] = useState<MonthlySummary>({
    income: 0,
    expense: 0,
  });
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  const selectedMonth = monthKey(period.year, period.month);

  const periodLabel = new Date(
    period.year,
    period.month,
    1,
  ).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  });

  const mainAccount = accounts.find((account) => account.role === 'main');
  const savingsAccounts = accounts.filter(
    (account) => account.role === 'savings',
  );
  const spendingAccounts = accounts.filter(
    (account) => account.role === 'spending',
  );
  const unassignedAccounts = accounts.filter(
    (account) => account.role === 'unassigned',
  );

  const savingsBalance = savingsAccounts.reduce(
    (total, account) => total + account.balance,
    0,
  );

  const spendingBalance = spendingAccounts.reduce(
    (total, account) => total + account.balance,
    0,
  );

  function openWallets() {
    router.push('/dompet');
  }

  function openHistory(accountId: number) {
    router.navigate({
      pathname: '/transaksi',
      params: {
        accountId: String(accountId),
        month: '',
        categoryId: '',
        kind: 'all',
      },
    });
  }

  function openMonthlyTransactions(
    kind: 'all' | 'income' | 'expense' = 'all',
  ) {
    router.navigate({
      pathname: '/transaksi',
      params: {
        month: selectedMonth,
        accountId: '',
        categoryId: '',
        kind,
      },
    });
  }

  function changeMonth(direction: number) {
    setPeriod((current) => {
      const date = new Date(
        current.year,
        current.month + direction,
        1,
      );

      return {
        year: date.getFullYear(),
        month: date.getMonth(),
      };
    });
  }

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function loadHome() {
        setLoading(true);
        setError('');

        const today = dateKey(new Date());
        const startDate = `${selectedMonth}-01`;
        const endDate = `${monthKey(
          period.year,
          period.month + 1,
        )}-01`;

        try {
          // Saldo setiap akun sampai hari ini,
          // termasuk transfer masuk dan keluar.
          const accountRows = await db.getAllAsync<Account>(
            `SELECT
               a.id,
               a.name,
               a.role,

               a.initial_balance

               + COALESCE(
                   (
                     SELECT SUM(
                       CASE WHEN t.type = 'income'
                         THEN t.amount ELSE -t.amount END
                     )
                     FROM transactions AS t
                     WHERE t.account_id = a.id
                       AND t.date <= ?
                   ), 0
                 )

               + COALESCE(
                   (
                     SELECT SUM(tr.amount)
                     FROM transfers AS tr
                     WHERE tr.to_account_id = a.id
                       AND tr.date <= ?
                   ), 0
                 )

               - COALESCE(
                   (
                     SELECT SUM(tr.amount)
                     FROM transfers AS tr
                     WHERE tr.from_account_id = a.id
                       AND tr.date <= ?
                   ), 0
                 )

               AS balance

             FROM accounts AS a
             ORDER BY a.id`,
            today,
            today,
            today,
          );

          const monthlyRow = await db.getFirstAsync<MonthlySummary>(
            `SELECT
               COALESCE(
                 SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END),
                 0
               ) AS income,

               COALESCE(
                 SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END),
                 0
               ) AS expense

             FROM transactions
             WHERE date >= ? AND date < ?`,
            startDate,
            endDate,
          );

          // Aktivitas bulanan. Admin terkait transfer ditampilkan
          // sebagai informasi pada transfer, bukan baris ganda.
          const activityRows = await db.getAllAsync<Activity>(
            `SELECT *
             FROM (
               SELECT
                 'transaction-' || t.id AS entry_key,
                 t.type AS kind,
                 t.amount AS amount,
                 t.date AS date,
                 t.note AS note,
                 c.name AS category,
                 a.name AS account,
                 NULL AS destination,
                 0 AS fee,
                 t.created_at AS recorded_at,
                 t.id AS source_id

               FROM transactions AS t
               JOIN categories AS c ON c.id = t.category_id
               JOIN accounts AS a ON a.id = t.account_id

               WHERE t.date >= ? AND t.date < ?
                 AND NOT EXISTS (
                   SELECT 1
                   FROM transfers AS linked
                   WHERE linked.fee_transaction_id = t.id
                 )

               UNION ALL

               SELECT
                 'transfer-' || tr.id AS entry_key,
                 'transfer' AS kind,
                 tr.amount AS amount,
                 tr.date AS date,
                 tr.note AS note,
                 NULL AS category,
                 origin.name AS account,
                 destination.name AS destination,
                 COALESCE(admin.amount, 0) AS fee,
                 tr.created_at AS recorded_at,
                 tr.id AS source_id

               FROM transfers AS tr
               JOIN accounts AS origin
                 ON origin.id = tr.from_account_id
               JOIN accounts AS destination
                 ON destination.id = tr.to_account_id
               LEFT JOIN transactions AS admin
                 ON admin.id = tr.fee_transaction_id

               WHERE tr.date >= ? AND tr.date < ?
             ) AS activity

             ORDER BY
               activity.date DESC,
               activity.recorded_at DESC,
               activity.source_id DESC,
               activity.entry_key DESC
             LIMIT 5`,
            startDate,
            endDate,
            startDate,
            endDate,
          );

          if (active) {
            setAccounts(accountRows);
            setMonthly(monthlyRow ?? { income: 0, expense: 0 });
            setActivities(activityRows);
          }
        } catch (err) {
          console.error('Gagal membaca Beranda:', err);

          if (active) {
            setError(
              'Beranda gagal dimuat. Pastikan database sudah versi 4.',
            );
          }
        } finally {
          if (active) setLoading(false);
        }
      }

      void loadHome();

      return () => {
        active = false;
      };
    }, [db, period.year, period.month, selectedMonth, reload]),
  );

  function accountRow(account: Account) {
    return (
      <Pressable
        key={account.id}
        onPress={() => openHistory(account.id)}
        accessibilityRole="button"
        style={styles.accountRow}
      >
        <Text style={styles.accountName}>{account.name}</Text>
        <Text
          style={[
            styles.accountAmount,
            account.balance < 0 && styles.expenseText,
          ]}
        >
          {money(account.balance)} →
        </Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView
      style={styles.screen}
      edges={['top', 'left', 'right']}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.heading}>
            <Text style={styles.caption}>Selamat datang</Text>
            <Text style={styles.title}>Keuangan saya</Text>
          </View>

          <Pressable
            onPress={openWallets}
            accessibilityRole="button"
            style={styles.walletButton}
          >
            <Text style={styles.link}>Dompet</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.state}>
            <ActivityIndicator color="#0B7055" />
            <Text style={styles.caption}>Memuat Beranda...</Text>
          </View>
        ) : error ? (
          <View style={styles.card}>
            <Text style={styles.error}>{error}</Text>
            <Pressable
              onPress={() => setReload((value) => value + 1)}
            >
              <Text style={styles.link}>Coba lagi</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* 1. Rekening utama */}
            <View style={styles.mainCard}>
              <Text style={styles.mainLabel}>
                Saldo rekening utama
              </Text>

              {mainAccount ? (
                <>
                  <Text
                    style={styles.mainAmount}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {money(mainAccount.balance)}
                  </Text>

                  <View style={styles.row}>
                    <Text style={styles.mainLabel}>
                      {mainAccount.name}
                    </Text>

                    <Pressable
                      onPress={() => openHistory(mainAccount.id)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.whiteLink}>Riwayat →</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.mainEmpty}>
                    Rekening utama belum dipilih
                  </Text>

                  <Pressable
                    onPress={openWallets}
                    accessibilityRole="button"
                  >
                    <Text style={styles.whiteLink}>
                      Tentukan melalui Dompet →
                    </Text>
                  </Pressable>
                </>
              )}

              <Text style={styles.mainNote}>
                Saldo sampai hari ini, bukan gabungan seluruh akun.
              </Text>
            </View>

            {/* 2. Tabungan */}
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.sectionTitle}>Saldo tabungan</Text>
                <Text style={styles.savingsTotal}>
                  {money(savingsBalance)}
                </Text>
              </View>

              {savingsAccounts.length > 0 ? (
                savingsAccounts.map(accountRow)
              ) : (
                <Text style={styles.caption}>
                  Belum ada akun berperan Tabungan.
                  Atur perannya melalui Dompet.
                </Text>
              )}
            </View>

            {/* 3. Ringkasan bulanan */}
            <View style={styles.periodRow}>
              <Pressable
                onPress={() => changeMonth(-1)}
                accessibilityRole="button"
                accessibilityLabel="Bulan sebelumnya"
                style={styles.periodButton}
              >
                <Text style={styles.arrow}>‹</Text>
              </Pressable>

              <Text style={styles.periodText}>{periodLabel}</Text>

              <Pressable
                onPress={() => changeMonth(1)}
                accessibilityRole="button"
                accessibilityLabel="Bulan berikutnya"
                style={styles.periodButton}
              >
                <Text style={styles.arrow}>›</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Arus uang bulanan</Text>

              <View style={styles.summaryRow}>
                <Pressable
                  onPress={() => openMonthlyTransactions('income')}
                  accessibilityRole="button"
                  style={styles.summaryItem}
                >
                  <Text style={styles.caption}>Pemasukan →</Text>
                  <Text style={styles.incomeAmount}>
                    {money(monthly.income)}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => openMonthlyTransactions('expense')}
                  accessibilityRole="button"
                  style={styles.summaryItem}
                >
                  <Text style={styles.caption}>Pengeluaran →</Text>
                  <Text style={styles.expenseAmount}>
                    {money(monthly.expense)}
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.caption}>
                Seluruh akun pada bulan terpilih.
                Transfer tidak termasuk; biaya admin termasuk.
              </Text>
            </View>

            {/* 4. Dompet belanja */}
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.sectionTitle}>Dompet belanja</Text>
                <Text style={styles.accountAmount}>
                  {money(spendingBalance)}
                </Text>
              </View>

              {spendingAccounts.length > 0 ? (
                spendingAccounts.map(accountRow)
              ) : (
                <Text style={styles.caption}>
                  Belum ada akun berperan Dompet belanja.
                  Pilih peran ini untuk e-wallet, cash, atau
                  rekening yang dipakai berbelanja.
                </Text>
              )}

              <Text style={styles.caption}>
                Saldo sampai hari ini, tidak mengikuti pemilih bulan.
              </Text>
            </View>

            {/* Akun tanpa peran tidak disembunyikan diam-diam */}
            {unassignedAccounts.length > 0 ? (
              <Pressable
                onPress={openWallets}
                accessibilityRole="button"
                style={styles.notice}
              >
                <Text style={styles.noticeTitle}>
                  {unassignedAccounts.length} akun belum memiliki peran
                </Text>
                <Text style={styles.caption}>
                  {unassignedAccounts.map((account) => account.name).join(', ')}
                  . Atur melalui Dompet agar tampil pada kelompok yang sesuai.
                </Text>
              </Pressable>
            ) : null}

            {/* 5. Aktivitas terakhir */}
            <View style={styles.row}>
              <Text style={styles.sectionTitle}>Aktivitas terakhir</Text>
              <Pressable
                onPress={() => openMonthlyTransactions()}
                accessibilityRole="button"
              >
                <Text style={styles.link}>Lihat semua →</Text>
              </Pressable>
            </View>

            <Text style={styles.caption}>
              Maksimal lima aktivitas pada {periodLabel}.
            </Text>

            <View style={styles.card}>
              {activities.length === 0 ? (
                <Text style={styles.caption}>
                  Belum ada aktivitas pada bulan ini.
                  Gunakan tombol + untuk mencatat.
                </Text>
              ) : (
                activities.map((activity) => {
                  const transfer = activity.kind === 'transfer';
                  const income = activity.kind === 'income';

                  const color = transfer
                    ? '#5264B8'
                    : income
                      ? '#0B7055'
                      : '#D94B20';

                  return (
                    <View key={activity.entry_key} style={styles.activity}>
                      <View
                        style={[
                          styles.avatar,
                          {
                            backgroundColor: transfer
                              ? '#E9ECFA'
                              : income
                                ? '#D8F0E9'
                                : '#FCEAE3',
                          },
                        ]}
                      >
                        <Text style={[styles.avatarText, { color }]}>
                          {transfer ? '⇄' : income ? '+' : '−'}
                        </Text>
                      </View>

                      <View style={styles.activityInfo}>
                        <Text style={styles.itemTitle}>
                          {activity.note ||
                            (transfer
                              ? 'Transfer antar dompet'
                              : activity.category)}
                        </Text>

                        <Text style={styles.caption}>
                          {transfer
                            ? `${activity.account} → ${activity.destination}`
                            : `${activity.category} · ${activity.account}`}
                        </Text>

                        <Text style={styles.caption}>
                          {formatDate(activity.date)}
                        </Text>

                        {transfer && activity.fee > 0 ? (
                          <Text style={styles.caption}>
                            Admin {money(activity.fee)}
                          </Text>
                        ) : null}
                      </View>

                      <View style={styles.amountColumn}>
                        <Text style={[styles.activityAmount, { color }]}>
                          {transfer ? '' : income ? '+' : '−'}
                          {money(activity.amount)}
                        </Text>
                        {transfer ? (
                          <Text style={styles.caption}>Transfer</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F6F3' },
  content: { padding: 20, paddingBottom: 40, gap: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heading: { flex: 1 },
  title: { fontSize: 25, fontWeight: '700', color: '#102A23' },
  caption: { fontSize: 11, lineHeight: 18, color: '#738078' },
  link: {
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#0B7055',
  },
  walletButton: {
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#DCE4DF',
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  mainCard: {
    padding: 22,
    gap: 12,
    borderRadius: 22,
    backgroundColor: '#0B7055',
  },
  mainLabel: { fontSize: 13, color: '#E0F2EB' },
  mainAmount: { fontSize: 32, fontWeight: '700', color: '#FFFFFF' },
  mainEmpty: { fontSize: 20, fontWeight: '600', color: '#FFFFFF' },
  mainNote: { fontSize: 10, lineHeight: 17, color: '#E0F2EB' },
  whiteLink: {
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  card: {
    padding: 16,
    gap: 14,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#102A23' },
  savingsTotal: { fontSize: 19, fontWeight: '700', color: '#5264B8' },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEF2EF',
  },
  accountName: { flex: 1, fontSize: 13, color: '#102A23' },
  accountAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0B7055',
    flexShrink: 1,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  periodButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: { fontSize: 28, color: '#0B7055' },
  periodText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: '#102A23',
  },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  summaryItem: { flex: 1, minWidth: 110, gap: 6, paddingVertical: 6 },
  incomeAmount: { fontSize: 18, fontWeight: '700', color: '#0B7055' },
  expenseAmount: { fontSize: 18, fontWeight: '700', color: '#D94B20' },
  expenseText: { color: '#D94B20' },
  notice: {
    padding: 14,
    gap: 6,
    borderRadius: 14,
    backgroundColor: '#FFF5DD',
  },
  noticeTitle: { fontSize: 12, fontWeight: '600', color: '#885D00' },
  activity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '600' },
  activityInfo: { flex: 1, gap: 2 },
  itemTitle: { fontSize: 13, fontWeight: '600', color: '#102A23' },
  amountColumn: { alignItems: 'flex-end', flexShrink: 1, maxWidth: '42%' },
  activityAmount: { fontSize: 12, fontWeight: '600' },
  state: { paddingVertical: 40, alignItems: 'center', gap: 12 },
  error: { fontSize: 13, lineHeight: 20, color: '#BD3C23' },
});