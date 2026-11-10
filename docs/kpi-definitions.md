# KPI Definitions — Finance Analytics Dashboard

Definisi lengkap setiap Key Performance Indicator (KPI) dan metrik yang ditampilkan di keempat panel dashboard analitik.  
Dokumen ini berfungsi sebagai **single source of truth** untuk logika kalkulasi — setiap perubahan di kode harus mencerminkan perubahan di sini.

---

## Panel 1: Ringkasan

Panel ini memberikan gambaran umum arus kas dalam periode yang dipilih.

### Total Pemasukan

> Jumlah seluruh transaksi dengan tipe `income` dalam periode.

```sql
SUM(amount) FROM transactions
WHERE type = 'income'
  AND date >= :start_date AND date < :end_date
  AND (:account_id IS NULL OR account_id = :account_id)
```

**Catatan penting:**
- Transfer masuk ke akun **tidak termasuk** di sini. Transfer bukan income — hanya memindahkan saldo.
- `initial_balance` akun juga **tidak termasuk**. Saldo awal bukan merupakan pemasukan.
- Jika filter akun aktif (`account_id` tidak null), hanya transaksi akun tersebut yang dihitung.

---

### Total Pengeluaran

> Jumlah seluruh transaksi dengan tipe `expense` dalam periode.

```sql
SUM(amount) FROM transactions
WHERE type = 'expense'
  AND date >= :start_date AND date < :end_date
  AND (:account_id IS NULL OR account_id = :account_id)
```

**Catatan penting:**
- Biaya admin transfer (expense yang dikaitkan via `fee_transaction_id`) **termasuk** di sini, karena memang merupakan expense nyata.
- Nominal transfer itu sendiri **tidak termasuk** (transfer bukan expense).

---

### Selisih (Net)

> Pemasukan dikurangi Pengeluaran dalam periode.

```
Selisih = Total Pemasukan − Total Pengeluaran
```

**Catatan penting:**
- Ini **bukan saldo rekening**. Saldo rekening mempertimbangkan saldo awal (`initial_balance`) dan semua transfer historis.
- Selisih positif = arus kas bersih positif dalam periode; bukan berarti akun tidak defisit.
- Selisih dapat negatif jika pengeluaran melebihi pemasukan dalam periode tersebut.

---

### Rata-rata Pengeluaran Harian

> Total Pengeluaran dibagi jumlah hari kalender dalam periode.

```
Rata-rata Harian = Total Pengeluaran / Jumlah Hari Kalender
```

**Aturan pembagi (jumlah hari):**
- **Bulan yang sudah selesai:** Dibagi total hari dalam bulan tersebut (mis. Januari = 31).
- **Bulan yang sedang berjalan:** Dibagi jumlah hari dari tanggal 1 hingga **hari ini** (inklusif). Ini mencerminkan rata-rata aktual sampai saat ini, bukan proyeksi bulan penuh.
- **Rentang kustom:** Dibagi jumlah hari dari `start_date` hingga `end_date` (inklusif).

---

### Perbandingan Periode

> Membandingkan metrik periode aktif dengan periode pembanding yang relevan.

| Kondisi Periode Aktif | Periode Pembanding |
|---|---|
| Bulan yang **sedang berjalan** | N hari pertama bulan sebelumnya, di mana N = hari-ke-N bulan ini hari ini |
| Bulan yang **sudah selesai** | Bulan sebelumnya secara penuh |
| Rentang kustom | Rentang dengan durasi sama tepat sebelumnya |

**Aturan tampilan:**
- Label periode pembanding **selalu ditampilkan** (mis. "vs 1–15 Okt") agar pengguna tahu apa yang dibandingkan.
- Persentase perubahan hanya ditampilkan jika nilai pembanding > 0 (menghindari pembagian dengan nol / nilai `Infinity`).
- Tanda ▲ (naik) / ▼ (turun) dengan warna kontekstual: merah jika pengeluaran naik, hijau jika pengeluaran turun (dan sebaliknya untuk pemasukan).

---

## Panel 2: Pengeluaran

Panel ini menganalisis struktur dan pola pengeluaran.

### Peringkat Kategori Pengeluaran

