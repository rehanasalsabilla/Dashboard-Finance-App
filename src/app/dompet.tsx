import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type AccountType = 'cash' | 'bank' | 'ewallet';

type AccountRole = 'unassigned' | 'main' | 'savings' | 'spending';

const accountRoles: { value: AccountRole; label: string }[] = [
  { value: 'unassigned', label: 'Belum ditentukan' },
  { value: 'main', label: 'Rekening utama' },
  { value: 'savings', label: 'Tabungan' },
  { value: 'spending', label: 'Dompet belanja' },
];

function roleLabel(role: AccountRole) {
  return accountRoles.find((item) => item.value === role)?.label ?? role;
}

type Account = {
  id: number;
  name: string;
  type: AccountType;
  role: AccountRole;
  initial_balance: number;
  balance: number;
};

type BalanceMode = 'add' | 'included';

const accountTypes: { value: AccountType; label: string }[] = [
  { value: 'cash', label: 'Tunai' },
  { value: 'bank', label: 'Rekening bank' },
  { value: 'ewallet', label: 'E-wallet' },
];

function today() {
  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function money(value: number) {
  return `${value < 0 ? '−' : ''}Rp ${Math.abs(value).toLocaleString(
    'id-ID',
  )}`;
}

function parseBalance(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const result = Number(value);

  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}

function typeLabel(type: AccountType) {
  return accountTypes.find((item) => item.value === type)?.label ?? type;
}

export default function WalletScreen() {
  const db = useSQLiteContext();
  const busyRef = useRef(false);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [role, setRole] = useState<AccountRole>('unassigned');
  const [openingBalance, setOpeningBalance] = useState('0');

  const [mergeSourceId, setMergeSourceId] = useState<number | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [balanceMode, setBalanceMode] = useState<BalanceMode | null>(null);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [hasError, setHasError] = useState(false);

  const readAccounts = useCallback(async () => {
    const date = today();

    return db.getAllAsync<Account>(
      `SELECT
         a.id,
         a.name,
         a.type,
         a.role,
         a.initial_balance,

         a.initial_balance

         + COALESCE(
             (
               SELECT SUM(
                 CASE WHEN t.type = 'income'
                   THEN t.amount ELSE -t.amount END
               )
               FROM transactions AS t
               WHERE t.account_id = a.id AND t.date <= ?
             ), 0
           )

         + COALESCE(
             (
               SELECT SUM(tr.amount)
               FROM transfers AS tr
               WHERE tr.to_account_id = a.id AND tr.date <= ?
             ), 0
           )

         - COALESCE(
             (
               SELECT SUM(tr.amount)
               FROM transfers AS tr
               WHERE tr.from_account_id = a.id AND tr.date <= ?
             ), 0
           )

         AS balance

       FROM accounts AS a
       ORDER BY a.id`,
      date,
      date,
      date,
    );
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function load() {
        setLoading(true);
        setLoadError('');

        try {
          const rows = await readAccounts();
          if (active) setAccounts(rows);
        } catch (error) {
          console.error('Gagal membaca dompet:', error);
          if (active) setLoadError('Daftar dompet gagal dimuat.');
        } finally {
          if (active) setLoading(false);
        }
      }

      void load();

      return () => {
        active = false;
      };
    }, [readAccounts, reload]),
  );

  function clearMessage() {
    setMessage('');
    setHasError(false);
  }

  function showError(text: string) {
    setHasError(true);
    setMessage(text);
  }

  function resetForm() {
    setEditingId(null);
    setName('');
    setType('bank');
    setRole('unassigned');
    setOpeningBalance('0');
  }

  function startEditing(account: Account) {
    setMergeSourceId(null);
    setMergeTargetId(null);
    setBalanceMode(null);
    setEditingId(account.id);
    setName(account.name);
    setType(account.type);
    setRole(account.role);
    setOpeningBalance(String(account.initial_balance));
    clearMessage();
  }

  function startMerge(account: Account) {
    resetForm();
    setMergeSourceId(account.id);
    setMergeTargetId(null);
    setBalanceMode(null);
    clearMessage();
  }

  async function saveAccount() {
    if (busyRef.current) return;

    const accountName = name.trim();
    const balance = parseBalance(openingBalance);

    if (!accountName || balance === null) {
      showError('Isi nama dan saldo awal berupa angka 0 atau lebih.');
      return;
    }

    if (role === 'main' && type !== 'bank') {
      showError('Rekening utama harus berjenis Rekening bank.');
      return;
    }

    busyRef.current = true;
    setSaving(true);
    clearMessage();

    const updating = editingId !== null;
    let committed = false;

    try {
      await db.withExclusiveTransactionAsync(async (tx) => {
        const existing = await tx.getAllAsync<{
          id: number;
          name: string;
        }>('SELECT id, name FROM accounts');

        const duplicate = existing.some(
          (account) =>
            account.id !== editingId &&
            account.name.trim().toLowerCase() === accountName.toLowerCase(),
        );

        if (duplicate) throw new Error('DUPLICATE_NAME');

        // Lepaskan peran utama sebelumnya terlebih dahulu.
        // Dilakukan dalam transaksi yang sama agar tidak ada perubahan separuh.
        if (role === 'main') {
          await tx.runAsync(
            `UPDATE accounts
            SET role = 'unassigned'
            WHERE role = 'main'
              AND (? IS NULL OR id != ?)`,
            editingId,
            editingId,
          );
        }

        if (editingId !== null) {
          const result = await tx.runAsync(
            `UPDATE accounts
            SET name = ?, type = ?, role = ?, initial_balance = ?
            WHERE id = ?`,
            accountName,
            type,
            role,
            balance,
            editingId,
          );

          if (result.changes !== 1) {
            throw new Error('ACCOUNT_NOT_FOUND');
          }
        } else {
          await tx.runAsync(
            `INSERT INTO accounts
              (name, type, role, initial_balance)
            VALUES (?, ?, ?, ?)`,
            accountName,
            type,
            role,
            balance,
          );
        }
      });

      committed = true;
      resetForm();
      setAccounts(await readAccounts());

      setMessage(
        updating
          ? 'Dompet dan perannya berhasil diperbarui.'
          : 'Dompet berhasil ditambahkan.',
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'DUPLICATE_NAME'
      ) {
        showError(
          'Nama sudah digunakan. Gunakan Gabungkan akun untuk memindahkan pencatatan ke akun yang sudah ada.',
        );
      } else {
        console.error('Gagal menyimpan dompet:', error);

        showError(
          committed
            ? 'Data tersimpan, tetapi daftar gagal diperbarui. Tekan Muat ulang.'
            : 'Dompet gagal disimpan. Pastikan database sudah versi 4.',
        );
      }
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  async function mergeAccounts(
    sourceId: number,
    targetId: number,
    mode: BalanceMode,
  ) {
    if (busyRef.current) return;

    busyRef.current = true;
    setSaving(true);
    clearMessage();

    let committed = false;

    try {
      await db.withExclusiveTransactionAsync(async (tx) => {
        const source = await tx.getFirstAsync<Account>(
          'SELECT id, name, type, role, initial_balance FROM accounts WHERE id = ?',
          sourceId,
        );

        const target = await tx.getFirstAsync<Account>(
          'SELECT id, name, type, role, initial_balance FROM accounts WHERE id = ?',
          targetId,
        );

        if (!source || !target || sourceId === targetId) {
          throw new Error('Akun asal atau tujuan tidak valid.');
        }

        if (source.role === 'main' && target.type !== 'bank') {
          throw new Error(
            'Rekening utama hanya dapat digabungkan ke rekening bank.',
          );
        }

        const nextOpening =
          mode === 'add'
            ? target.initial_balance + source.initial_balance
            : target.initial_balance;

        if (!Number.isSafeInteger(nextOpening)) {
          throw new Error('Saldo awal gabungan tidak valid.');
        }

        // Transfer antara kedua akun menjadi transfer ke diri sendiri.
        // Hapus transfernya, tetapi pertahankan biaya admin sebagai expense.
        const internalTransfers = await tx.getAllAsync<{
          id: number;
          fee_transaction_id: number | null;
        }>(
          `SELECT id, fee_transaction_id
           FROM transfers
           WHERE
             (from_account_id = ? AND to_account_id = ?)
             OR
             (from_account_id = ? AND to_account_id = ?)`,
          sourceId,
          targetId,
          targetId,
          sourceId,
        );

        for (const transfer of internalTransfers) {
          if (transfer.fee_transaction_id !== null) {
            await tx.runAsync(
              `UPDATE transactions
               SET note = ?
               WHERE id = ?`,
              `Biaya transfer sebelum penggabungan ${source.name} dan ${target.name}`,
              transfer.fee_transaction_id,
            );
          }

          await tx.runAsync(
            'DELETE FROM transfers WHERE id = ?',
            transfer.id,
          );
        }

        // Seluruh tanggal dipindahkan, termasuk catatan masa depan.
        await tx.runAsync(
          'UPDATE transactions SET account_id = ? WHERE account_id = ?',
          targetId,
          sourceId,
        );

        await tx.runAsync(
          `UPDATE transfers
           SET from_account_id = ?
           WHERE from_account_id = ?`,
          targetId,
          sourceId,
        );

        await tx.runAsync(
          `UPDATE transfers
           SET to_account_id = ?
           WHERE to_account_id = ?`,
          targetId,
          sourceId,
        );

        await tx.runAsync(
          'UPDATE accounts SET initial_balance = ? WHERE id = ?',
          nextOpening,
          targetId,
        );

        const removed = await tx.runAsync(
          'DELETE FROM accounts WHERE id = ?',
          sourceId,
        );

        if (removed.changes !== 1) {
          throw new Error('Akun asal gagal dihapus.');  
        }
        // Jika akun utama dihapus melalui penggabungan,
        // peran utamanya diteruskan ke akun tujuan.
        if (source.role === 'main') {
          await tx.runAsync(
            "UPDATE accounts SET role = 'main' WHERE id = ?",
            targetId,
          );
        }
      });

      committed = true;
      setMergeSourceId(null);
      setMergeTargetId(null);
      setBalanceMode(null);
      setAccounts(await readAccounts());
      setMessage(
        'Akun berhasil digabungkan. Riwayat sudah dipindahkan ke akun tujuan.',
      );
    } catch (error) {
      console.error('Gagal menggabungkan akun:', error);

      showError(
        committed
          ? 'Penggabungan berhasil, tetapi daftar gagal diperbarui. Tekan Muat ulang.'
          : 'Penggabungan gagal dan perubahan dibatalkan.',
      );
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  function confirmMerge() {
    const source = accounts.find((account) => account.id === mergeSourceId);
    const target = accounts.find((account) => account.id === mergeTargetId);

    if (!source || !target || !balanceMode) {
      showError('Pilih akun tujuan dan perlakuan saldo awal.');
      return;
    }

    const mode = balanceMode;

    Alert.alert(
      'Gabungkan akun?',
      [
        `${source.name} akan digabungkan ke ${target.name}.`,
        '',
        'Riwayat dipindahkan dan akun asal dihapus.',
        'Transfer antara keduanya dihapus; biaya admin tetap dicatat.',
        '',
        mode === 'add'
          ? 'Saldo awal asal ditambahkan ke saldo awal tujuan.'
          : 'Saldo awal tujuan tetap. Saldo awal asal tidak ditambahkan.',
        '',
        'Catatan transaksi yang sama di kedua akun tidak otomatis dihapus. Proses ini tidak memiliki tombol urungkan.',
      ].join('\n'),
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Gabungkan',
          style: 'destructive',
          onPress: () => void mergeAccounts(source.id, target.id, mode),
        },
      ],
    );
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

  function option(
    key: string,
    label: string,
    active: boolean,
    onPress: () => void,
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

  const mergeSource = accounts.find((account) => account.id === mergeSourceId);
  const mergeTarget = accounts.find((account) => account.id === mergeTargetId);

  const totalBalance = accounts.reduce(
    (total, account) => total + account.balance,
    0,
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.row}>
          <Text style={styles.title}>Dompet</Text>
          <Pressable
            disabled={saving}
            onPress={() => setReload((value) => value + 1)}
          >
            <Text style={styles.link}>Muat ulang</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color="#0B7055" />
        ) : loadError ? (
          <Text style={styles.error}>{loadError}</Text>
        ) : (
          <>
            <View style={styles.balanceCard}>
              <Text style={styles.white}>Total saldo saat ini</Text>
              <Text style={styles.total}>{money(totalBalance)}</Text>
              <Text style={styles.white}>
                {accounts.length} dompet · transaksi sampai hari ini
              </Text>
            </View>

            {accounts.map((account) => (
              <View key={account.id} style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.info}>
                    <Text style={styles.sectionTitle}>{account.name}</Text>
                    <Text style={styles.caption}>
                      {typeLabel(account.type)} · {roleLabel(account.role)}
                    </Text>
                  </View>
                  <Text style={styles.accountBalance}>
                    {money(account.balance)}
                  </Text>
                </View>

                <Text style={styles.caption}>
                  Saldo awal: {money(account.initial_balance)}
                </Text>

                <View style={styles.options}>
                  <Pressable
                    disabled={saving}
                    onPress={() => openHistory(account.id)}
                  >
                    <Text style={styles.link}>Riwayat</Text>
                  </Pressable>

                  <Pressable
                    disabled={saving}
                    onPress={() => startEditing(account)}
                  >
                    <Text style={styles.link}>Ubah data</Text>
                  </Pressable>

                  {accounts.length > 1 ? (
                    <Pressable
                      disabled={saving}
                      onPress={() => startMerge(account)}
                    >
                      <Text style={styles.link}>Gabungkan akun</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}

            {mergeSource ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>
                  Gabungkan {mergeSource.name}
                </Text>

                <Text style={styles.caption}>
                  Pilih akun tujuan. Gunakan untuk membetulkan
                  pencatatan akun, bukan mencatat setoran atau top-up baru.
                </Text>

                <View style={styles.options}>
                  {accounts
                    .filter((account) => account.id !== mergeSource.id)
                    .map((account) =>
                      option(
                        `target-${account.id}`,
                        account.name,
                        mergeTargetId === account.id,
                        () => {
                          setMergeTargetId(account.id);
                          clearMessage();
                        },
                      ),
                    )}
                </View>

                <Text style={styles.caption}>
                  Saldo awal asal: {money(mergeSource.initial_balance)}
                </Text>

                {mergeTarget ? (
                  <Text style={styles.caption}>
                    Saldo awal tujuan: {money(mergeTarget.initial_balance)}
                  </Text>
                ) : null}

                <Text style={styles.sectionTitle}>
                  Perlakuan saldo awal
                </Text>

                {option(
                  'add',
                  'Tambahkan saldo awal asal',
                  balanceMode === 'add',
                  () => setBalanceMode('add'),
                )}

                <Text style={styles.caption}>
                  Pilih jika saldo awal asal dan tujuan merupakan
                  uang berbeda. Total saldo seluruh dompet tetap.
                </Text>

                {option(
                  'included',
                  'Saldo awal asal sudah termasuk di tujuan',
                  balanceMode === 'included',
                  () => setBalanceMode('included'),
                )}

                <Text style={styles.caption}>
                  Pilih jika saldo awal asal mencatat uang yang sama.
                  Total saldo berkurang sebesar saldo awal asal.
                  Riwayat transaksi tetap dipindahkan.
                </Text>

                <Text style={styles.caption}>
                  Jika transaksi yang sama sudah dicatat di kedua akun,
                  penggabungan tidak menghapus duplikat tersebut.
                </Text>

                <Pressable
                  disabled={saving}
                  onPress={confirmMerge}
                  style={[styles.button, saving && styles.disabled]}
                >
                  <Text style={styles.buttonText}>
                    {saving ? 'Memproses...' : 'Gabungkan akun'}
                  </Text>
                </Pressable>

                <Pressable
                  disabled={saving}
                  onPress={() => {
                    setMergeSourceId(null);
                    setMergeTargetId(null);
                    setBalanceMode(null);
                    clearMessage();
                  }}
                >
                  <Text style={styles.link}>Batal</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>
                  {editingId !== null ? 'Ubah data dompet' : 'Tambah dompet'}
                </Text>

                <Text style={styles.label}>Nama</Text>
                <TextInput
                  value={name}
                  editable={!saving}
                  onChangeText={(value) => {
                    setName(value);
                    clearMessage();
                  }}
                  maxLength={50}
                  placeholder="Contoh: Mandiri Utama"
                  placeholderTextColor="#A2ADA6"
                  style={styles.input}
                />

                <Text style={styles.label}>Jenis</Text>
                <View style={styles.options}>
                  {accountTypes.map((item) =>
                    option(item.value, item.label, type === item.value, () => {
                      setType(item.value);
                      clearMessage();
                    }),
                  )}
                </View>

                <Text style={styles.label}>Peran akun</Text>

                <View style={styles.options}>
                  {accountRoles.map((item) =>
                    option(
                      `role-${item.value}`,
                      item.label,
                      role === item.value,
                      () => {
                        setRole(item.value);
                        clearMessage();
                      },
                    ),
                  )}
                </View>

                <Text style={styles.caption}>
                  Rekening utama menerima pemasukan. Tabungan menyimpan uang
                  yang disisihkan. Dompet belanja dipakai untuk kebutuhan harian.
                </Text>

                {role === 'main' ? (
                  <Text style={styles.caption}>
                    Hanya satu rekening utama. Menyimpan pilihan ini akan
                    melepaskan peran utama dari akun sebelumnya.
                  </Text>
                ) : null}

                <Text style={styles.label}>Saldo awal (Rp)</Text>
                <TextInput
                  value={openingBalance}
                  editable={!saving}
                  onChangeText={(value) => {
                    setOpeningBalance(value.replace(/[^0-9]/g, ''));
                    clearMessage();
                  }}
                  keyboardType="number-pad"
                  style={styles.input}
                />

                <Text style={styles.caption}>
                  Saldo sebelum transaksi pertama akun ini.
                  Mengubah saldo awal tidak mencatat transfer atau pemasukan.
                </Text>

                <Pressable
                  disabled={saving}
                  onPress={saveAccount}
                  style={[styles.button, saving && styles.disabled]}
                >
                  <Text style={styles.buttonText}>
                    {saving ? 'Menyimpan...' : 'Simpan dompet'}
                  </Text>
                </Pressable>

                {editingId !== null ? (
                  <Pressable
                    disabled={saving}
                    onPress={() => {
                      resetForm();
                      clearMessage();
                    }}
                  >
                    <Text style={styles.link}>Batal mengubah</Text>
                  </Pressable>
                ) : null}
              </View>
            )}

            {message ? (
              <Text
                accessibilityLiveRegion="polite"
                style={[styles.message, hasError && styles.error]}
              >
                {message}
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F6F3' },
  content: { padding: 20, paddingBottom: 40, gap: 18 },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#102A23' },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#102A23' },
  label: { fontSize: 12, color: '#738078' },
  caption: { fontSize: 12, lineHeight: 19, color: '#738078' },
  info: { flex: 1, minWidth: 100, gap: 5 },
  card: {
    padding: 18,
    gap: 14,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  balanceCard: {
    padding: 22,
    gap: 12,
    borderRadius: 22,
    backgroundColor: '#0B7055',
  },
  white: { color: '#E0F2EB', fontSize: 12, lineHeight: 18 },
  total: { color: '#FFFFFF', fontSize: 30, fontWeight: '700' },
  accountBalance: { color: '#0B7055', fontSize: 17, fontWeight: '700' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  link: { color: '#0B7055', fontSize: 12, fontWeight: '600', paddingVertical: 10 },
  input: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#DCE4DF',
    borderRadius: 12,
    color: '#102A23',
    fontSize: 15,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#DCE4DF',
    borderRadius: 16,
  },
  chipActive: { backgroundColor: '#D8F0E9', borderColor: '#0B7055' },
  chipText: { color: '#102A23', fontSize: 12 },
  button: {
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#0B7055',
  },
  buttonText: { color: '#FFFFFF', fontWeight: '600' },
  disabled: { opacity: 0.6 },
  message: { color: '#0B7055', fontSize: 13, lineHeight: 20 },
  error: { color: '#BD3C23', fontSize: 13, lineHeight: 20 },
});