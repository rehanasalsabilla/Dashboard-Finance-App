import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  useCallback,
  useRef,
  useState,
  type ComponentRef,
} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Category = {
  id: number;
  name: string;
};

type Budget = {
  id: number;
  category_id: number;
  name: string;
  amount: number;
  spent: number;
};

function currentMonth() {
  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
  ].join('-');
}

function validMonth(value: string) {
  return (
    /^\d{4}-(0[1-9]|1[0-2])$/.test(value) &&
    Number(value.slice(0, 4)) >= 1900
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function monthLabel(value: string) {
  const [year, month] = value.split('-').map(Number);

  return new Date(year, month - 1, 1).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  });
}

function nextMonth(value: string, direction: number) {
  const [year, month] = value.split('-').map(Number);
  const date = new Date(year, month - 1 + direction, 1);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
  ].join('-');
}

function money(value: number) {
  return `Rp ${Math.abs(value).toLocaleString('id-ID')}`;
}

function budgetStatus(percentage: number) {
  if (percentage > 100) {
    return { label: 'Melebihi', color: '#D94B20' };
  }

  if (percentage === 100) {
    return { label: 'Batas tercapai', color: '#D98200' };
  }

  if (percentage >= 90) {
    return { label: 'Hampir habis', color: '#D98200' };
  }

  return { label: 'Aman', color: '#0B7055' };
}