> Daftar kategori expense diurutkan berdasarkan total nominal, dari terbesar ke terkecil.

```sql
SELECT c.name, SUM(t.amount) AS total,
  ROUND(SUM(t.amount) * 100.0 / (SELECT SUM(amount) FROM transactions
    WHERE type = 'expense' AND date >= :start AND date < :end
      AND (:account_id IS NULL OR account_id = :account_id)), 1) AS pct
FROM transactions t JOIN categories c ON c.id = t.category_id
WHERE t.type = 'expense' AND t.date >= :start AND t.date < :end
  AND (:account_id IS NULL OR t.account_id = :account_id)
GROUP BY c.id ORDER BY total DESC
```

**Definisi persen:** `total_kategori / total_seluruh_pengeluaran × 100`, dibulatkan 1 desimal.

---

### Rata-rata Pengeluaran Hari Kerja (Weekday)

> Total pengeluaran pada hari Senin–Jumat dibagi jumlah hari Senin–Jumat dalam periode (termasuk hari tanpa transaksi).

```
Rata-rata Weekday = Total Expense (Senin–Jumat) / Jumlah Hari Senin–Jumat dalam Periode
```

**Aturan penting:**
- Pembagi adalah **jumlah hari kalender** Senin–Jumat dalam periode, bukan jumlah hari yang ada transaksinya.
- Ini memastikan hari tanpa belanja dihitung sebagai Rp 0, bukan diabaikan.

---

### Rata-rata Pengeluaran Akhir Pekan (Weekend)

> Total pengeluaran pada hari Sabtu–Minggu dibagi jumlah hari Sabtu–Minggu dalam periode.

```
Rata-rata Weekend = Total Expense (Sabtu–Minggu) / Jumlah Hari Sabtu–Minggu dalam Periode
```

Logika sama dengan weekday — pembagi adalah hari kalender, bukan hari bertransaksi.

---

## Panel 3: Anggaran

Panel ini memantau realisasi anggaran bulanan per kategori.

### Terpakai (per Kategori)

> Total expense kategori tersebut dalam bulan anggaran, dari semua akun (tidak difilter per akun).

```sql
SELECT SUM(t.amount)
FROM transactions t
WHERE t.category_id = :category_id
  AND t.type = 'expense'
  AND t.date >= :month_start AND t.date < :month_end
```

**Catatan:** Realisasi anggaran selalu dihitung dari **semua akun** (tidak mengikuti filter akun di panel lain), karena anggaran bersifat global bukan per-akun.

---

### Sisa Anggaran

> Anggaran dikurangi realisasi.

```
Sisa = budgets.amount − Terpakai
```

- Sisa **bisa negatif** jika pengeluaran melebihi anggaran (over-budget).
- Tampilkan dengan warna merah jika negatif, hijau jika positif.

---

### Pengeluaran Tanpa Anggaran

> Jumlah expense dari kategori-kategori yang **tidak memiliki** budget di bulan ini.

```
Pengeluaran Tanpa Anggaran = Total Expense Bulan Ini
                           − SUM(spent per kategori yang ada di budgets bulan ini)
```

Ini menangkap pengeluaran "tidak terencana" yang tidak masuk ke dalam kategori berbudget manapun.

---

## Panel 4: Tabungan

Panel ini memantau kondisi dan pertumbuhan akun-akun berperan `savings`.

### Saldo Akhir Periode (per Akun Tabungan)

> Saldo aktual akun tabungan pada akhir periode yang dipilih.

```
Saldo Akhir = initial_balance
            + SUM(income transactions akun ini sampai end_date)
            − SUM(expense transactions akun ini sampai end_date)
            + SUM(transfer masuk ke akun ini sampai end_date)
            − SUM(transfer keluar dari akun ini sampai end_date)
```

**Catatan:** Kalkulasi bersifat **kumulatif** (sejak awal, sampai `end_date`), bukan hanya dalam periode tampilan. Ini mencerminkan saldo sesungguhnya pada titik waktu tersebut.

---

### Transfer Masuk Eksternal (ke Kelompok Tabungan)

> Total transfer yang masuk ke akun savings **dari** akun non-savings dalam periode.

