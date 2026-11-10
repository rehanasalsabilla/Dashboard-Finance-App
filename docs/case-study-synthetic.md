# Studi Kasus Data Analyst: Evaluasi Keuangan Pribadi (Dataset Sintetis)

Dokumen ini menyajikan studi kasus analisis data keuangan pribadi menggunakan dataset sintetis yang telah disiapkan di dalam aplikasi. Pendekatan ini mendemonstrasikan siklus kerja analitis: **Pertanyaan Bisnis/Personal → Query SQL & Agregasi → Temuan & Insight → Rekomendasi Aksi**.

---

## 1. Konteks & Karakteristik Data Demo

Dataset sintetis mereplikasi aktivitas keuangan seorang profesional muda selama **5 bulan** (Oktober 2025 s.d. Februari 2026) dengan struktur akun:
- **BCA Utama** (`bank`, peran: `main`): rekening penerima gaji, sumber transfer, dan pembayaran pengeluaran besar. Saldo awal: Rp5.000.000.
- **BCA Tabungan** (`bank`, peran: `savings`): rekening tabungan berjangka/darurat. Saldo awal: Rp2.000.000.
- **GoPay** (`ewallet`, peran: `spending`): dompet operasional harian (makan, transportasi, jajan). Saldo awal: Rp0.

Kategori yang digunakan:
- **Pemasukan**: Gaji bulanan tetap Rp7.500.000 di awal bulan, honor proyek Rp1.500.000 di Desember 2025.
- **Pengeluaran**: Makan, Belanja bulanan, Transportasi, Tagihan, WiFi/Kuota, Skincare, Main, Biaya admin.

---

## 2. Studi Kasus 1: Pola Belanja & Fenomena Akhir Tahun (Nov vs Des 2025)

### Pertanyaan
> *"Bagaimana pergeseran alokasi pengeluaran pada periode liburan akhir tahun (Desember 2025) dibandingkan bulan normal (November 2025)?"*

### Analisis SQL
```sql
SELECT 
  substr(date, 1, 7) AS periode,
  c.name AS kategori,
  SUM(t.amount) AS total_pengeluaran,
  ROUND(SUM(t.amount) * 100.0 / SUM(SUM(t.amount)) OVER (PARTITION BY substr(date, 1, 7)), 1) AS persen_share
FROM transactions t
JOIN categories c ON c.id = t.category_id
WHERE t.type = 'expense' AND t.date >= '2025-11-01' AND t.date < '2026-01-01'
GROUP BY periode, c.name
ORDER BY periode ASC, total_pengeluaran DESC;
```

### Temuan Data
- **November 2025**:
  - Total pengeluaran: **Rp4.350.000**
  - Top kategori: Makan (Rp1.450.000 / 33,3%), Belanja bulanan (Rp1.200.000 / 27,6%), Tagihan (Rp750.000 / 17,2%).
- **Desember 2025**:
  - Total pengeluaran: **Rp6.100.000** (+40,2% MoM)
  - Kenaikan drastis pada kategori diskresioner:
    - **Main / Hiburan**: melonjak dari Rp350.000 menjadi **Rp1.250.000** (+257%).
    - **Makan**: naik menjadi **Rp1.950.000** (+34,5%).
    - **Skincare / Hadiah**: Rp650.000 (+85%).

### Insight Otomatis Sistem
- ⚠️ *Pengeluaran Main naik Rp900.000 atau 257,1% dibanding periode pembanding.*
- ℹ️ *Makan menyumbang 32,0% dari seluruh pengeluaran periode ini.*
- ⚠️ *Rata-rata pengeluaran harian Desember mencapai Rp196.774/hari, naik signifikan dari Rp145.000/hari di November.*

### Aksi yang Dapat Dipertimbangkan
1. Menetapkan plafon anggaran terpisah untuk musim liburan (*holiday budget*) sebesar Rp1.000.000 di bulan Desember agar tidak mengorbankan setoran tabungan.
2. Memisahkan pengeluaran hadiah/traktir ke dalam sub-kategori khusus agar tidak mendistorsi baseline biaya makan harian.

---

## 3. Studi Kasus 2: Efektivitas Anggaran & Deteksi Over-Budget (Desember 2025)

### Pertanyaan
> *"Berapa kategori yang melampaui batas anggaran pada bulan dengan belanja tinggi, dan apakah surplus di kategori lain menutupi defisit tersebut?"*

### Analisis SQL
```sql
SELECT
  c.name AS kategori,
  b.amount AS batas_anggaran,
  COALESCE(SUM(t.amount), 0) AS realisasi,
  (b.amount - COALESCE(SUM(t.amount), 0)) AS sisa_anggaran,
  ROUND(COALESCE(SUM(t.amount), 0) * 100.0 / b.amount, 1) AS utilisasi_pct,
  CASE WHEN COALESCE(SUM(t.amount), 0) > b.amount THEN 'Over Budget' ELSE 'Aman' END AS status
FROM budgets b
JOIN categories c ON c.id = b.category_id
LEFT JOIN transactions t ON t.category_id = b.category_id 
  AND t.type = 'expense' 
  AND t.date >= '2025-12-01' AND t.date < '2026-01-01'
WHERE b.month = '2025-12'
GROUP BY b.id, c.name, b.amount
ORDER BY utilisasi_pct DESC;
```

