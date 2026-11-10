import type { SQLiteDatabase } from 'expo-sqlite';

export async function initializeDatabase(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  const result = await db.getFirstAsync<{
    user_version: number;
  }>('PRAGMA user_version');

  const version = result?.user_version ?? 0;

  if (version > 5) {
    throw new Error(
      'Versi database lebih baru daripada yang didukung aplikasi.',
    );
  }

  // Versi 1: struktur dasar.
  // Dijalankan hanya jika database belum pernah dibuat.
  if (version < 1) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          type TEXT NOT NULL
            CHECK (type IN ('cash', 'bank', 'ewallet')),
          initial_balance INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          type TEXT NOT NULL
            CHECK (type IN ('income', 'expense')),
          UNIQUE (name, type)
        );

        CREATE TABLE transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL
            CHECK (type IN ('income', 'expense')),
          amount INTEGER NOT NULL
            CHECK (amount > 0),
          account_id INTEGER NOT NULL,
          category_id INTEGER NOT NULL,
          date TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

          FOREIGN KEY (account_id)
            REFERENCES accounts(id) ON DELETE RESTRICT,

          FOREIGN KEY (category_id)
            REFERENCES categories(id) ON DELETE RESTRICT
        );

        CREATE INDEX transactions_date_idx
          ON transactions(date);
      `);

      await db.runAsync(
        `INSERT INTO accounts (name, type, initial_balance)
         VALUES (?, ?, ?)`,
        'Dompet tunai',
        'cash',
        0,
      );

      const categories = [
        { name: 'Makanan', type: 'expense' },
        { name: 'Transportasi', type: 'expense' },
        { name: 'Belanja', type: 'expense' },
        { name: 'Tagihan', type: 'expense' },
        { name: 'Hiburan', type: 'expense' },
        { name: 'Lainnya', type: 'expense' },
        { name: 'Gaji', type: 'income' },
        { name: 'Honor proyek', type: 'income' },
        { name: 'Hadiah', type: 'income' },
        { name: 'Lainnya', type: 'income' },
      ];

      for (const category of categories) {
        await db.runAsync(
          `INSERT INTO categories (name, type)
           VALUES (?, ?)`,
          category.name,
          category.type,
        );
      }

      await db.execAsync('PRAGMA user_version = 1');
    });
  }

  // Versi 2: dukungan transfer antar akun.
  // Data pada tabel lama tetap dipertahankan.
  if (version < 2) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE transfers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,

          from_account_id INTEGER NOT NULL,
          to_account_id INTEGER NOT NULL,

          amount INTEGER NOT NULL
            CHECK (amount > 0),

          date TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '',

          fee_transaction_id INTEGER UNIQUE,

          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

          CHECK (from_account_id != to_account_id),

          FOREIGN KEY (from_account_id)
            REFERENCES accounts(id) ON DELETE RESTRICT,

          FOREIGN KEY (to_account_id)
            REFERENCES accounts(id) ON DELETE RESTRICT,

          FOREIGN KEY (fee_transaction_id)
            REFERENCES transactions(id) ON DELETE RESTRICT
        );

        CREATE INDEX transfers_date_idx
          ON transfers(date);

        CREATE INDEX transfers_from_account_idx
          ON transfers(from_account_id);

        CREATE INDEX transfers_to_account_idx
          ON transfers(to_account_id);

        CREATE INDEX transactions_account_idx
          ON transactions(account_id);
      `);

      await db.runAsync(
        `INSERT OR IGNORE INTO categories (name, type)
         VALUES (?, ?)`,
        'Biaya admin',
        'expense',
      );

      await db.execAsync('PRAGMA user_version = 2');
    });
  }

    // Versi 3: anggaran bulanan per kategori.
  if (version < 3) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE budgets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category_id INTEGER NOT NULL,
          month TEXT NOT NULL,
          amount INTEGER NOT NULL CHECK (amount > 0),

          UNIQUE (category_id, month),

          FOREIGN KEY (category_id)
            REFERENCES categories(id) ON DELETE RESTRICT
        );

        PRAGMA user_version = 3;
      `);
    });
  }

    // Versi 4: peran akun untuk Beranda.
  if (version < 4) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        ALTER TABLE accounts
        ADD COLUMN role TEXT NOT NULL DEFAULT 'unassigned'
          CHECK (
            role IN ('unassigned', 'main', 'savings', 'spending')
          );

        CREATE UNIQUE INDEX accounts_single_main_idx
          ON accounts(role)
          WHERE role = 'main';

        PRAGMA user_version = 4;
      `);
    });
  }

    // Versi 5: menyesuaikan kategori.
  // Nama diperbarui tanpa mengubah ID, sehingga transaksi
  // dan anggaran lama tetap terhubung.
  if (version < 5) {
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE categories
         SET name = ?
         WHERE name = ? AND type = 'expense'`,
        'Makan',
        'Makanan',
      );

      await db.runAsync(
        `UPDATE categories
         SET name = ?
         WHERE name = ? AND type = 'expense'`,
        'Belanja bulanan',
        'Belanja',
      );

      await db.runAsync(
        `UPDATE categories
         SET name = ?
         WHERE name = ? AND type = 'expense'`,
        'Main',
        'Hiburan',
      );

      const additionalCategories = [
        { name: 'Skincare', type: 'expense' },
        { name: 'WiFi/Kuota', type: 'expense' },
      ];

      for (const category of additionalCategories) {
        await db.runAsync(
          `INSERT OR IGNORE INTO categories (name, type)
           VALUES (?, ?)`,
          category.name,
          category.type,
        );
      }

      await db.execAsync('PRAGMA user_version = 5');
    });
  }

  const currentVersion = await db.getFirstAsync<{
    user_version: number;
  }>('PRAGMA user_version');

  console.log(
    'Database SQLite siap. Versi:',
    currentVersion?.user_version,
  );

  const accounts = await db.getAllAsync<{
    id: number;
    name: string;
    initial_balance: number;
    role: string;
  }>(
    `SELECT id, name, initial_balance, role
     FROM accounts
     ORDER BY id`,
  );

  console.log('Daftar akun:', accounts);
}