```sql
SELECT SUM(tr.amount)
FROM transfers tr
JOIN accounts origin ON origin.id = tr.from_account_id
JOIN accounts dest ON dest.id = tr.to_account_id
WHERE dest.role = 'savings'
  AND origin.role != 'savings'
  AND tr.date >= :start AND tr.date < :end
```

**"Eksternal"** berarti dana datang dari luar kelompok tabungan (dari akun main/spending/unassigned).

---

### Transfer Keluar Eksternal (dari Kelompok Tabungan)

> Total transfer yang keluar dari akun savings **ke** akun non-savings dalam periode.

```sql
SELECT SUM(tr.amount)
FROM transfers tr
JOIN accounts origin ON origin.id = tr.from_account_id
JOIN accounts dest ON dest.id = tr.to_account_id
WHERE origin.role = 'savings'
  AND dest.role != 'savings'
  AND tr.date >= :start AND tr.date < :end
```

---

### Setoran Bersih

> Aliran dana bersih dari/ke kelompok tabungan dari luar.

```
Setoran Bersih = Transfer Masuk Eksternal − Transfer Keluar Eksternal
```

- Positif = tabungan bertumbuh dari pendanaan eksternal.
- Negatif = lebih banyak dana ditarik dari tabungan.

**Catatan krusial:** Transfer **antar sesama akun tabungan** (savings → savings) **tidak dihitung** sebagai setoran maupun penarikan — keduanya masuk ke kelompok yang sama sehingga tidak mengubah total saldo kelompok.

---

## Aturan Pembangkitan Insight

Insight adalah kalimat observasi otomatis yang muncul di bawah setiap panel.

### Prinsip Umum

- **Deterministik:** Insight yang sama akan selalu muncul untuk data yang sama.
- **Berbasis rules:** Tidak ada ML, tidak ada AI eksternal, tidak ada konteks pengguna lintas-sesi.
- **Konservatif:** Hanya tampilkan insight jika data cukup dan ambang batas terpenuhi. Lebih baik tidak ada insight daripada insight yang menyesatkan.

### Ambang Minimum Data

| Kondisi | Syarat Minimum |
|---|---|
| Insight ringkasan (income/expense/net) | income > 0 **atau** expense > 0 |
| Insight perubahan persentase | Nilai pembanding > 0 (menghindari ∞) |
| Insight kategori teratas | Persen kategori ≥ 10% dari total pengeluaran |
| Insight weekend vs weekday | weekdayDays ≥ 3 **dan** weekendDays ≥ 2 dalam periode |
| Insight perubahan kategori signifikan | Perubahan > 15% **atau** perubahan > Rp 50.000 |

### Daftar Rules

| ID | Panel | Trigger | Contoh Output |
|---|---|---|---|
| `R01` | Ringkasan | Pengeluaran turun ≥ 10% vs periode pembanding | "Pengeluaran turun 12% dibanding periode sebelumnya 👍" |
| `R02` | Ringkasan | Pengeluaran naik ≥ 10% vs periode pembanding | "Pengeluaran naik 18% dibanding periode sebelumnya ⚠️" |
| `R03` | Ringkasan | Selisih negatif (pengeluaran > pemasukan) | "Pengeluaran melebihi pemasukan bulan ini sebesar Rp 150.000" |
| `R04` | Pengeluaran | Satu kategori ≥ 40% dari total | "Makan menyumbang 45% dari total pengeluaran" |
| `R05` | Pengeluaran | Weekend avg > weekday avg × 1.5 | "Rata-rata pengeluaran akhir pekan 2× lebih tinggi dari hari kerja" |
| `R06` | Pengeluaran | Kategori naik signifikan vs bulan lalu | "Hiburan naik Rp 80.000 (25%) dibanding bulan lalu" |
| `R07` | Anggaran | Ada ≥ 1 kategori over-budget | "2 kategori melebihi anggaran bulan ini" |
| `R08` | Anggaran | Semua kategori dalam anggaran | "Semua anggaran terkendali bulan ini ✅" |
| `R09` | Tabungan | Setoran bersih positif | "Tabungan bertambah Rp 500.000 dari transfer bulan ini" |
| `R10` | Tabungan | Setoran bersih negatif | "Rp 200.000 ditarik dari tabungan bulan ini" |