### Temuan Data
- Total batas anggaran yang ditetapkan: **Rp5.500.000**.
- Realisasi kategori beranggaran: **Rp5.650.000** (Utilisasi 102,7%).
- **Kategori Over-Budget**:
  1. **Main**: Batas Rp800.000 vs Realisasi Rp1.250.000 (156,3% — Defisit Rp450.000).
  2. **Makan**: Batas Rp1.800.000 vs Realisasi Rp1.950.000 (108,3% — Defisit Rp150.000).
- **Kategori Under-Budget**:
  1. **Belanja bulanan**: Batas Rp1.500.000 vs Realisasi Rp1.300.000 (Sisa Rp200.000).
  2. **WiFi/Kuota**: Batas Rp350.000 vs Realisasi Rp300.000 (Sisa Rp50.000).
- Pengeluaran tanpa anggaran: **Rp450.000** (misal Biaya admin & pengeluaran insidental).

### Prinsip Analitik yang Ditegakkan
> **"Sisa agregat tidak boleh menyembunyikan defisit individual."**
> Meskipun kategori Belanja bulanan surplus Rp200.000, hal tersebut tidak mengubah fakta bahwa kategori Main mengalami kelebihan belanja hingga 56%. Di dashboard, kartu analitik Anggaran menandai **2 kategori melebihi batas** secara eksplisit dengan warna peringatan `#D94B20`.

---

## 4. Studi Kasus 3: Kinerja Akumulasi Tabungan & Net Deposit

### Pertanyaan
> *"Berapa aliran dana bersih yang benar-benar berhasil dialokasikan ke pos tabungan setiap bulannya, tanpa menghitung transfer antar sesama dompet belanja?"*

### Analisis SQL
```sql
SELECT
  m.periode,
  -- Transfer dari akun non-savings ke akun savings
  COALESCE((
    SELECT SUM(tr.amount)
    FROM transfers tr
    JOIN accounts orig ON orig.id = tr.from_account_id
    JOIN accounts dest ON dest.id = tr.to_account_id
    WHERE dest.role = 'savings' AND orig.role != 'savings'
      AND tr.date >= m.periode || '-01' 
      AND tr.date < date(m.periode || '-01', '+1 month')
  ), 0) AS transfer_masuk_tabungan,
  -- Transfer keluar dari akun savings ke akun non-savings (penarikan)
  COALESCE((
    SELECT SUM(tr.amount)
    FROM transfers tr
    JOIN accounts orig ON orig.id = tr.from_account_id
    JOIN accounts dest ON dest.id = tr.to_account_id
    WHERE orig.role = 'savings' AND dest.role != 'savings'
      AND tr.date >= m.periode || '-01' 
      AND tr.date < date(m.periode || '-01', '+1 month')
  ), 0) AS transfer_keluar_tabungan
FROM (
  SELECT '2025-10' AS periode UNION ALL SELECT '2025-11' UNION ALL
  SELECT '2025-12' UNION ALL SELECT '2026-01' UNION ALL SELECT '2026-02'
) m;
```

### Temuan Data
| Periode | Transfer Masuk | Penarikan | Setoran Bersih (*Net Deposit*) | Saldo Akhir Tabungan |
|---|---|---|---|---|
| **Okt 2025** | Rp1.500.000 | Rp0 | **+Rp1.500.000** | Rp3.500.000 |
| **Nov 2025** | Rp2.000.000 | Rp0 | **+Rp2.000.000** | Rp5.500.000 |
| **Des 2025** | Rp1.000.000 | Rp500.000 (tarik belanja liburan) | **+Rp500.000** | Rp6.000.000 |
| **Jan 2026** | Rp2.500.000 | Rp0 | **+Rp2.500.000** | Rp8.500.000 |

### Evaluasi Metrik
1. **Net Deposit vs Saldo**: Saldo tabungan terus bertumbuh dari Rp2.000.000 (saldo awal) hingga mencapai Rp8.500.000 di akhir Januari 2026.
2. **Efek Transfer GoPay**: Top-up dari BCA Utama ke GoPay sebesar Rp1.200.000 di bulan Desember tercatat murni sebagai transfer internal `main → spending`, **tidak pernah** mengotori metrik tabungan maupun pemasukan/pengeluaran agregat.

---

## 5. Ringkasan Nilai Portofolio

Penyusunan dashboard ini membuktikan penguasaan dalam:
1. **Ketepatan Pemodelan Data Relasional**: Pemisahan jelas antara transaksi pendapatan/biaya dengan mutasi saldo (transfer), mencegah *double-counting*.
2. **SQL Tingkat Menengah ke Lanjut**: Penggunaan Common Table Expressions (CTE), Window Functions (`PARTITION BY`), korelasi subquery kumulatif, dan penanganan tanggal deterministik.
3. **Data Integrity & UX Konsisten**: Penanganan kasus khusus seperti pembanding bernilai 0 (mencegah `Infinity` / `NaN`), perbandingan parsial bulan berjalan (*apple-to-apple comparison*), dan filter terisolasi antar tab.