export default function BudgetScreen() {
  const db = useSQLiteContext();
  const busyRef = useRef(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const formY = useRef(0);

  const params = useLocalSearchParams<{
    month?: string | string[];
  }>();

  const rawMonth = first(params.month) ?? '';
  const selectedMonth = validMonth(rawMonth)
    ? rawMonth
    : currentMonth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [totalExpense, setTotalExpense] = useState(0);

  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [formMonth, setFormMonth] = useState(selectedMonth);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [hasError, setHasError] = useState(false);
  const [reload, setReload] = useState(0);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const readData = useCallback(async () => {
    const startDate = `${selectedMonth}-01`;
    const endDate = `${nextMonth(selectedMonth, 1)}-01`;

    const budgetRows = await db.getAllAsync<Budget>(
      `SELECT
         b.id,
         b.category_id,
         c.name,
         b.amount,

         COALESCE(
           (
             SELECT SUM(t.amount)
             FROM transactions AS t
             WHERE t.category_id = b.category_id
               AND t.type = 'expense'
               AND t.date >= ?
               AND t.date < ?
           ),
           0
         ) AS spent

       FROM budgets AS b
       JOIN categories AS c ON c.id = b.category_id
       WHERE b.month = ?
       ORDER BY c.name`,
      startDate,
      endDate,
      selectedMonth,
    );

    const expenseRow = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE type = 'expense'
         AND date >= ?
         AND date < ?`,
      startDate,
      endDate,
    );

    return {
      budgets: budgetRows,
      totalExpense: expenseRow?.total ?? 0,
    };
  }, [db, selectedMonth]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function load() {
        setLoading(true);
        setError('');

        try {
          const categoryRows = await db.getAllAsync<Category>(
            `SELECT id, name
             FROM categories
             WHERE type = 'expense'
             ORDER BY name`,
          );

          const result = await readData();

          if (active) {
            setCategories(categoryRows);
            setBudgets(result.budgets);
            setTotalExpense(result.totalExpense);
          }
        } catch (err) {
          console.error('Gagal membaca anggaran:', err);

          if (active) {
            setError(
              'Anggaran gagal dimuat. Tekan Coba lagi untuk memuat ulang.',
            );
          }
        } finally {
          if (active) setLoading(false);
        }
      }

      void load();

      return () => {
        active = false;
      };
    }, [db, readData, reload]),
  );

  function clearMessage() {
    setMessage('');
    setHasError(false);
  }

  function resetForm() {
    setCategoryId(null);
    setAmount('');
    setFormMonth(selectedMonth);
    clearMessage();
  }

  function changeMonth(value: string) {
    if (busyRef.current) return;
    setPendingDeleteId(null);

    setCategoryId(null);
    setAmount('');
    setFormMonth(value);
    clearMessage();

    router.setParams({ month: value });
  }

  function chooseCategory(id: number) {
    const existing = budgets.find(
      (budget) => budget.category_id === id,
    );

    setCategoryId(id);
    setAmount(existing ? String(existing.amount) : '');
    setFormMonth(selectedMonth);
    clearMessage();
  }

  function editBudget(budget: Budget) {
    chooseCategory(budget.category_id);

    scrollRef.current?.scrollTo({
      y: formY.current,
      animated: true,
    });
  }

  function openTransactions(budget: Budget) {
    router.navigate({
      pathname: '/transaksi',
      params: {
        month: selectedMonth,
        accountId: '',
        categoryId: String(budget.category_id),
        kind: 'expense',
      },
    });
  }

  async function saveBudget() {
    if (busyRef.current) return;

    if (formMonth !== selectedMonth) {
      setHasError(true);
      setMessage('Periode berubah. Pilih ulang kategori dan batas anggaran.');
      return;
    }

    const nominal = Number(amount);

    if (
      categoryId === null ||
      !categories.some((category) => category.id === categoryId)
    ) {
      setHasError(true);
      setMessage('Pilih kategori pengeluaran.');
      return;
    }

    if (
      !/^\d+$/.test(amount) ||
      !Number.isSafeInteger(nominal) ||
      nominal <= 0
    ) {
      setHasError(true);
      setMessage('Isi batas anggaran yang valid, lebih besar dari 0.');
      return;
    }

    busyRef.current = true;
    setSaving(true);
    clearMessage();

    let committed = false;

    try {
      await db.runAsync(
        `INSERT INTO budgets (category_id, month, amount)
         VALUES (?, ?, ?)

         ON CONFLICT(category_id, month)
         DO UPDATE SET amount = excluded.amount`,
        categoryId,
        selectedMonth,
        nominal,
      );

      committed = true;

      const result = await readData();
      setBudgets(result.budgets);
      setTotalExpense(result.totalExpense);
      setCategoryId(null);
      setAmount('');

      setMessage(
        `Anggaran ${monthLabel(selectedMonth)} berhasil disimpan.`,
      );
    } catch (err) {
      console.error('Gagal menyimpan anggaran:', err);
      setHasError(true);

      setMessage(
        committed
          ? 'Anggaran sudah tersimpan, tetapi daftar gagal diperbarui. Tekan Muat ulang.'
          : 'Anggaran gagal disimpan. Coba kembali.',
      );
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  async function deleteBudget(budget: Budget) {
    if (busyRef.current) return;

    busyRef.current = true;
    setSaving(true);
    clearMessage();

    let committed = false;

    try {
      await db.runAsync(
        'DELETE FROM budgets WHERE id = ? AND month = ?',
        budget.id,
        selectedMonth,
      );

      committed = true;

      setPendingDeleteId(null);
      const result = await readData();
      setBudgets(result.budgets);
      setTotalExpense(result.totalExpense);

      if (categoryId === budget.category_id) {
        setCategoryId(null);
        setAmount('');
      }

      setMessage(
        `Batas anggaran ${budget.name} dihapus. Transaksi tetap tersimpan.`,
      );
    } catch (err) {
      console.error('Gagal menghapus anggaran:', err);
      setHasError(true);

      setMessage(
        committed
          ? 'Batas sudah dihapus, tetapi daftar gagal diperbarui. Tekan Muat ulang.'
          : 'Batas anggaran gagal dihapus.',
      );
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  function confirmDelete(budget: Budget) {
    if (busyRef.current) return;
    setPendingDeleteId(budget.id);
    clearMessage();
  }

  const overBudgetCount = budgets.filter(
    (budget) => budget.spent > budget.amount,
  ).length;

  const totalBudget = budgets.reduce(
    (total, budget) => total + budget.amount,
    0,
  );

  const budgetSpent = budgets.reduce(
    (total, budget) => total + budget.spent,
    0,
  );

  const unbudgetedExpense = Math.max(0, totalExpense - budgetSpent);
  const remaining = totalBudget - budgetSpent;

  const overallPercentage =
    totalBudget > 0 ? (budgetSpent / totalBudget) * 100 : 0;

  const overallStatus = budgetStatus(overallPercentage);

  const editingExisting =
    formMonth === selectedMonth &&
    budgets.some((budget) => budget.category_id === categoryId);

  return (
    <SafeAreaView
      style={styles.screen}
      edges={['top', 'left', 'right']}
    >
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.row}>
            <Text style={styles.title}>Anggaran</Text>

            <Pressable
              disabled={saving}
              onPress={() => setReload((value) => value + 1)}
            >
              <Text style={styles.link}>Muat ulang</Text>
            </Pressable>
          </View>

          <View style={styles.periodRow}>
            <Pressable
              disabled={saving}
              onPress={() =>
                changeMonth(nextMonth(selectedMonth, -1))
              }
              accessibilityRole="button"
              accessibilityLabel="Bulan sebelumnya"
              style={styles.periodButton}
            >
              <Text style={styles.arrow}>‹</Text>
            </Pressable>

            <Text style={styles.periodText}>
              {monthLabel(selectedMonth)}
            </Text>

            <Pressable
              disabled={saving}
              onPress={() =>
                changeMonth(nextMonth(selectedMonth, 1))
              }
              accessibilityRole="button"
              accessibilityLabel="Bulan berikutnya"
              style={styles.periodButton}
            >
              <Text style={styles.arrow}>›</Text>
            </Pressable>
          </View>

          <Pressable
            disabled={saving}
            onPress={() => changeMonth(currentMonth())}
          >
            <Text style={styles.link}>Kembali ke bulan ini</Text>
          </Pressable>

          {loading ? (
            <View style={styles.state}>
              <ActivityIndicator color="#0B7055" />
              <Text style={styles.caption}>Memuat anggaran...</Text>
            </View>
          ) : error ? (
            <View style={styles.card}>
              <Text style={styles.error}>{error}</Text>
              <Pressable onPress={() => setReload((value) => value + 1)}>
                <Text style={styles.link}>Coba lagi</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {budgets.length === 0 ? (
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Belum ada anggaran</Text>
                  <Text style={styles.caption}>
                    Batas pengeluaran untuk {monthLabel(selectedMonth)} belum diatur.
                    Pilih kategori dan isi batas bulanan pada form di bawah.
                  </Text>
                  <Pressable onPress={() => {
                    resetForm();
                    scrollRef.current?.scrollTo({
                      y: formY.current,
                      animated: true,
                    });
                  }} style={styles.button} accessibilityRole="button">
                    <Text style={styles.buttonText}>Buat anggaran</Text>
                  </Pressable>
                </View>
              ) : (
              <View style={styles.card}>
                <Text style={styles.caption}>
                  Terpakai pada kategori yang dianggarkan
                </Text>

                <Text style={styles.bigAmount}>
                  {money(budgetSpent)}
                </Text>

                <Text style={styles.caption}>
                  Dari total batas {money(totalBudget)}
                </Text>

                <View style={styles.track}>
                  <View
                    style={[
                      styles.progress,
                      {
                        width: `${Math.min(overallPercentage, 100)}%`,
                        backgroundColor: overallStatus.color,
                      },
                    ]}
                  />
                </View>

                <Text
                  style={[
                    styles.status,
                    { color: overallStatus.color },
                  ]}
                >
                  {remaining >= 0 ? 'Sisa batas anggaran' : 'Melebihi total batas'}{' '}
                  {money(remaining)}
                </Text>

                <Text style={styles.caption}>
                  {budgets.length} kategori memiliki batas.
                  Berlaku gabungan seluruh akun.
                </Text>
                {overBudgetCount > 0 ? (
                  <View style={styles.warningBox}>
                    <Text style={styles.warningText}>
                      {overBudgetCount} kategori melebihi batas.
                    </Text>
                    <Text style={styles.caption}>
                      Periksa kartu kategori di bawah. Sisa batas kategori lain
                      tidak otomatis menambah batas kategori yang berlebih.
                    </Text>
                  </View>
                ) : null}
                <Text style={styles.caption}>
                  Sisa batas anggaran bukan saldo rekening atau uang yang disisihkan.
                </Text>
              </View>

              )}

              {/* Menjelaskan pengeluaran yang tidak tercakup anggaran */}
              <View style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.caption}>
                    Seluruh pengeluaran bulan ini
                  </Text>
                  <Text style={styles.itemTitle}>
                    {money(totalExpense)}
                  </Text>
                </View>

                <View style={styles.row}>
                  <Text style={styles.caption}>
                    Kategori tanpa anggaran
                  </Text>
                  <Text style={styles.itemTitle}>
                    {money(unbudgetedExpense)}
                  </Text>
                </View>

                <Text style={styles.caption}>
                  Pengeluaran tanpa anggaran tetap tercatat pada
                  Laporan, tetapi tidak memakai batas kategori lain.
                </Text>
              </View>

              {budgets.length > 0 ? (
                <Text style={styles.sectionTitle}>Per kategori</Text>
              ) : null}

              {budgets.length > 0 ? (
                budgets.map((budget) => {
                  const percentage =
                    (budget.spent / budget.amount) * 100;

                  const status = budgetStatus(percentage);
                  const remainingCategory =
                    budget.amount - budget.spent;

                  return (
                    <View key={budget.id} style={styles.card}>
                      <View style={styles.row}>
                        <Text style={styles.sectionTitle}>
                          {budget.name}
                        </Text>

                        <Text
                          style={[
                            styles.status,
                            { color: status.color },
                          ]}
                        >
                          {status.label} ·{' '}
                          {percentage.toLocaleString('id-ID', {
                            maximumFractionDigits: 1,
                          })}
                          %
                        </Text>
                      </View>

                      <View style={styles.track}>
                        <View
                          style={[
                            styles.progress,
                            {
                              width: `${Math.min(percentage, 100)}%`,
                              backgroundColor: status.color,
                            },
                          ]}
                        />
                      </View>

                      <Text style={styles.caption}>
                        {money(budget.spent)} dari{' '}
                        {money(budget.amount)}
                      </Text>

                      <Text style={styles.caption}>
                        {remainingCategory >= 0 ? 'Sisa batas' : 'Melebihi batas'}{' '}
                        {money(remainingCategory)}
                      </Text>

                      <View style={styles.actions}>
                        <Pressable
                          disabled={saving}
                          onPress={() => openTransactions(budget)}
                        >
                          <Text style={styles.link}>
                            Lihat pengeluaran
                          </Text>
                        </Pressable>

                        <Pressable
                          disabled={saving}
                          onPress={() => editBudget(budget)}
                        >
                          <Text style={styles.link}>Ubah batas</Text>
                        </Pressable>

                        <Pressable
                          disabled={saving}
                          onPress={() => confirmDelete(budget)}
                        >
                          <Text style={styles.deleteLink}>Hapus</Text>
                        </Pressable>
                      </View>

                      {pendingDeleteId === budget.id ? (
                        <View style={styles.confirmBox}>
                          <Text style={styles.itemTitle}>
                            Hapus batas {budget.name}?
                          </Text>
                          <Text style={styles.caption}>
                            Hanya batas untuk {monthLabel(selectedMonth)} yang
                            dihapus. Transaksi pengeluaran tetap tersimpan dan
                            masuk bagian kategori tanpa anggaran.
                          </Text>
                          <View style={styles.actions}>
                            <Pressable disabled={saving}
                              accessibilityRole="button"
                              onPress={() => void deleteBudget(budget)}>
                              <Text style={styles.deleteLink}>
                                {saving ? 'Menghapus...' : 'Ya, hapus batas'}
                              </Text>
                            </Pressable>
                            <Pressable disabled={saving}
                              accessibilityRole="button"
                              onPress={() => setPendingDeleteId(null)}>
                              <Text style={styles.link}>Batal</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  );
                })
              ) : null}

              {/* Form tambah / ubah */}
              <View
                onLayout={(event) => {
                  formY.current = event.nativeEvent.layout.y;
                }}
                style={styles.card}
              >
                <View style={styles.row}>
                  <Text style={styles.sectionTitle}>
                    {editingExisting
                      ? 'Ubah batas anggaran'
                      : 'Tambah anggaran'}
                  </Text>

                  {categoryId !== null ? (
                    <Pressable disabled={saving} onPress={resetForm}>
                      <Text style={styles.link}>Reset</Text>
                    </Pressable>
                  ) : null}
                </View>

                <Text style={styles.caption}>
                  Periode: {monthLabel(selectedMonth)}
                </Text>

                <Text style={styles.label}>Kategori pengeluaran</Text>

                <View style={styles.options}>
                  {categories.map((category) => (
                    <Pressable
                      key={category.id}
                      disabled={saving}
                      onPress={() => chooseCategory(category.id)}
                      accessibilityRole="button"
                      accessibilityState={{
                        selected:
                          formMonth === selectedMonth &&
                          categoryId === category.id,
                      }}
                      style={[
                        styles.chip,
                        formMonth === selectedMonth &&
                          categoryId === category.id &&
                          styles.chipActive,
                      ]}
                    >
                      <Text style={styles.chipText}>
                        {category.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.label}>Batas bulanan (Rp)</Text>

                <TextInput
                  value={formMonth === selectedMonth ? amount : ''}
                  editable={!saving}
                  onChangeText={(value) => {
                    setAmount(value.replace(/[^0-9]/g, ''));
                    setFormMonth(selectedMonth);
                    clearMessage();
                  }}
                  keyboardType="number-pad"
                  placeholder="Contoh: 1500000"
                  placeholderTextColor="#A2ADA6"
                  accessibilityLabel="Batas anggaran bulanan"
                  style={styles.input}
                />

                <Text style={styles.caption}>
                  Kategori yang sudah memiliki batas akan diperbarui,
                  bukan ditambahkan menjadi anggaran ganda.
                  Batas setiap bulan diatur terpisah.
                </Text>

                <Pressable
                  disabled={saving}
                  onPress={saveBudget}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.button,
                    (pressed || saving) && styles.disabled,
                  ]}
                >
                  <Text style={styles.buttonText}>
                    {saving ? 'Memproses...' : 'Simpan anggaran'}
                  </Text>
                </Pressable>
              </View>

              {message ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[styles.message, hasError && styles.error]}
                >
                  {message}
                </Text>
              ) : null}

              <Text style={styles.footer}>
                Anggaran memantau pengeluaran berdasarkan tanggal
                catatan. Tidak mengunci atau memindahkan uang.
                Transfer tidak memakai anggaran; biaya admin termasuk
                jika kategorinya diberi batas.
              </Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F6F3' },
  content: { padding: 20, paddingBottom: 40, gap: 18 },
  title: { fontSize: 24, fontWeight: '700', color: '#102A23' },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  periodButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: { fontSize: 30, color: '#0B7055' },
  periodText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: '#102A23',
  },
  card: {
    padding: 18,
    gap: 14,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#102A23' },
  itemTitle: { fontSize: 13, fontWeight: '600', color: '#102A23' },
  bigAmount: { fontSize: 28, fontWeight: '700', color: '#102A23' },
  caption: { fontSize: 12, lineHeight: 19, color: '#738078' },
  status: { fontSize: 11, fontWeight: '600' },
  track: {
    height: 7,
    borderRadius: 10,
    backgroundColor: '#E6ECE8',
    overflow: 'hidden',
  },
  progress: { height: '100%', borderRadius: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  link: {
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#0B7055',
  },
  deleteLink: {
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#D94B20',
  },
  label: { fontSize: 12, color: '#738078' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#DCE4DF',
    borderRadius: 24,
  },
  chipActive: { borderColor: '#0B7055', backgroundColor: '#D8F0E9' },
  chipText: { fontSize: 12, color: '#102A23' },
  input: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#DCE4DF',
    borderRadius: 12,
    fontSize: 16,
    color: '#102A23',
  },
  button: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#0B7055',
  },
  buttonText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  disabled: { opacity: 0.6 },
  message: { fontSize: 13, lineHeight: 20, color: '#0B7055' },
  error: { fontSize: 13, lineHeight: 20, color: '#BD3C23' },
  footer: {
    fontSize: 11,
    lineHeight: 18,
    textAlign: 'center',
    color: '#738078',
  },
  warningBox: {
    padding: 12, gap: 6, borderRadius: 12, backgroundColor: '#FFF1E8',
  },
  warningText: {
    color: '#B43D1B', fontSize: 13, fontWeight: '600',
  },
  confirmBox: {
    padding: 12, gap: 8, borderRadius: 12,
    borderWidth: 1, borderColor: '#EDC9BA', backgroundColor: '#FFF8F4',
  },
  state: { paddingVertical: 40, alignItems: 'center', gap: 12 },
});