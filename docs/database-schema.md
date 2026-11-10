# Database Schema — Finance Analytics

Dokumentasi lengkap skema database SQLite untuk aplikasi Finance Analytics.  
Versi skema saat ini: **V5**.

---

## Diagram Relasi (ERD)

```
accounts ──────────────────────────────────────────────────────────────┐
   │ id (PK)                                                            │
   │                                                                    │
   │ account_id (FK)              from_account_id (FK)                  │
transactions ──────────────────  transfers ──── to_account_id (FK) ────┘
   │ category_id (FK)                │ fee_transaction_id (FK, nullable)
   │                                 │       │
categories                     transactions  (expense biaya admin)
   │ id (PK)
   │
budgets ── category_id (FK)
```

---

## Data Dictionary

### Tabel `accounts`

Menyimpan dompet / rekening pengguna.

| Nama | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Identifier unik akun |
| `name` | TEXT | NOT NULL | Nama akun (mis. "BCA", "GoPay", "Cash") |
| `type` | TEXT | NOT NULL, CHECK IN ('cash','bank','ewallet') | Jenis akun: uang tunai, bank, atau dompet digital |
| `initial_balance` | INTEGER | NOT NULL DEFAULT 0 | Saldo awal dalam Rupiah (bukan income, hanya titik awal) |
| `role` | TEXT | NOT NULL DEFAULT 'unassigned', CHECK IN ('unassigned','main','savings','spending') | Peran akun: rekening utama (maks 1), tabungan, pengeluaran, atau belum ditetapkan |

> **Catatan:** Hanya boleh ada **satu akun** dengan `role = 'main'`, dijaga oleh partial unique index `accounts_single_main_idx`.

---

### Tabel `categories`

Kategori transaksi income maupun expense.

| Nama | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Identifier unik kategori |
| `name` | TEXT | NOT NULL | Nama kategori (mis. "Makan", "Gaji", "Transport") |
| `type` | TEXT | NOT NULL, CHECK IN ('income','expense') | Jenis: pemasukan atau pengeluaran |

> **Constraint unik:** `UNIQUE(name, type)` — nama kategori harus unik dalam tipe yang sama (boleh ada "Lain-lain" income dan "Lain-lain" expense secara bersamaan).

---

### Tabel `transactions`

Mencatat setiap transaksi income dan expense.

| Nama | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Identifier unik transaksi |
| `type` | TEXT | NOT NULL, CHECK IN ('income','expense') | Jenis transaksi |
| `amount` | INTEGER | NOT NULL, CHECK > 0 | Nominal dalam Rupiah (selalu positif) |
| `account_id` | INTEGER | NOT NULL, FK → accounts(id) ON DELETE RESTRICT | Akun yang terkait |
| `category_id` | INTEGER | NOT NULL, FK → categories(id) ON DELETE RESTRICT | Kategori transaksi |
| `date` | TEXT | NOT NULL | Tanggal transaksi format `YYYY-MM-DD` |
| `note` | TEXT | NULLABLE | Catatan opsional pengguna |
| `created_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | Timestamp pencatatan (ISO 8601 UTC) |

> **Transfer ≠ transaksi.** Perpindahan uang antar akun dicatat di tabel `transfers`, bukan di sini, kecuali biaya admin yang memang merupakan expense nyata.

---

### Tabel `transfers`

Mencatat perpindahan uang antar akun.

| Nama | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Identifier unik transfer |
| `from_account_id` | INTEGER | NOT NULL, FK → accounts(id) ON DELETE RESTRICT | Akun pengirim |
| `to_account_id` | INTEGER | NOT NULL, FK → accounts(id) ON DELETE RESTRICT | Akun penerima |
| `amount` | INTEGER | NOT NULL, CHECK > 0 | Nominal transfer dalam Rupiah (positif) |
| `date` | TEXT | NOT NULL | Tanggal transfer format `YYYY-MM-DD` |
| `note` | TEXT | NULLABLE | Catatan opsional pengguna |
| `fee_transaction_id` | INTEGER | NULLABLE, FK → transactions(id) ON DELETE SET NULL | ID transaksi expense biaya admin; NULL jika tidak ada biaya |
| `created_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | Timestamp pencatatan |

> **Constraint:** `CHECK(from_account_id != to_account_id)` — transfer ke diri sendiri tidak diizinkan.

---

