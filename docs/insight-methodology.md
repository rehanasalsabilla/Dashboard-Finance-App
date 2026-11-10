# Insight Methodology — Finance Analytics

Dokumentasi metodologi sistem insight otomatis pada dashboard Finance Analytics.

---

## Prinsip Desain

Sistem insight di aplikasi ini dibangun dengan prinsip-prinsip berikut:

| Prinsip | Penjelasan |
|---|---|
| **Deterministik** | Input data yang sama selalu menghasilkan insight yang sama persis. Tidak ada randomisasi atau variasi berbasis sesi. |
| **Berbasis Rules** | Setiap insight dibangkitkan oleh aturan (rule) yang terdefinisi eksplisit dengan ambang batas numerik yang jelas. |
| **Tanpa ML/AI** | Tidak ada model machine learning, tidak ada panggilan ke API AI eksternal. Semua logika berjalan lokal dan transparan. |
| **Konservatif** | Jika syarat data tidak terpenuhi, insight tidak ditampilkan — lebih baik kosong daripada menyesatkan. |
| **Stateless** | Insight tidak menyimpan state antar sesi. Tidak ada "pembelajaran" dari kebiasaan pengguna sebelumnya. |

---

## Arsitektur Sistem

```
Data SQLite
    │
    ▼
analytics/queries.ts    ← Query SQL mengambil data mentah
    │
    ▼
analytics/calculators.ts ← Kalkulasi KPI (total, rata-rata, persentase)
    │
    ▼
analytics/insights.ts    ← Engine rules → array InsightItem[]
    │
    ▼
components/InsightCard.tsx ← Render teks + ikon di UI
```

Setiap panel dashboard memanggil fungsi `generateInsights(panelData)` yang mengembalikan array string insight yang sudah siap ditampilkan.

---

## Daftar Rules Lengkap

### Panel Ringkasan

#### R01 — Pengeluaran Turun Signifikan
- **Trigger:** Pengeluaran periode ini < pengeluaran periode pembanding, dan perubahan ≥ 10%
- **Syarat minimum:** Nilai pembanding > 0 (hindari `Infinity`)
- **Template:** `"Pengeluaran turun {pct}% dibanding periode sebelumnya 👍"`
- **Prioritas:** Medium

#### R02 — Pengeluaran Naik Signifikan
- **Trigger:** Pengeluaran periode ini > pengeluaran periode pembanding, dan kenaikan ≥ 10%
- **Syarat minimum:** Nilai pembanding > 0
- **Template:** `"Pengeluaran naik {pct}% dibanding periode sebelumnya ⚠️"`
- **Prioritas:** High

#### R03 — Arus Kas Negatif
- **Trigger:** Selisih (income − expense) < 0
- **Syarat minimum:** income > 0 atau expense > 0
- **Template:** `"Pengeluaran melebihi pemasukan sebesar Rp {selisih}"`
- **Prioritas:** High

#### R04 — Arus Kas Sangat Positif
- **Trigger:** Selisih > 0 dan net_rate (selisih/income) ≥ 20%
- **Syarat minimum:** income > 0
- **Template:** `"Menyimpan {pct}% dari pemasukan bulan ini 💪"`
- **Prioritas:** Low

---

### Panel Pengeluaran

#### R05 — Kategori Mendominasi
- **Trigger:** Satu kategori memiliki persen ≥ 40% dari total pengeluaran
- **Syarat minimum:** Total pengeluaran > 0 dan persen kategori ≥ 10%
- **Template:** `"{kategori} menyumbang {pct}% dari total pengeluaran"`
- **Prioritas:** Medium

#### R06 — Pola Weekend vs Weekday
- **Trigger:** Rata-rata weekend > rata-rata weekday × 1.5
- **Syarat minimum:** weekdayDays ≥ 3 **dan** weekendDays ≥ 2 dalam periode
- **Template:** `"Rata-rata belanja akhir pekan {ratio}× lebih tinggi dari hari kerja"`
- **Prioritas:** Low

#### R06b — Pola Weekend Lebih Hemat
- **Trigger:** Rata-rata weekday > rata-rata weekend × 1.5
- **Syarat minimum:** Sama dengan R06
- **Template:** `"Pengeluaran hari kerja lebih tinggi dari akhir pekan"`
- **Prioritas:** Low

#### R07 — Kategori Melonjak Signifikan
- **Trigger:** Pengeluaran kategori naik > 15% **dan** > Rp 50.000 vs periode pembanding
- **Syarat minimum:** Nilai pembanding > 0, ada ≥ 2 periode data
- **Template:** `"{kategori} naik Rp {delta} ({pct}%) dibanding bulan lalu"`
- **Prioritas:** Medium (hanya 1 kategori teratas yang dilaporkan)

---

### Panel Anggaran

#### R08 — Ada Kategori Over-Budget
- **Trigger:** Ada ≥ 1 kategori dengan `sisa < 0`
- **Syarat minimum:** Ada ≥ 1 budget aktif bulan ini
- **Template:** `"{n} kategori melebihi anggaran bulan ini"` atau spesifik jika n = 1
- **Prioritas:** High

#### R09 — Semua Anggaran Terkendali
- **Trigger:** Semua kategori berbudget memiliki `sisa ≥ 0`
- **Syarat minimum:** Ada ≥ 1 budget aktif bulan ini
- **Template:** `"Semua anggaran terkendali bulan ini ✅"`
- **Prioritas:** Low

