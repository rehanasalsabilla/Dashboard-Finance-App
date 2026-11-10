# SQL Examples — Finance Analytics

Kumpulan query SQL analitik yang digunakan oleh aplikasi Finance Analytics.  
Semua query berjalan di SQLite lokal via `expo-sqlite`. Parameter menggunakan notasi `:nama_parameter`.

---

## Query 1 — Saldo Akun sampai Tanggal Tertentu

```sql
-- Menghitung saldo aktual setiap akun pada tanggal cutoff tertentu.
-- Formula: saldo_awal + net_transaksi + transfer_masuk - transfer_keluar
SELECT
  a.id,
  a.name,
  a.initial_balance
  + COALESCE((
      SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)
      FROM transactions AS t
      WHERE t.account_id = a.id AND t.date <= :cutoff_date
    ), 0)
  + COALESCE((
      SELECT SUM(tr.amount) FROM transfers AS tr
      WHERE tr.to_account_id = a.id AND tr.date <= :cutoff_date
    ), 0)
  - COALESCE((
      SELECT SUM(tr.amount) FROM transfers AS tr
      WHERE tr.from_account_id = a.id AND tr.date <= :cutoff_date
    ), 0)
  AS balance
FROM accounts AS a
ORDER BY a.id;
```

**Penjelasan:**  
Query ini menghitung saldo "point-in-time" setiap akun hingga tanggal `cutoff_date`. Karena SQLite tidak menyimpan saldo running, saldo harus dihitung ulang setiap kali dari tiga komponen:
1. `initial_balance` — saldo awal historis akun (bukan income).
2. Net transaksi — income dijumlahkan positif, expense dikurangi.
3. Transfer masuk dikurangi transfer keluar.

`COALESCE(..., 0)` digunakan untuk menangani akun yang belum punya transaksi/transfer sama sekali (subquery NULL → 0).

---

## Query 2 — Ringkasan Bulanan: Income vs Expense

```sql
-- Meringkas total pemasukan dan pengeluaran dalam suatu periode.
-- Transfer antar akun tidak termasuk.
SELECT
  COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0)  AS income,
  COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
FROM transactions
WHERE date >= :start_date AND date < :end_date
  AND (:account_id IS NULL OR account_id = :account_id);
```

**Penjelasan:**  
Satu query dengan conditional aggregation untuk menghasilkan dua kolom sekaligus (menghindari dua query terpisah). Kondisi `:account_id IS NULL` memungkinkan query bekerja untuk semua akun (tanpa filter) maupun satu akun tertentu.

---

## Query 3 — Pengeluaran per Kategori dengan Persentase

```sql
-- Menghitung total dan persentase pengeluaran per kategori.
-- Diurutkan dari kategori dengan pengeluaran terbesar.
SELECT
  c.id,
  c.name,
  SUM(t.amount) AS total,
  ROUND(
    SUM(t.amount) * 100.0 /
    (
      SELECT SUM(amount)
      FROM transactions
      WHERE type = 'expense'
        AND date >= :start AND date < :end
        AND (:account_id IS NULL OR account_id = :account_id)
    ),
    1
  ) AS pct
FROM transactions AS t
JOIN categories AS c ON c.id = t.category_id
WHERE t.type = 'expense'
  AND t.date >= :start AND t.date < :end
  AND (:account_id IS NULL OR t.account_id = :account_id)
GROUP BY c.id, c.name
ORDER BY total DESC;
```

**Penjelasan:**  
Subquery di dalam `ROUND()` menghitung total pengeluaran seluruh kategori sebagai penyebut persentase. Perkalian dengan `100.0` (bukan `100`) memaksa SQLite menggunakan aritmetika floating-point, bukan integer division. `ROUND(..., 1)` membulatkan ke satu desimal.

---

## Query 4 — Anggaran vs Aktual per Kategori

```sql
-- Membandingkan anggaran yang ditetapkan dengan realisasi pengeluaran bulan tertentu.
-- Hanya menampilkan kategori yang memiliki budget di bulan tersebut.
SELECT
  b.id,
  c.name,
  b.amount AS budgeted,
  COALESCE((
    SELECT SUM(t.amount)
    FROM transactions AS t
    WHERE t.category_id = b.category_id
      AND t.type = 'expense'
      AND t.date >= :start AND t.date < :end
  ), 0) AS spent
FROM budgets AS b
JOIN categories AS c ON c.id = b.category_id
WHERE b.month = :month
ORDER BY c.name;
```

**Penjelasan:**  
Realisasi (`spent`) dihitung via correlated subquery per baris budget. `COALESCE(..., 0)` menangani kategori yang dianggarkan tapi belum ada pengeluaran sama sekali. Perhatikan bahwa `spent` tidak difilter per akun — anggaran bersifat global untuk semua akun.

Dari hasil query ini, aplikasi menghitung:
- `sisa = budgeted - spent` (bisa negatif jika over-budget)
- `pct_used = spent / budgeted * 100`

