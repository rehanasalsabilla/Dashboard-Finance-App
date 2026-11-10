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

## Lisensi

[MIT](./LICENSE) © 2025 Rehana
