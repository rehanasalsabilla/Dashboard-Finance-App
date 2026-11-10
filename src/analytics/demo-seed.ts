/**
 * Demo data seed for analytics testing.
 * Call seedDemoData(db) explicitly — it is NOT called automatically.
 * Call clearDemoData(db) to remove all demo data.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

// ─── Demo account names (used for identification / cleanup) ───────────────────

const DEMO_ACCOUNT_NAMES = ['BCA Utama', 'BCA Tabungan', 'GoPay'] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function getAccountId(
  db: SQLiteDatabase,
  name: string,
): Promise<number | null> {
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM accounts WHERE name = ?',
    name,
  );
  return row?.id ?? null;
}

async function getCategoryId(
  db: SQLiteDatabase,
  name: string,
  type: 'income' | 'expense',
): Promise<number | null> {
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM categories WHERE name = ? AND type = ?',
    name,
    type,
  );
  return row?.id ?? null;
}

async function insertTransaction(
  db: SQLiteDatabase,
  type: 'income' | 'expense',
  amount: number,
  accountId: number,
  categoryId: number,
  date: string,
  note = '',
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO transactions (type, amount, account_id, category_id, date, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    type,
    amount,
    accountId,
    categoryId,
    date,
    note,
  );
  return result.lastInsertRowId;
}

async function insertTransfer(
  db: SQLiteDatabase,
  fromId: number,
  toId: number,
  amount: number,
  date: string,
  note = '',
  feeAmount = 0,
  feeAccountId?: number,
  feeCategoryId?: number,
): Promise<void> {
  let feeTransactionId: number | null = null;

  if (feeAmount > 0 && feeAccountId !== undefined && feeCategoryId !== undefined) {
    feeTransactionId = await insertTransaction(
      db, 'expense', feeAmount, feeAccountId, feeCategoryId, date, 'Biaya admin transfer',
    );
  }

  await db.runAsync(
    `INSERT INTO transfers (from_account_id, to_account_id, amount, date, note, fee_transaction_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    fromId,
    toId,
    amount,
    date,
    note,
    feeTransactionId,
  );
}

async function setBudget(
  db: SQLiteDatabase,
  categoryId: number,
  month: string,
  amount: number,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO budgets (category_id, month, amount) VALUES (?, ?, ?)`,
    categoryId,
    month,
    amount,
  );
}

// ─── Main seed function ───────────────────────────────────────────────────────

export async function seedDemoData(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    // ── 1. Accounts ────────────────────────────────────────────────────────────
    await db.runAsync(
      `INSERT OR IGNORE INTO accounts (name, type, initial_balance, role)
       VALUES (?, ?, ?, ?)`,
      'BCA Utama', 'bank', 5_000_000, 'main',
    );
    await db.runAsync(
      `INSERT OR IGNORE INTO accounts (name, type, initial_balance, role)
       VALUES (?, ?, ?, ?)`,
      'BCA Tabungan', 'bank', 2_000_000, 'savings',
    );
    await db.runAsync(
      `INSERT OR IGNORE INTO accounts (name, type, initial_balance, role)
       VALUES (?, ?, ?, ?)`,
      'GoPay', 'ewallet', 0, 'spending',
    );

    // ── 2. Get account IDs ─────────────────────────────────────────────────────
    const bcaId = await getAccountId(db, 'BCA Utama');
    const tabunganId = await getAccountId(db, 'BCA Tabungan');
    const gopayId = await getAccountId(db, 'GoPay');

    if (!bcaId || !tabunganId || !gopayId) {
      throw new Error('Demo: gagal mendapatkan ID akun.');
    }

    // ── 3. Get category IDs (from migration-seeded categories) ─────────────────
    const catGaji = await getCategoryId(db, 'Gaji', 'income');
    const catMakan = await getCategoryId(db, 'Makan', 'expense');
    const catTransport = await getCategoryId(db, 'Transportasi', 'expense');
    const catBelanja = await getCategoryId(db, 'Belanja bulanan', 'expense');
    const catTagihan = await getCategoryId(db, 'Tagihan', 'expense');
    const catWifi = await getCategoryId(db, 'WiFi/Kuota', 'expense');
    const catSkincare = await getCategoryId(db, 'Skincare', 'expense');
    const catMain = await getCategoryId(db, 'Main', 'expense');
    const catBiayaAdmin = await getCategoryId(db, 'Biaya admin', 'expense');

    if (
      !catGaji || !catMakan || !catTransport || !catBelanja ||
      !catTagihan || !catWifi || !catSkincare || !catMain || !catBiayaAdmin
    ) {
      throw new Error('Demo: kategori tidak ditemukan. Pastikan migrasi database sudah berjalan.');
    }

    // ── 4. Data per bulan ──────────────────────────────────────────────────────
    // Oktober 2025 — bulan normal
    const oct = { y: 2025, m: 10 };
    await insertTransaction(db, 'income', 8_000_000, bcaId, catGaji, dateStr(oct.y, oct.m, 1), 'Gaji Oktober');
    await insertTransaction(db, 'expense', 1_200_000, bcaId, catMakan, dateStr(oct.y, oct.m, 3));
    await insertTransaction(db, 'expense', 350_000, bcaId, catTransport, dateStr(oct.y, oct.m, 5));
    await insertTransaction(db, 'expense', 180_000, gopayId, catMakan, dateStr(oct.y, oct.m, 8));
    await insertTransaction(db, 'expense', 450_000, bcaId, catTagihan, dateStr(oct.y, oct.m, 10), 'Listrik & air');
    await insertTransaction(db, 'expense', 150_000, gopayId, catWifi, dateStr(oct.y, oct.m, 12), 'Kuota internet');
    await insertTransaction(db, 'expense', 650_000, bcaId, catBelanja, dateStr(oct.y, oct.m, 15));
    await insertTransaction(db, 'expense', 320_000, bcaId, catSkincare, dateStr(oct.y, oct.m, 18));
    await insertTransaction(db, 'expense', 200_000, gopayId, catMain, dateStr(oct.y, oct.m, 20), 'Nonton bioskop');
    await insertTransaction(db, 'expense', 80_000, gopayId, catMakan, dateStr(oct.y, oct.m, 22));
    await insertTransaction(db, 'expense', 250_000, bcaId, catTransport, dateStr(oct.y, oct.m, 25));
    // Top-up GoPay
    await insertTransfer(db, bcaId, gopayId, 500_000, dateStr(oct.y, oct.m, 7), 'Top-up GoPay');
    // Menabung
    await insertTransfer(db, bcaId, tabunganId, 1_000_000, dateStr(oct.y, oct.m, 2), 'Nabung Oktober');

    // November 2025 — pengeluaran agak lebih besar, Skincare melebihi anggaran
    const nov = { y: 2025, m: 11 };
    await insertTransaction(db, 'income', 8_000_000, bcaId, catGaji, dateStr(nov.y, nov.m, 1), 'Gaji November');
    await insertTransaction(db, 'expense', 1_400_000, bcaId, catMakan, dateStr(nov.y, nov.m, 2));
    await insertTransaction(db, 'expense', 400_000, bcaId, catTransport, dateStr(nov.y, nov.m, 4));
    await insertTransaction(db, 'expense', 200_000, gopayId, catMakan, dateStr(nov.y, nov.m, 7));
    await insertTransaction(db, 'expense', 450_000, bcaId, catTagihan, dateStr(nov.y, nov.m, 10), 'Listrik & air');
    await insertTransaction(db, 'expense', 150_000, gopayId, catWifi, dateStr(nov.y, nov.m, 12));
    await insertTransaction(db, 'expense', 700_000, bcaId, catBelanja, dateStr(nov.y, nov.m, 14));
    await insertTransaction(db, 'expense', 650_000, bcaId, catSkincare, dateStr(nov.y, nov.m, 17), 'Serum + sunscreen'); // akan melewati anggaran 500rb
    await insertTransaction(db, 'expense', 350_000, gopayId, catMain, dateStr(nov.y, nov.m, 20));
    await insertTransaction(db, 'expense', 120_000, gopayId, catMakan, dateStr(nov.y, nov.m, 22));
    await insertTransaction(db, 'expense', 300_000, bcaId, catTransport, dateStr(nov.y, nov.m, 26));
    await insertTransfer(db, bcaId, gopayId, 500_000, dateStr(nov.y, nov.m, 6), 'Top-up GoPay');
    await insertTransfer(db, bcaId, tabunganId, 1_000_000, dateStr(nov.y, nov.m, 2), 'Nabung November');
    // Transfer dengan biaya admin
    await insertTransfer(db, bcaId, gopayId, 300_000, dateStr(nov.y, nov.m, 15), 'Top-up dengan biaya', 2_500, bcaId, catBiayaAdmin);

    // Desember 2025 — liburan, pengeluaran Main dan Belanja naik
    const dec = { y: 2025, m: 12 };
    await insertTransaction(db, 'income', 8_000_000, bcaId, catGaji, dateStr(dec.y, dec.m, 1), 'Gaji Desember');
    await insertTransaction(db, 'income', 1_500_000, bcaId, catGaji, dateStr(dec.y, dec.m, 20), 'Bonus akhir tahun'); // pakai Gaji, closest available
    await insertTransaction(db, 'expense', 1_600_000, bcaId, catMakan, dateStr(dec.y, dec.m, 3));
    await insertTransaction(db, 'expense', 500_000, bcaId, catTransport, dateStr(dec.y, dec.m, 5));
    await insertTransaction(db, 'expense', 300_000, gopayId, catMakan, dateStr(dec.y, dec.m, 10));
    await insertTransaction(db, 'expense', 450_000, bcaId, catTagihan, dateStr(dec.y, dec.m, 10));
    await insertTransaction(db, 'expense', 150_000, gopayId, catWifi, dateStr(dec.y, dec.m, 12));
    await insertTransaction(db, 'expense', 1_200_000, bcaId, catBelanja, dateStr(dec.y, dec.m, 15), 'Hadiah natal');
    await insertTransaction(db, 'expense', 400_000, bcaId, catSkincare, dateStr(dec.y, dec.m, 18));
    await insertTransaction(db, 'expense', 800_000, gopayId, catMain, dateStr(dec.y, dec.m, 24), 'Liburan akhir tahun');
    await insertTransaction(db, 'expense', 250_000, gopayId, catMakan, dateStr(dec.y, dec.m, 25));
    await insertTransaction(db, 'expense', 400_000, bcaId, catTransport, dateStr(dec.y, dec.m, 28));
    await insertTransfer(db, bcaId, gopayId, 1_000_000, dateStr(dec.y, dec.m, 1), 'Top-up GoPay desember');
    await insertTransfer(db, bcaId, tabunganId, 500_000, dateStr(dec.y, dec.m, 2), 'Nabung Desember (lebih sedikit)');

    // Januari 2026 — minim data (awal tahun)
    const jan = { y: 2026, m: 1 };
    await insertTransaction(db, 'income', 8_000_000, bcaId, catGaji, dateStr(jan.y, jan.m, 1), 'Gaji Januari');
    await insertTransaction(db, 'expense', 400_000, bcaId, catMakan, dateStr(jan.y, jan.m, 5));
    await insertTransaction(db, 'expense', 150_000, bcaId, catTransport, dateStr(jan.y, jan.m, 7));
    await insertTransfer(db, bcaId, tabunganId, 2_000_000, dateStr(jan.y, jan.m, 3), 'Nabung Januari besar');

    // Februari 2026 — bulan berjalan (data sebagian)
    const feb = { y: 2026, m: 2 };
    await insertTransaction(db, 'income', 8_000_000, bcaId, catGaji, dateStr(feb.y, feb.m, 1), 'Gaji Februari');
    await insertTransaction(db, 'expense', 350_000, bcaId, catMakan, dateStr(feb.y, feb.m, 2));
    await insertTransaction(db, 'expense', 200_000, gopayId, catMakan, dateStr(feb.y, feb.m, 4));
    await insertTransaction(db, 'expense', 150_000, bcaId, catTransport, dateStr(feb.y, feb.m, 5));
    await insertTransaction(db, 'expense', 450_000, bcaId, catTagihan, dateStr(feb.y, feb.m, 8));
    await insertTransfer(db, bcaId, gopayId, 400_000, dateStr(feb.y, feb.m, 3), 'Top-up GoPay februari');
    await insertTransfer(db, bcaId, tabunganId, 1_000_000, dateStr(feb.y, feb.m, 2), 'Nabung Februari');

    // ── 5. Anggaran ────────────────────────────────────────────────────────────
    // Pasang anggaran untuk bulan Oktober, November, Desember, Januari, Februari
    const months = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02'];
    for (const month of months) {
      await setBudget(db, catMakan, month, 1_500_000);
      await setBudget(db, catTransport, month, 500_000);
      await setBudget(db, catBelanja, month, 800_000);
      await setBudget(db, catTagihan, month, 500_000);
      await setBudget(db, catWifi, month, 200_000);
      await setBudget(db, catSkincare, month, 500_000); // November akan melewati ini
      await setBudget(db, catMain, month, 300_000);     // Desember akan melewati ini
    }
  });
}

// ─── Clear demo data ──────────────────────────────────────────────────────────

export async function clearDemoData(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    // Get demo account IDs
    const rows = await db.getAllAsync<{ id: number }>(
      `SELECT id FROM accounts WHERE name IN (${DEMO_ACCOUNT_NAMES.map(() => '?').join(', ')})`,
      ...DEMO_ACCOUNT_NAMES,
    );
    const ids = rows.map((r) => r.id);

    if (ids.length === 0) return;

    const placeholders = ids.map(() => '?').join(', ');

    // Delete transfers involving demo accounts
    await db.runAsync(
      `DELETE FROM transfers
       WHERE from_account_id IN (${placeholders})
          OR to_account_id IN (${placeholders})`,
      ...ids, ...ids,
    );

    // Delete budgets for the demo months (all months that have entries linked to demo data)
    // We delete ALL budgets from these months (safe for demo environment)
    await db.runAsync(
      `DELETE FROM budgets WHERE month IN (
         '2025-10', '2025-11', '2025-12', '2026-01', '2026-02'
       )`,
    );

    // Delete transactions in demo accounts
    await db.runAsync(
      `DELETE FROM transactions WHERE account_id IN (${placeholders})`,
      ...ids,
    );

    // Delete demo accounts
    await db.runAsync(
      `DELETE FROM accounts WHERE id IN (${placeholders})`,
      ...ids,
    );
  });
}