---

## Query 5 — Transfer Masuk Eksternal ke Kelompok Tabungan

```sql
-- Menghitung total dana yang masuk ke akun savings dari akun non-savings.
-- Transfer antar sesama akun savings tidak dihitung (bukan "setoran" dari luar).
SELECT COALESCE(SUM(tr.amount), 0) AS transfer_in_external
FROM transfers AS tr
JOIN accounts AS origin ON origin.id = tr.from_account_id
JOIN accounts AS dest   ON dest.id   = tr.to_account_id
WHERE dest.role   = 'savings'
  AND origin.role != 'savings'
  AND tr.date >= :start AND tr.date < :end;
```

**Penjelasan:**  
Query ini secara eksplisit mengecek peran kedua akun yang terlibat: tujuan harus `savings`, asal tidak boleh `savings`. Ini memastikan transfer tabungan-ke-tabungan (mis. memindah dari satu rekening tabungan ke rekening tabungan lain) tidak dihitung ganda sebagai setoran.

Query serupa dengan kondisi terbalik (`origin.role = 'savings' AND dest.role != 'savings'`) digunakan untuk **transfer keluar eksternal**.

---

## Query 6 — Tren Saldo Tabungan Akhir Bulan (6 Bulan)

```sql
-- Menghitung saldo akhir kelompok tabungan untuk setiap bulan dalam rentang 6 bulan.
-- Dihitung secara kumulatif dari semua data historis hingga akhir setiap bulan.
WITH months AS (
  SELECT '2025-07' AS m UNION ALL SELECT '2025-08'
  UNION ALL SELECT '2025-09' UNION ALL SELECT '2025-10'
  UNION ALL SELECT '2025-11' UNION ALL SELECT '2025-12'
)
SELECT
  m.m AS month,
  -- Saldo awal semua akun savings
  (SELECT COALESCE(SUM(a.initial_balance), 0)
   FROM accounts AS a WHERE a.role = 'savings')
  -- Net transaksi kumulatif s/d akhir bulan m
  + COALESCE((
      SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)
      FROM transactions AS t
      JOIN accounts AS a ON a.id = t.account_id
      WHERE a.role = 'savings'
        AND t.date < date(m.m || '-01', '+1 month')
    ), 0)
  -- Transfer masuk kumulatif s/d akhir bulan m
  + COALESCE((
      SELECT SUM(tr.amount)
      FROM transfers AS tr
      JOIN accounts AS dest ON dest.id = tr.to_account_id
      WHERE dest.role = 'savings'
        AND tr.date < date(m.m || '-01', '+1 month')
    ), 0)
  -- Transfer keluar kumulatif s/d akhir bulan m
  - COALESCE((
      SELECT SUM(tr.amount)
      FROM transfers AS tr
      JOIN accounts AS origin ON origin.id = tr.from_account_id
      WHERE origin.role = 'savings'
        AND tr.date < date(m.m || '-01', '+1 month')
    ), 0)
  AS end_balance
FROM months AS m;
```

**Penjelasan:**  
CTE `months` mendefinisikan daftar bulan yang ingin dihitung (di aplikasi aslinya, ini dibangun secara dinamis di TypeScript berdasarkan 6 bulan terakhir). Untuk setiap bulan `m`, saldo dihitung kumulatif dari seluruh data historis sampai akhir bulan tersebut.

Ekspresi `date(m.m || '-01', '+1 month')` menggunakan fungsi date arithmetic SQLite untuk mendapatkan tanggal pertama bulan berikutnya (sebagai batas atas eksklusif, menghindari ambiguitas tanggal 31).

> **Catatan implementasi:** Di kode TypeScript, bulan-bulan tersebut dibangun sebagai array dan di-inject satu per satu, lalu hasilnya digabungkan di layer aplikasi — karena SQLite via expo-sqlite tidak mendukung CTE parametrik yang dinamis secara efisien.

---

## Query 7 — Rata-rata Pengeluaran Harian per Hari dalam Seminggu

```sql
-- Menghitung total pengeluaran per hari dalam seminggu (0=Minggu, 6=Sabtu).
-- Digunakan untuk analisis pola weekday vs weekend.
SELECT
  CAST(strftime('%w', date) AS INTEGER) AS day_of_week,
  SUM(amount) AS total_expense,
  COUNT(DISTINCT date) AS active_days
FROM transactions
WHERE type = 'expense'
  AND date >= :start AND date < :end
  AND (:account_id IS NULL OR account_id = :account_id)
GROUP BY day_of_week
ORDER BY day_of_week;
```

**Penjelasan:**  
`strftime('%w', date)` mengembalikan hari dalam seminggu: 0 = Minggu, 1 = Senin, ..., 6 = Sabtu. Ini digunakan bersama dengan perhitungan jumlah hari kalender per kelompok (weekday/weekend) di lapisan TypeScript untuk menghitung rata-rata yang benar — termasuk hari tanpa transaksi sebagai Rp 0.