#### R10 — Hampir Mencapai Batas Anggaran
- **Trigger:** Ada kategori dengan `spent/budgeted ≥ 80%` tapi belum over
- **Syarat minimum:** Ada ≥ 1 budget aktif
- **Template:** `"{kategori} sudah mencapai {pct}% dari anggaran"`
- **Prioritas:** Medium

#### R11 — Ada Pengeluaran Tanpa Anggaran
- **Trigger:** `pengeluaran_tanpa_anggaran > Rp 100.000`
- **Syarat minimum:** Ada ≥ 1 budget aktif
- **Template:** `"Rp {total} pengeluaran di luar kategori yang dianggarkan"`
- **Prioritas:** Low

---

### Panel Tabungan

#### R12 — Setoran Bersih Positif
- **Trigger:** Setoran bersih > 0
- **Template:** `"Tabungan bertambah Rp {total} dari transfer bulan ini 🎯"`
- **Prioritas:** Low

#### R13 — Penarikan Bersih dari Tabungan
- **Trigger:** Setoran bersih < 0
- **Template:** `"Rp {total} ditarik dari tabungan bulan ini"`
- **Prioritas:** Medium

#### R14 — Tren Saldo Tabungan Meningkat
- **Trigger:** Saldo akhir periode ini > saldo akhir bulan lalu
- **Syarat minimum:** Ada data bulan sebelumnya
- **Template:** `"Saldo tabungan naik Rp {delta} dibanding bulan lalu"`
- **Prioritas:** Low

---

## Urutan Prioritas dan Pembatasan Tampilan

Insight ditampilkan dengan aturan berikut:

1. Semua rules dievaluasi untuk setiap panel.
2. Insight yang trigger-nya terpenuhi dikumpulkan dalam array.
3. Insight diurutkan: **High** → **Medium** → **Low**.
4. Maksimum **3 insight** ditampilkan per panel untuk menghindari information overload.
5. Jika tidak ada rule yang terpenuhi (atau data tidak cukup), panel insight dikosongkan — tidak ada teks default seperti "Tidak ada insight."

---

## Contoh Output dari Dataset Demo

Contoh insight yang dihasilkan dari dataset sintetis bulan November 2025:

**Panel Ringkasan:**
> ⚠️ Pengeluaran naik 22% dibanding periode sebelumnya

**Panel Pengeluaran:**
> Makan & Minum menyumbang 41% dari total pengeluaran  
> Rata-rata belanja akhir pekan 1.8× lebih tinggi dari hari kerja

**Panel Anggaran:**
> Hiburan sudah mencapai 85% dari anggaran  
> Rp 175.000 pengeluaran di luar kategori yang dianggarkan

**Panel Tabungan:**
> Tabungan bertambah Rp 1.500.000 dari transfer bulan ini 🎯

---

## Keterbatasan Sistem

| Keterbatasan | Dampak |
|---|---|
| **Tidak ada konteks pengguna** | Ambang batas bersifat universal; tidak menyesuaikan dengan gaya hidup pengguna (mis. orang dengan gaji tinggi vs rendah) |
| **Tidak ada rekomendasi investasi** | Aplikasi hanya melaporkan fakta numerik, tidak menyarankan alokasi aset atau produk keuangan |
| **Tidak ada anomali detection** | Transaksi yang tidak wajar (mis. pengeluaran 10× dari biasanya) tidak secara khusus di-flag sebagai anomali |
| **Tidak ada prediksi** | Tidak ada proyeksi saldo akhir bulan atau forecast pengeluaran berdasarkan tren historis |
| **Rules statis** | Ambang batas hardcoded; tidak adapatif terhadap historis pengguna |

---

## Cara Menambahkan Rule Baru

Untuk menambahkan rule insight baru, ikuti langkah berikut:

### 1. Definisikan rule di `docs/kpi-definitions.md` dan dokumen ini

Setiap rule harus terdokumentasi sebelum diimplementasikan, termasuk:
- ID rule (R-XX)
- Panel tujuan
- Kondisi trigger yang tepat (dengan angka)
- Syarat minimum data
- Template teks output
- Prioritas (High/Medium/Low)

### 2. Implementasikan di `src/analytics/insights.ts`

```typescript
// Contoh template rule baru
function checkRuleXX(data: SummaryData, comparison: SummaryData | null): InsightItem | null {
  // Syarat minimum data
  if (!comparison || comparison.expense === 0) return null;

  // Kalkulasi
  const change = (data.expense - comparison.expense) / comparison.expense;

  // Trigger check
  if (change >= 0.10) {
    return {
      id: 'R-XX',
      priority: 'medium',
      text: `Pengeluaran naik ${Math.round(change * 100)}% dibanding periode sebelumnya ⚠️`,
    };
  }

  return null;
}
```

### 3. Daftarkan rule di array runner

```typescript
// Di dalam generateSummaryInsights():
const rules = [checkR01, checkR02, checkR03, checkRuleXX];
const insights = rules
  .map(rule => rule(data, comparison))
  .filter((item): item is InsightItem => item !== null)
  .sort(byPriority)
  .slice(0, 3); // maksimum 3 per panel
```

### 4. Tulis unit test

Setiap rule harus memiliki setidaknya:
- Test case saat trigger **terpenuhi** (harus muncul insight)
- Test case saat trigger **tidak terpenuhi** (harus null)
- Test case saat data minimum tidak terpenuhi (harus null)
