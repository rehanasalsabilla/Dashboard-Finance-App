import { router, useFocusEffect } from 'expo-router';
import {
  useSQLiteContext,
  type SQLiteDatabase,
} from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
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

type EntryType = 'expense' | 'income' | 'transfer';

type Account = {
  id: number;
  name: string;
};

type Category = {
  id: number;
  name: string;
  type: 'expense' | 'income';
};

const entryTypes: { value: EntryType; label: string }[] = [
  { value: 'expense', label: 'Pengeluaran' },
  { value: 'income', label: 'Pemasukan' },
  { value: 'transfer', label: 'Transfer' },
];

function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function today() {
  return dateKey(new Date());
}

function yesterday() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return dateKey(date);
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);

  return (
    year >= 1900 &&
    year <= 9999 &&
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

function parseAmount(value: string) {
  if (!/^\d+$/.test(value)) return null;

  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount : null;
}

function money(value: number) {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

export default function AddTransactionScreen() {
  const db = useSQLiteContext();
  const busyRef = useRef(false);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);

  const [type, setType] = useState<EntryType>('expense');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [destinationId, setDestinationId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [fee, setFee] = useState('0');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [hasError, setHasError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function loadOptions() {
        setLoading(true);
        setLoadError('');

        try {
          const accountRows = await db.getAllAsync<Account>(
            'SELECT id, name FROM accounts ORDER BY id',
          );

          const categoryRows = await db.getAllAsync<Category>(
            'SELECT id, name, type FROM categories ORDER BY id',
          );

          if (!active) return;

          setAccounts(accountRows);
          setCategories(categoryRows);

          setAccountId((current) =>
            accountRows.some((account) => account.id === current)
              ? current
              : accountRows[0]?.id ?? null,
          );

          setDestinationId((current) =>
            accountRows.some((account) => account.id === current)
              ? current
              : null,
          );

          setCategoryId((current) =>
            categoryRows.some((category) => category.id === current)
              ? current
              : null,
          );
        } catch (error) {
          console.error('Gagal membaca pilihan form:', error);

          if (active) {
            setLoadError('Pilihan akun dan kategori gagal dimuat.');
          }
        } finally {
          if (active) setLoading(false);
        }
      }

      void loadOptions();

      return () => {
        active = false;
      };
    }, [db, reload]),
  );

  function clearMessage() {
    setMessage('');
    setHasError(false);
  }

  function showError(text: string) {
    setHasError(true);
    setMessage(text);
  }

  function changeType(value: EntryType) {
    setType(value);
    setCategoryId(null);
    clearMessage();
  }

  function resetForm() {
    setAmount('');
    setCategoryId(null);
    setDestinationId(null);
    setFee('0');
    setDate(today());
    setNote('');
    clearMessage();
  }

  async function writeAtomically(
    work: (tx: SQLiteDatabase) => Promise<void>,
  ) {
    if (Platform.OS === 'web') {
      await db.withTransactionAsync(async () => {
        await work(db);
      });
    } else {
      await db.withExclusiveTransactionAsync(async (tx) => {
        await work(tx);
      });
    }
  }

  async function saveEntry() {
    if (busyRef.current) return;

    const nominal = parseAmount(amount);
    const adminFee = parseAmount(fee || '0');

    if (nominal === null || nominal <= 0) {
      showError('Masukkan nominal rupiah yang valid, lebih besar dari 0.');
      return;
    }

    if (!validDate(date)) {
      showError('Tanggal harus valid dengan format YYYY-MM-DD.');
      return;
    }

    // Pencatatan aktual. Tagihan mendatang dibuat pada fitur terpisah.
    if (date > today()) {
      showError(
        'Gunakan tanggal hari ini atau sebelumnya untuk mencatat transaksi yang sudah terjadi.',
      );
      return;
    }

    const source = accounts.find((account) => account.id === accountId);
    const destination = accounts.find(
      (account) => account.id === destinationId,
    );
    const category = categories.find(
      (item) => item.id === categoryId && item.type === type,
    );

    if (!source) {
      showError('Pilih akun yang digunakan.');
      return;
    }

    if (type === 'transfer') {
      if (!destination || source.id === destination.id) {
        showError('Pilih akun tujuan yang berbeda dari akun asal.');
        return;
      }

      if (
        adminFee === null ||
        !Number.isSafeInteger(nominal + adminFee)
      ) {
        showError('Biaya admin atau total nominal tidak valid.');
        return;
      }
    } else if (!category) {
      showError('Pilih kategori transaksi.');
      return;
    }

    busyRef.current = true;
    setSaving(true);
    clearMessage();

    try {
      if (type === 'transfer' && destination && adminFee !== null) {
        await writeAtomically(async (tx) => {
          let feeId: number | null = null;

          if (adminFee > 0) {
            const feeCategory = await tx.getFirstAsync<{ id: number }>(
              `SELECT id FROM categories
               WHERE name = ? AND type = 'expense'`,
              'Biaya admin',
            );

            if (!feeCategory) {
              throw new Error('Kategori Biaya admin tidak ditemukan.');
            }

            const result = await tx.runAsync(
              `INSERT INTO transactions
               (type, amount, account_id, category_id, date, note)
               VALUES ('expense', ?, ?, ?, ?, ?)`,
              adminFee,
              source.id,
              feeCategory.id,
              date,
              `Biaya transfer ${source.name} ke ${destination.name}`,
            );

            feeId = result.lastInsertRowId;
          }

          await tx.runAsync(
            `INSERT INTO transfers
             (
               from_account_id,
               to_account_id,
               amount,
               date,
               note,
               fee_transaction_id
             )
             VALUES (?, ?, ?, ?, ?, ?)`,
            source.id,
            destination.id,
            nominal,
            date,
            note.trim(),
            feeId,
          );
        });

        setMessage(
          `Transfer ${money(nominal)} dari ${source.name} ke ${
            destination.name
          } tersimpan.${
            adminFee > 0 ? ` Biaya admin ${money(adminFee)}.` : ''
          }`,
        );
      } else if (type !== 'transfer' && category) {
        await db.runAsync(
          `INSERT INTO transactions
           (type, amount, account_id, category_id, date, note)
           VALUES (?, ?, ?, ?, ?, ?)`,
          type,
          nominal,
          source.id,
          category.id,
          date,
          note.trim(),
        );

        setMessage(
          `${type === 'income' ? 'Pemasukan' : 'Pengeluaran'} ${money(
            nominal,
          )} pada ${source.name} berhasil disimpan.`,
        );
      }

      // Akun, kategori, dan tanggal dipertahankan
      // untuk memudahkan pencatatan berikutnya.
      setAmount('');
      setNote('');
      setFee('0');
    } catch (error) {
      console.error('Gagal menyimpan catatan:', error);
      showError('Catatan gagal disimpan. Coba kembali.');
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  function option(
    key: string,
    label: string,
    selected: boolean,
    onPress: () => void,
  ) {
    return (
      <Pressable
        key={key}
        disabled={saving}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected, disabled: saving }}
        style={[styles.chip, selected && styles.chipActive]}
      >
        <Text style={styles.chipText}>{label}</Text>
      </Pressable>
    );
  }

  const nominalPreview = parseAmount(amount);
  const feePreview = parseAmount(fee || '0');
  const availableCategories = categories.filter(
    (category) => category.type === type,
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.row}>
            <Text style={styles.title}>Tambah catatan</Text>
            <Pressable disabled={saving} onPress={resetForm}>
              <Text style={styles.link}>Reset form</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.state}>
              <ActivityIndicator color="#0B7055" />
              <Text style={styles.caption}>Memuat pilihan...</Text>
            </View>
          ) : loadError ? (
            <View style={styles.card}>
              <Text style={styles.error}>{loadError}</Text>
              <Pressable onPress={() => setReload((value) => value + 1)}>
                <Text style={styles.link}>Coba lagi</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.switcher}>
                {entryTypes.map((item) => (
                  <Pressable
                    key={item.value}
                    disabled={saving}
                    onPress={() => changeType(item.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: type === item.value }}
                    style={[
                      styles.switchButton,
                      type === item.value && styles.switchActive,
                    ]}
                  >
                    <Text style={styles.switchText}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>

              <View>
                <Text style={styles.label}>
                  {type === 'transfer' ? 'Nominal transfer (Rp)' : 'Nominal (Rp)'}
                </Text>
                <TextInput
                  value={amount}
                  editable={!saving}
                  onChangeText={(value) => {
                    setAmount(value.replace(/[^0-9]/g, ''));
                    clearMessage();
                  }}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor="#A2ADA6"
                  accessibilityLabel="Nominal dalam rupiah"
                  style={styles.amountInput}
                />
                <Text style={styles.caption}>
                  {nominalPreview !== null
                    ? money(nominalPreview)
                    : 'Masukkan angka tanpa titik atau koma'}
                </Text>
              </View>

              <View style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.sectionTitle}>
                    {type === 'transfer' ? 'Akun asal' : 'Akun'}
                  </Text>
                  <Pressable
                    disabled={saving}
                    onPress={() => router.push('/dompet')}
                  >
                    <Text style={styles.link}>Kelola / tambah</Text>
                  </Pressable>
                </View>

                <View style={styles.options}>
                  {accounts.map((account) =>
                    option(
                      `account-${account.id}`,
                      account.name,
                      accountId === account.id,
                      () => {
                        setAccountId(account.id);
                        if (destinationId === account.id) {
                          setDestinationId(null);
                        }
                        clearMessage();
                      },
                    ),
                  )}
                </View>

                <Text style={styles.caption}>
                  {type === 'income'
                    ? 'Pilih tempat uang diterima.'
                    : type === 'expense'
                      ? 'Pilih tempat uang digunakan untuk membayar.'
                      : 'Pilih rekening atau dompet pengirim.'}
                </Text>

                {accounts.length === 0 ? (
                  <Text style={styles.error}>
                    Tambahkan dompet terlebih dahulu.
                  </Text>
                ) : null}
              </View>

              {type === 'transfer' ? (
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Akun tujuan</Text>

                  <View style={styles.options}>
                    {accounts
                      .filter((account) => account.id !== accountId)
                      .map((account) =>
                        option(
                          `destination-${account.id}`,
                          account.name,
                          destinationId === account.id,
                          () => {
                            setDestinationId(account.id);
                            clearMessage();
                          },
                        ),
                      )}
                  </View>

                  {accounts.length < 2 ? (
                    <Text style={styles.error}>
                      Transfer membutuhkan minimal dua akun.
                    </Text>
                  ) : null}

                  <Text style={styles.label}>
                    Biaya admin dari akun asal (Rp)
                  </Text>
                  <TextInput
                    value={fee}
                    editable={!saving}
                    onChangeText={(value) => {
                      setFee(value.replace(/[^0-9]/g, ''));
                      clearMessage();
                    }}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor="#A2ADA6"
                    style={styles.input}
                  />

                  {nominalPreview !== null &&
                  feePreview !== null &&
                  Number.isSafeInteger(nominalPreview + feePreview) ? (
                    <View style={styles.preview}>
                      <Text style={styles.caption}>
                        Akun asal berkurang:{' '}
                        {money(nominalPreview + feePreview)}
                      </Text>
                      <Text style={styles.caption}>
                        Akun tujuan bertambah: {money(nominalPreview)}
                      </Text>
                      <Text style={styles.caption}>
                        Pengeluaran biaya admin: {money(feePreview)}
                      </Text>
                    </View>
                  ) : null}

                  <Text style={styles.caption}>
                    Nominal transfer tidak menjadi pemasukan atau
                    pengeluaran. Biaya admin dicatat sebagai pengeluaran.
                  </Text>
                </View>
              ) : (
                <View style={styles.card}>
                  <View style={styles.row}>
                    <Text style={styles.sectionTitle}>Kategori</Text>

                    <Pressable
                      disabled={saving}
                      onPress={() =>
                        router.navigate({
                          pathname: '/transaksi',
                          params: {
                            month: '',
                            accountId: '',
                            categoryId: '',
                            kind: 'all',
                          },
                        })
                      }
                    >
                      <Text style={styles.link}>Kelola kategori →</Text>
                    </Pressable>
                  </View>

                  <View style={styles.options}>
                    {availableCategories.map((category) =>
                      option(
                        `category-${category.id}`,
                        category.name,
                        categoryId === category.id,
                        () => {
                          setCategoryId(category.id);
                          clearMessage();
                        },
                      ),
                    )}
                  </View>

                  {availableCategories.length === 0 ? (
                    <Text style={styles.caption}>
                      Belum ada kategori untuk jenis ini.
                      Tambahkan melalui Kelola kategori.
                    </Text>
                  ) : null}
                </View>
              )}

              <View style={styles.card}>
                <Text style={styles.label}>Tanggal</Text>

                <View style={styles.options}>
                  {option('today', 'Hari ini', date === today(), () => {
                    setDate(today());
                    clearMessage();
                  })}
                  {option('yesterday', 'Kemarin', date === yesterday(), () => {
                    setDate(yesterday());
                    clearMessage();
                  })}
                </View>

                <TextInput
                  value={date}
                  editable={!saving}
                  onChangeText={(value) => {
                    setDate(value);
                    clearMessage();
                  }}
                  maxLength={10}
                  autoCorrect={false}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#A2ADA6"
                  accessibilityLabel="Tanggal transaksi"
                  style={styles.input}
                />

                <Text style={styles.caption}>
                  Format tahun-bulan-hari. Catat transaksi yang sudah
                  terjadi, bukan rencana pembayaran mendatang.
                </Text>

                <Text style={styles.label}>Catatan (opsional)</Text>
                <TextInput
                  value={note}
                  editable={!saving}
                  onChangeText={(value) => {
                    setNote(value);
                    clearMessage();
                  }}
                  maxLength={200}
                  multiline
                  placeholder={
                    type === 'transfer'
                      ? 'Contoh: Top-up GoPay'
                      : 'Contoh: Makan siang'
                  }
                  placeholderTextColor="#A2ADA6"
                  style={[styles.input, styles.noteInput]}
                />
              </View>

              {message ? (
                <View style={styles.card}>
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[styles.message, hasError && styles.error]}
                  >
                    {message}
                  </Text>

                  {!hasError ? (
                    <Pressable
                      onPress={() =>
                        router.navigate({
                          pathname: '/transaksi',
                          params: {
                            month: date.slice(0, 7),
                            accountId: '',
                            categoryId: '',
                            kind: 'all',
                          },
                        })
                      }
                    >
                      <Text style={styles.link}>Lihat transaksi →</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              <Pressable
                onPress={saveEntry}
                disabled={saving || accounts.length === 0}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.button,
                  (pressed || saving || accounts.length === 0) &&
                    styles.disabled,
                ]}
              >
                <Text style={styles.buttonText}>
                  {saving
                    ? 'Menyimpan...'
                    : type === 'transfer'
                      ? 'Simpan transfer'
                      : 'Simpan transaksi'}
                </Text>
              </Pressable>

              <Text style={styles.footer}>
                Pencatatan manual, bukan pembayaran atau pengiriman uang.
                Data disimpan di perangkat ini.
              </Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F3F6F3',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 20,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#102A23',
  },
  link: {
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#0B7055',
  },
  switcher: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    backgroundColor: '#E2E9E4',
  },
  switchButton: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 10,
  },
  switchActive: {
    backgroundColor: '#FFFFFF',
  },
  switchText: {
    fontSize: 12,
    color: '#102A23',
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: '#738078',
  },
  amountInput: {
    paddingVertical: 10,
    fontSize: 34,
    fontWeight: '700',
    color: '#102A23',
  },
  caption: {
    fontSize: 11,
    lineHeight: 18,
    color: '#738078',
  },
  card: {
    padding: 16,
    gap: 14,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#102A23',
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#DCE4DF',
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  chipActive: {
    borderColor: '#0B7055',
    backgroundColor: '#D8F0E9',
  },
  chipText: {
    fontSize: 12,
    color: '#102A23',
  },
  input: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#DCE4DF',
    borderRadius: 12,
    fontSize: 14,
    color: '#102A23',
  },
  noteInput: {
    minHeight: 85,
    textAlignVertical: 'top',
  },
  preview: {
    padding: 12,
    gap: 6,
    borderRadius: 12,
    backgroundColor: '#F3F6F3',
  },
  message: {
    fontSize: 13,
    lineHeight: 20,
    color: '#0B7055',
  },
  error: {
    fontSize: 13,
    lineHeight: 20,
    color: '#BD3C23',
  },
  button: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#0B7055',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  disabled: {
    opacity: 0.6,
  },
  footer: {
    fontSize: 11,
    lineHeight: 18,
    textAlign: 'center',
    color: '#738078',
  },
  state: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 12,
  },
});