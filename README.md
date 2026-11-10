# Finance Analytics — Personal Finance Tracker & Analytics Dashboard

![React Native](https://img.shields.io/badge/React_Native-0.88-61DAFB?logo=react&logoColor=white)
![Expo](https://img.shields.io/badge/Expo_SDK-58-000020?logo=expo&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-lokal-003B57?logo=sqlite&logoColor=white)

Aplikasi mobile **personal finance tracker** dengan dashboard analitik berbasis SQLite. Dibangun sebagai proyek portofolio Data Analyst untuk mendemonstrasikan kemampuan pemodelan data, query SQL analitik, dan visualisasi insight berbasis rules — semuanya berjalan secara lokal tanpa cloud.

---

## Screenshots

> **Coming soon** — dataset sintetis sedang disiapkan; screenshot akan ditambahkan setelah demo data final.

---

## Fitur Utama

| Fitur | Keterangan |
|---|---|
| **Pencatatan Transaksi** | Catat income, expense, dan transfer antar akun dengan validasi konsistensi |
| **Manajemen Multi-Akun** | Dompet cash, bank, dan e-wallet dengan peran (main / savings / spending) |
| **Anggaran Bulanan** | Tetapkan budget per kategori, pantau realisasi vs target secara real-time |
| **Dashboard Analitik 4-Panel** | Ringkasan · Pengeluaran · Anggaran · Tabungan |
| **Insight Otomatis** | Rule-based insight deterministik — tanpa ML, tanpa AI eksternal |
| **Dataset Sintetis** | Data demo yang bisa di-seed ulang untuk keperluan presentasi portofolio |

---

## Tech Stack

| Layer | Teknologi |
|---|---|
| Framework | React Native 0.88 / Expo SDK 58 |
| Bahasa | TypeScript 6 |
| Routing | expo-router (file-based routing) |
| Database | expo-sqlite / SQLite (lokal, no cloud) |
| State | React hooks + context |
| Styling | StyleSheet API (no external UI lib) |

> **Tidak ada backend.** Semua data tersimpan di SQLite lokal pada perangkat. Tidak ada request ke server eksternal.

---

## Cara Menjalankan

**Prasyarat:** Node.js ≥ 18, npm, dan aplikasi [Expo Go](https://expo.dev/client) di smartphone (opsional).

```bash
# 1. Masuk ke folder project
cd finance-app

# 2. Install dependensi
npm install

# 3. Jalankan di Expo Go (scan QR dengan smartphone)
npx expo start

# 4. Atau buka di browser (web)
npx expo start --web
```

Saat pertama kali dijalankan, migrasi database akan berjalan otomatis dan dataset sintetis akan di-seed ke SQLite lokal.

---

## Struktur Folder

```
finance-app/
├── src/
│   ├── app/            # Halaman & routing (expo-router)
│   ├── analytics/      # Engine analitik: query SQL, kalkulasi KPI, generator insight
│   ├── components/     # UI components (chart, card, filter, dsb.)
│   ├── components/ui/  # Komponen primitif (Button, Text, dsb.)
│   ├── constants/      # Konstanta aplikasi (warna, format tanggal, dsb.)
│   ├── db/             # Skema, migrasi, seed data sintetis
│   └── hooks/          # Custom React hooks
├── assets/             # Ikon & gambar
├── docs/               # Dokumentasi teknis & portofolio
│   ├── database-schema.md
│   ├── kpi-definitions.md
│   ├── sql-examples.md
│   └── insight-methodology.md
├── scripts/            # Script utilitas (seed, reset DB)
├── app.json            # Konfigurasi Expo
└── tsconfig.json
```

| Folder | Isi |
|---|---|
| `src/app` | File-based routing: tab utama (Beranda, Transaksi, Analytics, Pengaturan) |
| `src/analytics` | Semua logika komputasi KPI dan insight — terpisah dari UI |
| `src/components` | Komponen chart (bar, line, donut), card ringkasan, filter periode |
| `src/db` | DDL schema, runner migrasi (V1–V5), fungsi CRUD, seed dataset sintetis |

---

## Konsep Keuangan yang Diimplementasikan

Beberapa keputusan desain penting yang membedakan aplikasi ini dari tracker sederhana:

- **Transfer ≠ Income/Expense** — Transfer antar akun tidak masuk ke total pemasukan atau pengeluaran; hanya memindahkan saldo.
- **Saldo awal bukan income** — `initial_balance` di tabel `accounts` adalah saldo awal historis, bukan transaksi income.
- **Biaya admin transfer** — Biaya admin (mis. biaya transfer bank) dicatat sebagai expense terpisah dan dikaitkan via `fee_transaction_id` di tabel `transfers`.
- **Peran akun (role)** — Setiap akun memiliki peran: `main` (rekening utama, hanya 1), `savings` (tabungan), `spending` (pengeluaran), atau `unassigned`. Peran ini menjadi filter dimensi di panel Tabungan.
- **Periode perbandingan proporsional** — Untuk bulan yang sedang berjalan, perbandingan dilakukan terhadap jumlah hari sebanding di bulan sebelumnya (bukan total bulan sebelumnya).

---

## Keterbatasan (Jujur)

| Keterbatasan | Keterangan |
|---|---|
| Tidak ada backup cloud | Data tersimpan hanya di perangkat; hapus app = hilang semua data |
| Tidak ada enkripsi data | File SQLite dapat dibaca oleh aplikasi lain dengan root access |
| Tidak ada sinkronisasi multi-perangkat | Satu perangkat = satu database; tidak ada fitur export/import saat ini |
| Tidak ada deteksi anomali ML | Insight sepenuhnya rule-based; tidak adaptif terhadap kebiasaan pengguna |
| Mata uang tunggal | Hanya mendukung Rupiah (IDR); tidak ada konversi mata uang |

---

---

## Tentang Proyek dan Tujuannya

Finance Analytics menggabungkan dua kebutuhan:

1. **Pencatatan keuangan pribadi:** mencatat sumber pemasukan, penggunaan uang, dan perpindahan dana antar rekening atau dompet.
2. **Analisis keuangan:** mengolah catatan tersebut menjadi KPI, visualisasi, dan insight untuk mengevaluasi kebiasaan pengeluaran, penggunaan anggaran, serta aktivitas tabungan.

Pengguna mencatat aktivitas melalui aplikasi, lalu dashboard menghitung hasilnya dari database SQLite. Kualitas hasil analisis bergantung pada kelengkapan dan ketepatan catatan pengguna.

Proyek ini dikembangkan secara bertahap. Fitur yang tersedia pada suatu versi mengikuti implementasi kode dan hasil pengujian pada versi tersebut.

## Panduan Penggunaan Pertama

### 1. Siapkan rekening dan dompet

Buka **Beranda → Dompet**, kemudian tambahkan akun yang digunakan, misalnya:

| Akun | Jenis | Peran |
|---|---|---|
| Mandiri Utama | Bank | Main |
| Mandiri Second | Bank | Savings |
| GoPay | E-wallet | Spending |
| Tunai | Cash | Spending |

Tentukan saldo awal sesuai kondisi saat mulai melakukan pencatatan. Saldo awal tidak dihitung sebagai pemasukan.

Peran akun adalah pengelompokan di dalam aplikasi, bukan koneksi langsung ke bank. Aplikasi tidak mengambil saldo rekening secara otomatis.

### 2. Catat aktivitas keuangan

Gunakan tombol **+** pada navigasi bawah:

- **Pemasukan:** uang diterima dari luar, misalnya gaji.
- **Pengeluaran:** uang digunakan untuk membayar barang, jasa, atau kebutuhan lain.
- **Transfer:** uang dipindahkan antar akun milik sendiri.

Contoh alur:

| Aktivitas | Pencatatan |
|---|---|
| Menerima gaji Rp5.000.000 di Mandiri Utama | Pemasukan → Gaji → Mandiri Utama |
| Memindahkan Rp500.000 dari Mandiri Utama ke GoPay | Transfer → Mandiri Utama ke GoPay |
| Membayar makan Rp35.000 menggunakan GoPay | Pengeluaran → Makan → GoPay |
| Memindahkan Rp1.000.000 ke Mandiri Second | Transfer → Mandiri Utama ke Mandiri Second |

Jika top-up GoPay juga dihitung sebagai pengeluaran, uang yang sama dapat terhitung kembali ketika digunakan membayar. Karena itu, transfer dan pengeluaran dipisahkan.

Pembayaran ke rekening pihak lain untuk membeli sesuatu dicatat sebagai **pengeluaran**, bukan transfer antar akun sendiri.

### 3. Tentukan anggaran

Buka **Anggaran**, pilih bulan dan kategori pengeluaran, lalu tentukan batasnya.

Pemakaian anggaran dihitung dari transaksi pengeluaran pada kategori dan bulan tersebut. Anggaran memantau batas belanja; tidak memindahkan atau mengunci dana.

### 4. Evaluasi melalui Analitik

Pilih periode dan cakupan akun, lalu gunakan tampilan yang relevan:

| Tampilan | Pertanyaan yang ingin dijawab |
|---|---|
| Ringkasan | Berapa pemasukan, pengeluaran, dan selisih pada periode ini? |
| Pengeluaran | Kategori apa yang paling besar dan bagaimana pola belanjanya? |
| Anggaran | Bagaimana aktual pengeluaran dibanding batas yang ditentukan? |
| Tabungan | Bagaimana aktivitas dan perkembangan rekening tabungan? |

Untuk menelusuri angka, gunakan tautan rincian yang tersedia menuju halaman **Transaksi**.

## Memahami Angka pada Dashboard

| Istilah | Makna |
|---|---|
| Pemasukan | Uang masuk yang dicatat sebagai transaksi income |
| Pengeluaran | Uang keluar yang dicatat sebagai transaksi expense, termasuk biaya admin |
| Selisih pemasukan–pengeluaran | Total pemasukan dikurangi total pengeluaran pada periode dan cakupan terpilih |
| Saldo akun | Saldo awal ditambah pemasukan dan transfer masuk, dikurangi pengeluaran dan transfer keluar |
| Sisa anggaran | Batas kategori dikurangi pengeluaran yang menggunakan batas tersebut |
| Transfer masuk/keluar | Perpindahan dana menuju/dari akun milik pengguna |

**Selisih bulanan, saldo rekening, dan sisa anggaran memiliki arti berbeda.** Selisih positif tidak otomatis berarti seluruh nominal tersebut sudah dipindahkan ke tabungan.

Untuk seluruh akun, transfer internal tidak menambah total uang yang dimiliki. Biaya admin mengurangi total tersebut sebagai pengeluaran.

## Cara Membaca Insight

Insight dibentuk dari aturan dan agregasi data, bukan prediksi AI.

Saat membaca insight, perhatikan:

- Periode yang dianalisis.
- Akun yang dipilih.
- Periode pembanding.
- Ketersediaan data pada kedua periode.

Contoh ilustrasi, bukan hasil aktual proyek:

> Pengeluaran Makan meningkat dari Rp700.000 menjadi Rp850.000: naik Rp150.000 atau sekitar 21,4%.

Peningkatan tersebut menunjukkan perubahan nominal. Angka itu sendiri belum menjelaskan penyebabnya.

Data kosong juga perlu dibedakan dari pengeluaran yang benar-benar nol. Pengguna mungkin belum memasukkan seluruh transaksi.

## Penggunaan di HP dan Browser

Setelah dependensi terpasang, jalankan dari folder proyek.

**Expo Go:**

```bash
npx expo start
```

Scan QR menggunakan Expo Go. Untuk koneksi LAN, laptop dan HP perlu berada pada jaringan yang dapat saling mengakses.

Jika koneksi LAN tidak memungkinkan, coba tunnel:

```bash
npx expo start --tunnel
```

**Browser:**

```bash
npm run web
```

Buka alamat Web yang ditampilkan terminal.

Jika perubahan kode belum terlihat, hentikan server lalu jalankan:

```bash
npx expo start --web --clear
```

Database di browser dan database di HP terpisah. Transaksi yang dicatat pada satu lingkungan tidak otomatis muncul pada lingkungan lainnya.

Untuk menghindari benturan akses SQLite web, gunakan satu tab aplikasi ketika melakukan pengujian.

## Data Pribadi dan Data Demonstrasi

Gunakan data sintetis untuk screenshot, presentasi, dan studi kasus publik.

Mekanisme seed harus diperiksa pada versi kode yang digunakan. Keberadaan file seed tidak selalu berarti data demo otomatis dimasukkan ketika aplikasi dijalankan. Jangan menjalankan seed pada database pribadi sebelum memahami apakah proses tersebut menambahkan, mengganti, atau menghapus data.

Angka pada data demonstrasi tidak mewakili kondisi keuangan pengguna.

## Nilai Proyek sebagai Portofolio Data Analyst

Bagian analisis proyek mencakup:

- **Pemodelan data:** relasi akun, kategori, transaksi, transfer, dan anggaran.
- **SQL analitik:** agregasi periode, kontribusi kategori, dan perbandingan aktual dengan anggaran.
- **Definisi metrik:** memastikan saldo, pemasukan, pengeluaran, dan transfer dihitung konsisten.
- **Visualisasi:** menyajikan tren serta komposisi data yang dapat ditelusuri ke transaksi.
- **Interpretasi:** menghasilkan insight dengan pembanding dan batasan yang jelas.

Dokumentasi pendukung:

- [Skema database](docs/database-schema.md)
- [Definisi KPI](docs/kpi-definitions.md)
- [Contoh SQL analitik](docs/sql-examples.md)
- [Metodologi insight](docs/insight-methodology.md)
- [Studi kasus data sintetis](docs/case-study-synthetic.md)

## Penyimpanan Kode dan Data

Repository GitHub menyimpan kode dan dokumentasi yang sudah di-commit serta di-push. Repository tidak otomatis mencadangkan transaksi SQLite pada perangkat.

Perubahan kode lokal juga belum tersimpan di GitHub sebelum dilakukan commit dan push.

**Catatan konektivitas:** penyimpanan dan perhitungan keuangan dirancang berjalan lokal. Saat pengembangan, Expo, tunnel, instalasi dependensi, atau layanan pengembangan lainnya tetap dapat memerlukan internet.

## Pengembangan Berikutnya

Rencana berikut merupakan arah pengembangan, bukan daftar fitur yang sudah tersedia:

- Backup dan restore data pengguna.
- Ekspor data untuk analisis lanjutan.
- Pengujian tambahan untuk konsistensi KPI dan navigasi rincian.
- Penyempurnaan tampilan mobile dan desktop.
- Build Android mandiri.
- Analisis Python yang dapat direproduksi dari data demonstrasi.

## Lisensi

[MIT](./LICENSE) © 2025 Rehana
