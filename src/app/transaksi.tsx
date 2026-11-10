import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Kind = 'income' | 'expense' | 'transfer';
type Filter = 'all' | Kind | 'savings';

type Account = {
  id: number;
  name: string;
  role: 'unassigned' | 'main' | 'savings' | 'spending';
};

type Category = {
  id: number;
  name: string;
  type: 'income' | 'expense';
};

type Entry = {
  entry_key: string;
  id: number;
  type: Kind;
  amount: number;
  date: string;
  note: string;
  category_id: number | null;
  category: string | null;
  account_id: number;
  account: string;
  destination_id: number | null;
  destination: string | null;
  fee_id: number | null;
  fee: number;
  linked_transfer_id: number | null;
};

const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: 'income', label: 'Pemasukan' },
  { value: 'expense', label: 'Pengeluaran' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'savings', label: 'Tabungan' },
];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function validMonth(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) &&
    Number(value.slice(0, 4)) >= 1900;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(value: string) {
  const [year, month] = value.split('-').map(Number);

  return new Date(year, month - 1, 1).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  });
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return (
    year >= 1900 &&
    year <= 9999 &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function money(value: number) {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

function dateLabel(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function numberValue(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function kindLabel(type: Kind) {
  return type === 'transfer'
    ? 'Transfer'
    : type === 'income'
      ? 'Pemasukan'
      : 'Pengeluaran';
}

function kindColor(type: Kind) {
  return type === 'transfer'
    ? '#5264B8'
    : type === 'income'
      ? '#0B7055'
      : '#D94B20';
}

const ENTRIES_SQL = `
  SELECT *
  FROM (
    SELECT
      'transaction-' || t.id AS entry_key,
      t.id AS id,
      t.type AS type,
      t.amount AS amount,
      t.date AS date,
      t.note AS note,
      t.category_id AS category_id,
      c.name AS category,
      t.account_id AS account_id,
      a.name AS account,
      NULL AS destination_id,
      NULL AS destination,
      NULL AS fee_id,
      0 AS fee,
      linked.id AS linked_transfer_id,
      t.created_at AS recorded_at

    FROM transactions AS t
    JOIN categories AS c ON c.id = t.category_id
    JOIN accounts AS a ON a.id = t.account_id
    LEFT JOIN transfers AS linked
      ON linked.fee_transaction_id = t.id

    UNION ALL

    SELECT
      'transfer-' || tr.id AS entry_key,
      tr.id AS id,
      'transfer' AS type,
      tr.amount AS amount,
      tr.date AS date,
      tr.note AS note,
      NULL AS category_id,
      NULL AS category,
      tr.from_account_id AS account_id,
      origin.name AS account,
      tr.to_account_id AS destination_id,
      destination.name AS destination,
      tr.fee_transaction_id AS fee_id,
      COALESCE(admin.amount, 0) AS fee,
      NULL AS linked_transfer_id,
      tr.created_at AS recorded_at

    FROM transfers AS tr
    JOIN accounts AS origin
      ON origin.id = tr.from_account_id
    JOIN accounts AS destination
      ON destination.id = tr.to_account_id
    LEFT JOIN transactions AS admin
      ON admin.id = tr.fee_transaction_id
  ) AS entries

  ORDER BY
    entries.date DESC,
    entries.recorded_at DESC,
    entries.id DESC,
    entries.entry_key DESC
`;

export default function TransactionsScreen() {
  const db = useSQLiteContext();

  const params = useLocalSearchParams<{
    month?: string | string[];
    accountId?: string | string[];
    categoryId?: string | string[];
    kind?: string | string[];
  }>();

  const rawMonth = first(params.month) ?? '';
  const month = validMonth(rawMonth) ? rawMonth : '';
  const accountFilter = first(params.accountId) ?? '';
  const categoryFilter = first(params.categoryId) ?? '';
  const rawKind = first(params.kind) ?? '';
  const filter: Filter =
    rawKind === 'income' ||
    rawKind === 'expense' ||
    rawKind === 'transfer' ||
    rawKind === 'savings'
      ? rawKind
      : 'all';

  const [entries, setEntries] = useState<Entry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  const [selected, setSelected] = useState<Entry | null>(null);
  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editAccount, setEditAccount] = useState<number | null>(null);
  const [editDestination, setEditDestination] =
    useState<number | null>(null);
  const [editCategory, setEditCategory] = useState<number | null>(null);
  const [editFee, setEditFee] = useState('0');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const busyRef = useRef(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryType, setCategoryType] = useState<'income' | 'expense'>('expense');
  const [categoryEditingId, setCategoryEditingId] = useState<number | null>(null);
  const [categoryError, setCategoryError] = useState('');
  const [categoryNotice, setCategoryNotice] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);
  const categoryBusyRef = useRef(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Web memakai transaksi pada koneksi provider; native memakai transaksi eksklusif.
  async function writeAtomically(work: (tx: SQLiteDatabase) => Promise<void>) {
    if (Platform.OS === 'web') {
      await db.withTransactionAsync(async () => { await work(db); });
    } else {
      await db.withExclusiveTransactionAsync(async (tx) => { await work(tx); });
    }
  }

  function resetCategoryForm() {
    setCategoryEditingId(null);
    setCategoryName('');
    setCategoryType('expense');
    setCategoryError('');
  }

  function editCategoryItem(category: Category) {
    if (categoryBusyRef.current) return;
    setCategoryEditingId(category.id);
    setCategoryName(category.name);
    setCategoryType(category.type);
    setCategoryError('');
    setCategoryNotice('');
  }

  async function saveCategory() {
    if (categoryBusyRef.current) return;
    const name = categoryName.trim().replace(/\s+/g, ' ');
    if (!name || name.length > 50) {
      setCategoryError('Isi nama kategori antara 1–50 karakter.');
      return;
    }
    if (categoryEditingId === null &&
        name.toLocaleLowerCase('id-ID') === 'biaya admin') {
      setCategoryError('Biaya admin adalah kategori khusus transfer.');
      return;
    }
    categoryBusyRef.current = true;
    setCategoryBusy(true);
    setCategoryError('');
    setCategoryNotice('');
    try {
      await writeAtomically(async (tx) => {
        const rows = await tx.getAllAsync<Category>(
          'SELECT id, name, type FROM categories',
        );
        const existing = rows.find((c) => c.id === categoryEditingId);
        if (categoryEditingId !== null && !existing) {
          throw new Error('Kategori sudah tidak ditemukan.');
        }
        if (existing?.type === 'expense' && existing.name === 'Biaya admin') {
          throw new Error('Kategori Biaya admin diperlukan oleh fitur transfer.');
        }
        const type = existing?.type ?? categoryType;
        const duplicate = rows.some((c) =>
          c.id !== categoryEditingId && c.type === type &&
          c.name.trim().toLocaleLowerCase('id-ID') === name.toLocaleLowerCase('id-ID'),
        );
        if (duplicate) throw new Error('Nama kategori tersebut sudah ada untuk jenis ini.');
        if (categoryEditingId === null) {
          await tx.runAsync(
            'INSERT INTO categories (name, type) VALUES (?, ?)', name, type,
          );
        } else {
          const result = await tx.runAsync(
            'UPDATE categories SET name = ? WHERE id = ?', name, categoryEditingId,
          );
          if (result.changes !== 1) throw new Error('Kategori tidak ditemukan.');
        }
      });
      resetCategoryForm();
      setCategoryNotice('Kategori tersimpan. Riwayat dan anggaran tetap terhubung.');
      setReload((value) => value + 1);
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : 'Kategori gagal disimpan.');
    } finally {
      categoryBusyRef.current = false;
      setCategoryBusy(false);
    }
  }

  function resetFilters() {
    setSearch('');
    router.setParams({ month: '', accountId: '', categoryId: '', kind: 'all' });
  }

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function load() {
        setLoading(true);
        setError('');

        try {
          const accountRows = await db.getAllAsync<Account>(
            'SELECT id, name, role FROM accounts ORDER BY id',
          );
          const categoryRows = await db.getAllAsync<Category>(
            'SELECT id, name, type FROM categories ORDER BY name',
          );
          const rows = await db.getAllAsync<Entry>(ENTRIES_SQL);

          if (active) {
            setAccounts(accountRows);
            setCategories(categoryRows);
            setEntries(rows);
          }
        } catch (err) {
          console.error('Gagal membaca transaksi:', err);
          if (active) setError('Data gagal dimuat. Tekan Coba lagi.');
        } finally {
          if (active) setLoading(false);
        }
      }

      void load();

      return () => {
        active = false;
      };
    }, [db, reload]),
  );

  function moveMonth(direction: number) {
    const base = month || currentMonth();
    const [year, number] = base.split('-').map(Number);
    const next = new Date(year, number - 1 + direction, 1);

    router.setParams({
      month: `${next.getFullYear()}-${String(
        next.getMonth() + 1,
      ).padStart(2, '0')}`,
    });
  }

  function closeDetail() {
    if (busyRef.current) return;
    setSelected(null);
    setDeleteConfirm(false);
    setEditing(false);
    setEditError('');
  }

  function openEntry(entry: Entry) {
    setSelected(entry);
    setDeleteConfirm(false);
    setEditing(false);
    setEditError('');
  }

  function startEditing() {
    if (!selected) return;
    setDeleteConfirm(false);

    setEditAmount(String(selected.amount));
    setEditDate(selected.date);
    setEditNote(selected.note);
    setEditAccount(selected.account_id);
    setEditDestination(selected.destination_id);
    setEditCategory(selected.category_id);
    setEditFee(String(selected.fee));
    setEditError('');
    setEditing(true);
  }

  async function saveChanges() {
    if (!selected || busyRef.current) return;

    const amount = numberValue(editAmount);
    const fee = numberValue(editFee || '0');
    const transfer = selected.type === 'transfer';

    if (amount === null || amount <= 0 || !validDate(editDate)) {
      setEditError('Isi nominal positif dan tanggal YYYY-MM-DD yang valid.');
      return;
    }

    if (!accounts.some((account) => account.id === editAccount)) {
      setEditError('Pilih akun yang valid.');
      return;
    }

    if (transfer) {
      if (
        !accounts.some((account) => account.id === editDestination) ||
        editAccount === editDestination ||
        fee === null ||
        !Number.isSafeInteger(amount + fee)
      ) {
        setEditError('Periksa akun tujuan dan biaya admin.');
        return;
      }
    } else if (
      !categories.some(
        (category) =>
          category.id === editCategory && category.type === selected.type,
      )
    ) {
      setEditError('Pilih kategori yang sesuai.');
      return;
    }

    busyRef.current = true;
    setSaving(true);
    setEditError('');

    try {
      await writeAtomically(async (tx) => {
        if (transfer) {
          const existing = await tx.getFirstAsync<{
            fee_transaction_id: number | null;
          }>(
            'SELECT fee_transaction_id FROM transfers WHERE id = ?',
            selected.id,
          );

          if (!existing) throw new Error('Transfer tidak ditemukan.');

          let feeId = existing.fee_transaction_id;
          let oldFeeToDelete: number | null = null;

          if (fee! > 0) {
            const category = await tx.getFirstAsync<{ id: number }>(
              `SELECT id FROM categories
               WHERE name = ? AND type = 'expense'`,
              'Biaya admin',
            );

            if (!category) throw new Error('Kategori Biaya admin tidak ada.');

            const origin = accounts.find((a) => a.id === editAccount)!;
            const destination = accounts.find(
              (a) => a.id === editDestination,
            )!;
            const feeNote =
              `Biaya transfer ${origin.name} ke ${destination.name}`;

            if (feeId !== null) {
              await tx.runAsync(
                `UPDATE transactions
                 SET amount = ?, account_id = ?, category_id = ?,
                     date = ?, note = ?
                 WHERE id = ?`,
                fee!,
                editAccount!,
                category.id,
                editDate,
                feeNote,
                feeId,
              );
            } else {
              const result = await tx.runAsync(
                `INSERT INTO transactions
                 (type, amount, account_id, category_id, date, note)
                 VALUES ('expense', ?, ?, ?, ?, ?)`,
                fee!,
                editAccount!,
                category.id,
                editDate,
                feeNote,
              );
              feeId = result.lastInsertRowId;
            }
          } else {
            oldFeeToDelete = feeId;
            feeId = null;
          }

          await tx.runAsync(
            `UPDATE transfers
             SET from_account_id = ?, to_account_id = ?, amount = ?,
                 date = ?, note = ?, fee_transaction_id = ?
             WHERE id = ?`,
            editAccount!,
            editDestination!,
            amount,
            editDate,
            editNote.trim(),
            feeId,
            selected.id,
          );

          if (oldFeeToDelete !== null) {
            await tx.runAsync(
              'DELETE FROM transactions WHERE id = ?',
              oldFeeToDelete,
            );
          }
        } else {
          // Biaya transfer hanya boleh diubah melalui transfer induknya.
          const linked = await tx.getFirstAsync<{ id: number }>(
            'SELECT id FROM transfers WHERE fee_transaction_id = ?',
            selected.id,
          );

          if (linked) throw new Error('Ubah melalui detail transfer.');

          const result = await tx.runAsync(
            `UPDATE transactions
             SET amount = ?, account_id = ?, category_id = ?,
                 date = ?, note = ?
             WHERE id = ?`,
            amount,
            editAccount!,
            editCategory!,
            editDate,
            editNote.trim(),
            selected.id,
          );

          if (result.changes !== 1) {
            throw new Error('Transaksi tidak ditemukan.');
          }
        }
      });

      setSelected(null);
      setEditing(false);
      setReload((value) => value + 1);
    } catch (err) {
      console.error('Gagal mengubah transaksi:', err);
      setEditError('Perubahan gagal disimpan. Coba kembali.');
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  async function deleteEntry(entry: Entry) {
    if (busyRef.current) return;

    busyRef.current = true;
    setSaving(true);
    setEditError('');

    try {
      await writeAtomically(async (tx) => {
        if (entry.type === 'transfer') {
          const existing = await tx.getFirstAsync<{
            fee_transaction_id: number | null;
          }>(
            'SELECT fee_transaction_id FROM transfers WHERE id = ?',
            entry.id,
          );

          if (!existing) throw new Error('Transfer tidak ditemukan.');

          await tx.runAsync('DELETE FROM transfers WHERE id = ?', entry.id);

          if (existing.fee_transaction_id !== null) {
            await tx.runAsync(
              'DELETE FROM transactions WHERE id = ?',
              existing.fee_transaction_id,
            );
          }
        } else {
          const linked = await tx.getFirstAsync<{ id: number }>(
            'SELECT id FROM transfers WHERE fee_transaction_id = ?',
            entry.id,
          );

          if (linked) throw new Error('Hapus melalui transfer induknya.');

          await tx.runAsync(
            'DELETE FROM transactions WHERE id = ?',
            entry.id,
          );
        }
      });

      setSelected(null);
      setEditing(false);
      setReload((value) => value + 1);
    } catch (err) {
      console.error('Gagal menghapus:', err);
      setEditError('Catatan gagal dihapus. Coba kembali.');
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  function openLinkedTransfer() {
    if (!selected?.linked_transfer_id) return;

    const transfer = entries.find(
      (entry) =>
        entry.type === 'transfer' &&
        entry.id === selected.linked_transfer_id,
    );

    if (transfer) openEntry(transfer);
  }

  const keyword = search.trim().toLowerCase();

  const visible = entries.filter((entry) => {
    const matchesMonth = !month || entry.date.startsWith(`${month}-`);
    const matchesAccount =
      !accountFilter ||
      String(entry.account_id) === accountFilter ||
      String(entry.destination_id) === accountFilter;
    const matchesCategory =
      !categoryFilter || String(entry.category_id) === categoryFilter;
    const matchesType = filter === 'all' ||
      (filter === 'savings'
        ? entry.type === 'transfer' &&
          accounts.some((a) => a.id === entry.destination_id && a.role === 'savings')
        : entry.type === filter);

    const text = [
      entry.note,
      entry.category,
      entry.account,
      entry.destination,
      kindLabel(entry.type),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return (
      matchesMonth &&
      matchesAccount &&
      matchesCategory &&
      matchesType &&
      text.includes(keyword)
    );
  });

  const income = visible.reduce(
    (sum, entry) => sum + (entry.type === 'income' ? entry.amount : 0),
    0,
  );
  const expense = visible.reduce(
    (sum, entry) => sum + (entry.type === 'expense' ? entry.amount : 0),
    0,
  );
  const transferred = visible.reduce(
    (sum, entry) => sum + (entry.type === 'transfer' ? entry.amount : 0),
    0,
  );

  const transferIn = visible.reduce((sum, entry) =>
    sum + (entry.type === 'transfer' &&
      String(entry.destination_id) === accountFilter ? entry.amount : 0), 0);
  const transferOut = visible.reduce((sum, entry) =>
    sum + (entry.type === 'transfer' &&
      String(entry.account_id) === accountFilter ? entry.amount : 0), 0);
  const selectedAccountName = accounts.find((a) =>
    String(a.id) === accountFilter)?.name;
  const selectedCategory = categories.find((c) =>
    String(c.id) === categoryFilter);
  const transferOnly = filter === 'transfer' || filter === 'savings';
  const activeFilterCount = Number(Boolean(accountFilter)) + Number(Boolean(categoryFilter));

  const linkedFee = selected?.linked_transfer_id != null;

  function chip(
    label: string,
    active: boolean,
    onPress: () => void,
    key: string,
  ) {
    return (
      <Pressable
        key={key}
        disabled={saving}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={[styles.chip, active && styles.chipActive]}
      >
        <Text style={styles.chipText}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <FlatList
        data={loading || error ? [] : visible}
        keyExtractor={(item) => item.entry_key}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Transaksi</Text>
            <View style={styles.period}>
              <Pressable onPress={() => moveMonth(-1)}
                accessibilityLabel="Bulan sebelumnya" style={styles.arrowButton}>
                <Text style={styles.arrow}>‹</Text>
              </Pressable>
              <Text style={styles.periodLabel}>
                {month ? monthLabel(month) : 'Seluruh tanggal'}
              </Text>
              <Pressable onPress={() => moveMonth(1)}
                accessibilityLabel="Bulan berikutnya" style={styles.arrowButton}>
                <Text style={styles.arrow}>›</Text>
              </Pressable>
            </View>
            <View style={styles.options}>
              {chip('Bulan ini', month === currentMonth(), () =>
                router.setParams({ month: currentMonth() }), 'current')}
              {chip('Seluruh tanggal', !month, () =>
                router.setParams({ month: '' }), 'all-dates')}
            </View>

            {!loading && !error ? (
              <View style={styles.card}>
                <Text style={styles.label}>
                  {selectedAccountName || 'Semua akun'}
                </Text>
                <Text style={styles.caption}>Ringkasan sesuai filter dan pencarian</Text>
                <View style={styles.summaryGrid}>
                  <View style={styles.summaryCell}>
                    <Text style={styles.caption}>Pemasukan</Text>
                    <Text style={styles.green}>{money(income)}</Text>
                  </View>
                  <View style={styles.summaryCell}>
                    <Text style={styles.caption}>Pengeluaran</Text>
                    <Text style={styles.red}>{money(expense)}</Text>
                  </View>
                </View>
                {accountFilter ? (
                  <View style={styles.summaryGrid}>
                    <View style={styles.summaryCell}>
                      <Text style={styles.caption}>Transfer masuk</Text>
                      <Text style={styles.blue}>{money(transferIn)}</Text>
                    </View>
                    <View style={styles.summaryCell}>
                      <Text style={styles.caption}>Transfer keluar</Text>
                      <Text style={styles.blue}>{money(transferOut)}</Text>
                    </View>
                  </View>
                ) : (
                  <View>
                    <Text style={styles.caption}>Transfer antar akun · dihitung sekali</Text>
                    <Text style={styles.blue}>{money(transferred)}</Text>
                  </View>
                )}
                <Text style={styles.caption}>
                  Transfer bukan pemasukan/pengeluaran. Biaya admin dicatat sebagai
                  pengeluaran tersendiri dan ikut filter yang dipilih.
                </Text>
              </View>
            ) : null}

            <TextInput value={search} onChangeText={setSearch}
              placeholder="Cari catatan, kategori, atau akun"
              placeholderTextColor="#738078" style={styles.input} />

            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalOptions}>
              {filters.map((item) => chip(item.label, filter === item.value, () =>
                router.setParams({ kind: item.value, categoryId: '' }), item.value))}
            </ScrollView>

            <View style={styles.options}>
              <Pressable onPress={() => setFilterOpen(true)}
                accessibilityRole="button" style={styles.outlineButton}>
                <Text style={styles.linkText}>
                  Filter{activeFilterCount ? ' (' + activeFilterCount + ')' : ''}
                </Text>
              </Pressable>
              <Pressable accessibilityRole="button"
                onPress={() => {
                  resetCategoryForm();
                  setCategoryNotice('');
                  setCategoriesOpen(true);
                }} style={styles.outlineButton}>
                <Text style={styles.linkText}>Kelola kategori</Text>
              </Pressable>
            </View>
            {accountFilter || categoryFilter ? (
              <Text style={styles.caption}>
                Akun: {selectedAccountName || (accountFilter ? 'Tidak tersedia' : 'Semua')}
                {' · '}Kategori: {selectedCategory
                  ? selectedCategory.name + (selectedCategory.type === 'income' ? ' (masuk)' : ' (keluar)')
                  : categoryFilter ? 'Tidak tersedia' : 'Semua'}
              </Text>
            ) : null}
            {filter === 'savings' ? (
              <Text style={styles.caption}>
                Tabungan menampilkan transfer menuju akun yang saat ini berperan Tabungan.
                {accounts.some((a) => a.role === 'savings')
                  ? ' Penarikan dari tabungan dapat dilihat melalui filter Transfer.'
                  : ' Tetapkan peran akun melalui halaman Dompet terlebih dahulu.'}
              </Text>
            ) : null}
            {month || accountFilter || categoryFilter || filter !== 'all' || search ? (
              <Pressable onPress={resetFilters}>
                <Text style={styles.link}>Reset seluruh filter</Text>
              </Pressable>
            ) : null}
            {!loading && !error ? (
              <Text style={styles.caption}>
                {visible.length} catatan · Tekan catatan untuk detail
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            {loading ? (
              <ActivityIndicator color="#0B7055" />
            ) : error ? (
              <>
                <Text style={styles.red}>{error}</Text>
                <Pressable onPress={() => setReload((value) => value + 1)}>
                  <Text style={styles.link}>Coba lagi</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.caption}>
                {entries.length === 0
                  ? 'Belum ada catatan. Tambahkan melalui tombol +.'
                  : 'Tidak ada catatan yang sesuai filter.'}
              </Text>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <View>
            {index === 0 || visible[index - 1].date !== item.date ? (
              <Text style={styles.dateHeading}>{dateLabel(item.date)}</Text>
            ) : null}

            <Pressable
              onPress={() => openEntry(item)}
              style={styles.entry}
              accessibilityRole="button"
            >
              <Text style={[styles.symbol, { color: kindColor(item.type) }]}>
                {item.type === 'transfer' ? '⇄' : item.type === 'income' ? '+' : '−'}
              </Text>
              <View style={styles.info}>
                <Text style={styles.itemTitle}>
                  {item.note || item.category || 'Transfer antar dompet'}
                </Text>
                <Text style={styles.caption}>
                  {item.type === 'transfer'
                    ? `${item.account} → ${item.destination}`
                    : `${item.category} · ${item.account}`}
                </Text>
                {item.linked_transfer_id !== null ? (
                  <Text style={styles.caption}>Biaya terkait transfer</Text>
                ) : null}
              </View>
              <View style={styles.amountColumn}>
                <Text style={[styles.amount, { color: kindColor(item.type) }]}>
                  {item.type === 'transfer' ? '' : item.type === 'income' ? '+' : '−'}
                  {money(item.amount)}
                </Text>
                <Text style={styles.caption}>{kindLabel(item.type)}</Text>
              </View>
            </Pressable>
          </View>
        )}
      />

      <Modal visible={filterOpen} animationType="slide"
        onRequestClose={() => setFilterOpen(false)}>
        <SafeAreaView style={styles.screen}>
          <ScrollView contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled">
            <View style={styles.row}>
              <Text style={styles.title}>Filter transaksi</Text>
              <Pressable onPress={() => setFilterOpen(false)}>
                <Text style={styles.link}>Tutup</Text>
              </Pressable>
            </View>
            <Text style={styles.caption}>Pilihan langsung diterapkan pada daftar dan ringkasan.</Text>
            <Text style={styles.label}>Akun</Text>
            <View style={styles.options}>
              {chip('Semua akun', !accountFilter, () =>
                router.setParams({ accountId: '' }), 'all-accounts')}
              {accounts.map((account) => chip(
                account.name, accountFilter === String(account.id), () =>
                  router.setParams({ accountId: String(account.id) }),
                'account-' + account.id,
              ))}
            </View>
            <Text style={styles.label}>Kategori</Text>
            {transferOnly ? (
              <Text style={styles.caption}>
                Transfer tidak menggunakan kategori pemasukan/pengeluaran.
              </Text>
            ) : (
              <View style={styles.options}>
                {chip('Semua kategori', !categoryFilter, () =>
                  router.setParams({ categoryId: '' }), 'all-categories')}
                {categories.filter((c) => filter === 'all' || c.type === filter)
                  .map((category) => chip(
                    category.name + (category.type === 'income' ? ' (masuk)' : ' (keluar)'),
                    categoryFilter === String(category.id),
                    () => router.setParams({ categoryId: String(category.id) }),
                    'category-' + category.id,
                  ))}
              </View>
            )}
            <Pressable onPress={() =>
              router.setParams({ accountId: '', categoryId: '' })}>
              <Text style={styles.link}>Reset akun dan kategori</Text>
            </Pressable>
            <Pressable onPress={() => setFilterOpen(false)} style={styles.button}>
              <Text style={styles.buttonText}>Lihat hasil</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={categoriesOpen} animationType="slide"
        onRequestClose={() => {
          if (!categoryBusyRef.current) setCategoriesOpen(false);
        }}>
        <SafeAreaView style={styles.screen}>
          <ScrollView contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled">
            <View style={styles.row}>
              <Text style={styles.title}>Kelola kategori</Text>
              <Pressable disabled={categoryBusy} onPress={() => setCategoriesOpen(false)}>
                <Text style={styles.link}>Tutup</Text>
              </Pressable>
            </View>
            <Text style={styles.caption}>
              Kategori yang disimpan tersedia untuk pencatatan, filter, dan laporan.
              Kategori pengeluaran juga tersedia untuk anggaran.
            </Text>
            <View style={styles.card}>
              <Text style={styles.label}>
                {categoryEditingId === null ? 'Tambah kategori' : 'Ubah nama kategori'}
              </Text>
              <View style={styles.options}>
                {(['expense', 'income'] as const).map((type) => (
                  <Pressable key={type}
                    disabled={categoryBusy || categoryEditingId !== null}
                    onPress={() => setCategoryType(type)}
                    style={[styles.chip, categoryType === type && styles.chipActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: categoryType === type,
                      disabled: categoryBusy || categoryEditingId !== null }}>
                    <Text style={styles.chipText}>
                      {type === 'income' ? 'Pemasukan' : 'Pengeluaran'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput value={categoryName} onChangeText={setCategoryName}
                editable={!categoryBusy} maxLength={50}
                placeholder="Nama kategori" placeholderTextColor="#738078"
                style={styles.input} />
              {categoryEditingId !== null ? (
                <Text style={styles.caption}>
                  Jenis kategori tetap. Mengubah nama juga memperbarui nama pada riwayat lama.
                </Text>
              ) : null}
              {categoryError ? <Text style={styles.red}>{categoryError}</Text> : null}
              {categoryNotice ? <Text style={styles.green}>{categoryNotice}</Text> : null}
              <Pressable disabled={categoryBusy || loading || Boolean(error)}
                onPress={() => void saveCategory()} style={styles.button}>
                <Text style={styles.buttonText}>
                  {categoryBusy ? 'Menyimpan...' : categoryEditingId === null
                    ? 'Tambah kategori' : 'Simpan nama'}
                </Text>
              </Pressable>
              {categoryEditingId !== null ? (
                <Pressable disabled={categoryBusy} onPress={() => {
                  resetCategoryForm(); setCategoryNotice('');
                }}>
                  <Text style={styles.link}>Batal mengubah</Text>
                </Pressable>
              ) : null}
            </View>
            {loading ? <ActivityIndicator color="#0B7055" /> : null}
            {error ? <Text style={styles.red}>{error}</Text> : null}
            {(['expense', 'income'] as const).map((type) => (
              <View key={type} style={styles.card}>
                <Text style={styles.label}>
                  {type === 'expense' ? 'Kategori pengeluaran' : 'Kategori pemasukan'}
                </Text>
                {categories.filter((c) => c.type === type).map((category) => {
                  const system = category.type === 'expense' && category.name === 'Biaya admin';
                  return (
                    <View key={category.id} style={styles.row}>
                      <Text style={styles.categoryName}>{category.name}</Text>
                      {system ? (
                        <Text style={styles.caption}>Khusus transfer</Text>
                      ) : (
                        <Pressable disabled={categoryBusy}
                          accessibilityLabel={'Ubah kategori ' + category.name}
                          onPress={() => editCategoryItem(category)}>
                          <Text style={styles.link}>Ubah nama</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={selected !== null}
        animationType="slide"
        onRequestClose={closeDetail}
      >
        <SafeAreaView style={styles.screen}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.row}>
              <Text style={styles.title}>
                {editing ? 'Ubah catatan' : 'Detail catatan'}
              </Text>
              <Pressable disabled={saving} onPress={closeDetail}>
                <Text style={styles.link}>Tutup</Text>
              </Pressable>
            </View>

            {selected ? (
              <>
                <Text style={styles.label}>{kindLabel(selected.type)}</Text>

                {editing ? (
                  <>
                    <Text style={styles.label}>Nominal (Rp)</Text>
                    <TextInput
                      value={editAmount}
                      editable={!saving}
                      onChangeText={(value) =>
                        setEditAmount(value.replace(/[^0-9]/g, ''))}
                      keyboardType="number-pad"
                      style={styles.input}
                    />

                    <Text style={styles.label}>
                      {selected.type === 'transfer' ? 'Akun asal' : 'Akun'}
                    </Text>
                    <View style={styles.options}>
                      {accounts.map((account) =>
                        chip(account.name, editAccount === account.id, () =>
                          setEditAccount(account.id), `edit-${account.id}`),
                      )}
                    </View>

                    {selected.type === 'transfer' ? (
                      <>
                        <Text style={styles.label}>Akun tujuan</Text>
                        <View style={styles.options}>
                          {accounts.map((account) =>
                            chip(account.name, editDestination === account.id,
                              () => setEditDestination(account.id),
                              `destination-${account.id}`),
                          )}
                        </View>
                        <Text style={styles.label}>
                          Biaya admin dari akun asal (Rp)
                        </Text>
                        <TextInput
                          value={editFee}
                          editable={!saving}
                          onChangeText={(value) =>
                            setEditFee(value.replace(/[^0-9]/g, ''))}
                          keyboardType="number-pad"
                          style={styles.input}
                        />
                      </>
                    ) : (
                      <>
                        <Text style={styles.label}>Kategori</Text>
                        <View style={styles.options}>
                          {categories
                            .filter((category) => category.type === selected.type)
                            .map((category) =>
                              chip(category.name, editCategory === category.id,
                                () => setEditCategory(category.id),
                                `edit-category-${category.id}`),
                            )}
                        </View>
                      </>
                    )}

                    <Text style={styles.label}>Tanggal YYYY-MM-DD</Text>
                    <TextInput
                      value={editDate}
                      editable={!saving}
                      onChangeText={setEditDate}
                      maxLength={10}
                      style={styles.input}
                    />
                    <Text style={styles.label}>Catatan</Text>
                    <TextInput
                      value={editNote}
                      editable={!saving}
                      onChangeText={setEditNote}
                      maxLength={200}
                      style={styles.input}
                    />

                    <Pressable
                      disabled={saving}
                      onPress={saveChanges}
                      style={styles.button}
                    >
                      <Text style={styles.buttonText}>
                        {saving ? 'Menyimpan...' : 'Simpan perubahan'}
                      </Text>
                    </Pressable>

                    <Pressable disabled={saving} onPress={() => setEditing(false)}>
                      <Text style={styles.link}>Batal mengubah</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <View style={styles.card}>
                      <Text style={[styles.detailAmount, {
                        color: kindColor(selected.type),
                      }]}>
                        {money(selected.amount)}
                      </Text>
                      <Text style={styles.itemTitle}>
                        {selected.type === 'transfer'
                          ? `${selected.account} → ${selected.destination}`
                          : `${selected.category} · ${selected.account}`}
                      </Text>
                      <Text style={styles.caption}>
                        Tanggal: {dateLabel(selected.date)}
                      </Text>
                      <Text style={styles.caption}>
                        Catatan: {selected.note || 'Tidak ada'}
                      </Text>
                      {selected.type === 'transfer' ? (
                        <Text style={styles.caption}>
                          Biaya admin: {money(selected.fee)} dari akun asal.
                          Dicatat sebagai pengeluaran tersendiri.
                        </Text>
                      ) : null}
                    </View>

                    {linkedFee ? (
                      <>
                        <Text style={styles.caption}>
                          Catatan ini adalah biaya admin transfer.
                          Ubah atau hapus melalui transfer terkait
                          supaya datanya tetap konsisten.
                        </Text>
                        <Pressable
                          onPress={openLinkedTransfer}
                          style={styles.button}
                        >
                          <Text style={styles.buttonText}>Buka transfer terkait</Text>
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <Pressable
                          disabled={saving}
                          onPress={startEditing}
                          style={styles.button}
                        >
                          <Text style={styles.buttonText}>Ubah catatan</Text>
                        </Pressable>
                        {deleteConfirm ? (
                          <View style={styles.card}>
                            <Text style={styles.label}>Hapus catatan ini?</Text>
                            <Text style={styles.caption}>
                              {selected.type === 'transfer'
                                ? 'Transfer dan biaya admin terkait akan dihapus.'
                                : 'Catatan ini akan dihapus.'}
                              {' '}Saldo akan mengikuti perubahan ini.
                            </Text>
                            <Pressable disabled={saving}
                              onPress={() => void deleteEntry(selected)}
                              style={styles.deleteButton}>
                              <Text style={styles.red}>
                                {saving ? 'Menghapus...' : 'Ya, hapus catatan'}
                              </Text>
                            </Pressable>
                            <Pressable disabled={saving}
                              onPress={() => setDeleteConfirm(false)}>
                              <Text style={styles.link}>Batal</Text>
                            </Pressable>
                          </View>
                        ) : (
                          <Pressable disabled={saving}
                            onPress={() => setDeleteConfirm(true)}
                            style={styles.deleteButton}>
                            <Text style={styles.red}>Hapus catatan</Text>
                          </Pressable>
                        )}
                      </>
                    )}
                  </>
                )}

                {editError ? (
                  <Text style={styles.red}>{editError}</Text>
                ) : null}
              </>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F6F3' },
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  header: { gap: 14 },
  horizontalOptions: { flexDirection: 'row', gap: 8 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  summaryCell: { flexGrow: 1, flexBasis: '45%', gap: 4 },
  outlineButton: {
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14,
    borderWidth: 1, borderColor: '#DCE4DF', backgroundColor: '#FFFFFF',
    minHeight: 44, justifyContent: 'center',
  },
  linkText: { color: '#0B7055', fontSize: 13, fontWeight: '600' },
  categoryName: { flex: 1, color: '#102A23', fontSize: 14 },
  title: { fontSize: 24, fontWeight: '700', color: '#102A23' },
  label: { fontSize: 13, fontWeight: '600', color: '#102A23' },
  caption: { fontSize: 11, lineHeight: 18, color: '#738078' },
  input: {
    padding: 14, borderWidth: 1, borderColor: '#DCE4DF',
    borderRadius: 12, backgroundColor: '#FFFFFF', color: '#102A23',
  },
  period: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 16,
  },
  periodLabel: {
    flex: 1, textAlign: 'center', color: '#102A23', fontWeight: '600',
  },
  arrowButton: {
    width: 48, height: 48, alignItems: 'center', justifyContent: 'center',
  },
  arrow: { fontSize: 28, color: '#0B7055' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#DCE4DF',
    borderRadius: 24, backgroundColor: '#FFFFFF',
  },
  chipActive: { borderColor: '#0B7055', backgroundColor: '#D8F0E9' },
  chipText: { fontSize: 12, color: '#102A23' },
  card: { padding: 16, gap: 12, borderRadius: 18, backgroundColor: '#FFFFFF' },
  green: { color: '#0B7055', fontSize: 14, fontWeight: '600' },
  red: { color: '#D94B20', fontSize: 13, lineHeight: 20 },
  blue: { color: '#5264B8', fontSize: 14, fontWeight: '600' },
  link: { color: '#0B7055', fontWeight: '600', paddingVertical: 10 },
  dateHeading: { color: '#738078', fontSize: 12, marginVertical: 10 },
  entry: {
    padding: 14, gap: 10, borderRadius: 16, backgroundColor: '#FFFFFF',
    flexDirection: 'row', alignItems: 'center',
  },
  symbol: { width: 24, fontSize: 24, textAlign: 'center' },
  info: { flex: 1, gap: 4 },
  itemTitle: { fontSize: 13, fontWeight: '600', color: '#102A23' },
  amountColumn: { maxWidth: '40%', alignItems: 'flex-end', gap: 4 },
  amount: { fontSize: 12, fontWeight: '600' },
  empty: { paddingVertical: 40, gap: 12, alignItems: 'center' },
  row: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', alignItems: 'center', gap: 10,
  },
  detailAmount: { fontSize: 28, fontWeight: '700' },
  button: {
    padding: 16, alignItems: 'center',
    backgroundColor: '#0B7055', borderRadius: 14,
  },
  buttonText: { color: '#FFFFFF', fontWeight: '600' },
  deleteButton: {
    padding: 15, alignItems: 'center',
    borderWidth: 1, borderColor: '#D94B20', borderRadius: 14,
  },
});