### Tabel `budgets`

Anggaran bulanan per kategori expense.

| Nama | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Identifier unik budget |
| `category_id` | INTEGER | NOT NULL, FK → categories(id) ON DELETE RESTRICT | Kategori expense yang dianggarkan |
| `month` | TEXT | NOT NULL | Bulan anggaran format `YYYY-MM` |
| `amount` | INTEGER | NOT NULL, CHECK > 0 | Nominal anggaran dalam Rupiah |

> **Constraint unik:** `UNIQUE(category_id, month)` — satu kategori hanya punya satu anggaran per bulan.

---

## Relasi dan Integritas Referensial

| Relasi | Jenis | Kebijakan Hapus |
|---|---|---|
| `transactions.account_id` → `accounts.id` | Many-to-One | **RESTRICT** — akun tidak bisa dihapus selama ada transaksi |
| `transactions.category_id` → `categories.id` | Many-to-One | **RESTRICT** — kategori tidak bisa dihapus selama ada transaksi |
| `transfers.from_account_id` → `accounts.id` | Many-to-One | **RESTRICT** |
| `transfers.to_account_id` → `accounts.id` | Many-to-One | **RESTRICT** |
| `transfers.fee_transaction_id` → `transactions.id` | Many-to-One (nullable) | **SET NULL** — jika transaksi biaya dihapus, link di transfer menjadi NULL |
| `budgets.category_id` → `categories.id` | Many-to-One | **RESTRICT** |

> SQLite memerlukan `PRAGMA foreign_keys = ON` yang diaktifkan saat koneksi dibuka.

---

## Indeks

| Nama Indeks | Tabel | Kolom | Jenis | Tujuan |
|---|---|---|---|---|
| `transactions_date_idx` | transactions | `date` | B-Tree | Filter dan sort berdasarkan tanggal |
| `transactions_account_idx` | transactions | `account_id` | B-Tree | Query saldo per akun |
| `transfers_date_idx` | transfers | `date` | B-Tree | Filter transfer berdasarkan tanggal |
| `transfers_from_account_idx` | transfers | `from_account_id` | B-Tree | Hitung transfer keluar per akun |
| `transfers_to_account_idx` | transfers | `to_account_id` | B-Tree | Hitung transfer masuk per akun |
| `accounts_single_main_idx` | accounts | `role` WHERE `role = 'main'` | Partial Unique | Memastikan hanya satu akun berperan sebagai `main` |

---

## Riwayat Versi Migrasi

| Versi | Perubahan |
|---|---|
| **V1** | Skema awal: tabel `accounts`, `categories`, `transactions` dengan kolom dasar |
| **V2** | Tambah tabel `transfers` dengan `from_account_id`, `to_account_id`, `amount`, `date`, `note` |
| **V3** | Tambah tabel `budgets`; tambah `fee_transaction_id` di tabel `transfers` |
| **V4** | Tambah kolom `role` di tabel `accounts`; buat partial unique index `accounts_single_main_idx` |
| **V5** | Tambah indeks performa: `transfers_date_idx`, `transfers_from_account_idx`, `transfers_to_account_idx` |

---

## Catatan Teknis Penting

### Penyimpanan Amount sebagai INTEGER
Semua nilai uang disimpan sebagai **INTEGER Rupiah** (bukan REAL/DECIMAL).

- **Alasan:** SQLite REAL menggunakan floating-point IEEE 754 yang dapat menyebabkan kesalahan pembulatan (mis. 15000.0000000001). Karena Rupiah tidak memiliki subdivisi sen yang signifikan dalam penggunaan sehari-hari, INTEGER adalah pilihan aman.
- **Konsekuensi:** Kalkulasi persentase dilakukan dengan `ROUND(x * 100.0 / total, 1)` untuk memastikan pembagian floating-point.

### Penyimpanan Date sebagai TEXT
Semua tanggal disimpan sebagai **TEXT format `YYYY-MM-DD`**.

- **Alasan:** SQLite tidak memiliki tipe DATE native. Format ISO 8601 (`YYYY-MM-DD`) memungkinkan perbandingan dan pengurutan yang benar menggunakan operasi string biasa, tanpa risiko konversi timezone yang bisa menggeser tanggal.
- **Konsekuensi:** Semua query harus konsisten menggunakan format ini. `created_at` menggunakan format penuh ISO 8601 UTC.
