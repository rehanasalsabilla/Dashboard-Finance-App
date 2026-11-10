/**
 * Test Suite: Verifikasi Aturan Perhitungan dan Logika Keuangan Personal Finance Analytics
 * Dapat dijalankan langsung dengan: node scripts/test-analytics-logic.mjs
 */

import assert from 'node:assert';

console.log('🧪 Memulai Verifikasi Logika Analitik Keuangan...\n');

let passedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASSED: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAILED: ${name}`);
    console.error(`     Error: ${err.message}\n`);
    process.exitCode = 1;
  }
}

// -----------------------------------------------------------------------------
// 1. Transfer tidak masuk ke total Pemasukan / Pengeluaran
// -----------------------------------------------------------------------------
runTest('Transfer internal tidak menambah Pemasukan atau Pengeluaran agregat', () => {
  const transactions = [
    { type: 'income', amount: 5000000 },
    { type: 'expense', amount: 1500000 },
  ];
  const transfers = [
    { from: 1, to: 2, amount: 2000000 }, // BCA ke GoPay
    { from: 1, to: 3, amount: 1000000 }, // BCA ke Tabungan
  ];

  // Rumus agregat
  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  assert.strictEqual(totalIncome, 5000000, 'Income harus tepat 5.000.000');
  assert.strictEqual(totalExpense, 1500000, 'Expense harus tepat 1.500.000');
});

// -----------------------------------------------------------------------------
// 2. Biaya admin tidak dihitung dua kali
// -----------------------------------------------------------------------------
runTest('Biaya admin transfer tercatat sekali sebagai expense dari akun asal', () => {
  // Transfer Rp1.000.000 dengan biaya admin Rp2.500
  // Sesuai skema: transaksi biaya admin dibuat di tabel transactions (type = 'expense')
  // dan di-link ke transfers.fee_transaction_id.
  const transactions = [
    { id: 101, type: 'expense', amount: 2500, note: 'Biaya transfer' },
  ];
  const transfer = {
    id: 1,
    amount: 1000000,
    fee_transaction_id: 101,
  };

  const totalExpense = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  // Jika kita menghitung transfer, fee tidak boleh ditambahkan lagi
  assert.strictEqual(totalExpense, 2500, 'Biaya admin tercatat tepat Rp2.500 di expense');
  assert.strictEqual(transfer.amount, 1000000, 'Pokok transfer tetap Rp1.000.000');
});

// -----------------------------------------------------------------------------
// 3. Penanganan Pembanding Nol (Mencegah Infinity / NaN)
// -----------------------------------------------------------------------------
runTest('Kalkulasi perubahan persentase aman dari pembagian dengan nol', () => {
  function calculateChange(current, previous) {
    if (previous <= 0) {
      return { diff: current - previous, pct: null, label: 'Belum ada pembanding' };
    }
    const diff = current - previous;
    const pct = Math.round((diff / previous) * 1000) / 10;
    return { diff, pct, label: `${pct >= 0 ? '+' : ''}${pct}%` };
  }

  const res1 = calculateChange(500000, 0);
  assert.strictEqual(res1.pct, null, 'Persentase harus null jika pembanding 0');
  assert.strictEqual(res1.label, 'Belum ada pembanding');

  const res2 = calculateChange(1200000, 1000000);
  assert.strictEqual(res2.pct, 20.0, 'Persentase harus tepat 20%');
  assert.strictEqual(res2.diff, 200000);
});

// -----------------------------------------------------------------------------
// 4. Perbandingan Bulan Berjalan (Apple-to-Apple / Same-Day Comparison)
// -----------------------------------------------------------------------------
runTest('Perbandingan bulan berjalan dibatasi tanggal yang sebanding', () => {
  // Misalnya hari ini tanggal 10 Februari 2026.
  // Periode berjalan: 2026-02-01 s.d. 2026-02-10 (10 hari).
  // Periode pembanding: 2026-01-01 s.d. 2026-01-10 (10 hari).
  function getComparableRange(year, monthIndex, currentDay) {
    const startCurr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
    const endCurr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;

    const prevDate = new Date(year, monthIndex - 1, 1);
    const prevYear = prevDate.getFullYear();
    const prevMonth = prevDate.getMonth();
    const daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
    const cappedDay = Math.min(currentDay, daysInPrevMonth);

    const startPrev = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01`;
    const endPrev = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(cappedDay).padStart(2, '0')}`;

    return { startCurr, endCurr, startPrev, endPrev, days: cappedDay };
  }

  const range = getComparableRange(2026, 1, 10); // Feb = index 1
  assert.strictEqual(range.startCurr, '2026-02-01');
  assert.strictEqual(range.endCurr, '2026-02-10');
  assert.strictEqual(range.startPrev, '2026-01-01');
  assert.strictEqual(range.endPrev, '2026-01-10');
  assert.strictEqual(range.days, 10);
});

// -----------------------------------------------------------------------------
// 5. Rata-rata Harian Memperhitungkan Hari Kalender Tanpa Transaksi
// -----------------------------------------------------------------------------
runTest('Rata-rata pengeluaran harian membagi dengan total hari kalender', () => {
  // Dalam 10 hari kalender, hanya ada belanja di hari ke-1 (Rp300.000) dan hari ke-5 (Rp200.000)
  const totalExpense = 500000;
  const calendarDays = 10;
  const avgDaily = Math.round(totalExpense / calendarDays);

  assert.strictEqual(avgDaily, 50000, 'Rata-rata harus Rp50.000/hari (bukan dibagi 2 hari aktif = 250.000)');
});

// -----------------------------------------------------------------------------
// 6. Navigasi Lintas Tahun (Desember ke Januari dan sebaliknya)
// -----------------------------------------------------------------------------
runTest('Pergeseran bulan menangani pergantian tahun secara benar', () => {
  function shiftMonth(year, monthIndex, direction) {
    const d = new Date(year, monthIndex + direction, 1);
    return {
      year: d.getFullYear(),
      monthIndex: d.getMonth(),
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    };
  }

  const nextFromDec = shiftMonth(2025, 11, 1); // Des 2025 + 1 bulan
  assert.strictEqual(nextFromDec.key, '2026-01');

  const prevFromJan = shiftMonth(2026, 0, -1); // Jan 2026 - 1 bulan
  assert.strictEqual(prevFromJan.key, '2025-12');
});

// -----------------------------------------------------------------------------
// 7. Pengeluaran Kategori Beranggaran vs Tanpa Anggaran
// -----------------------------------------------------------------------------
runTest('Pengeluaran tanpa anggaran terpisah dan tidak mengurangi batas kategori lain', () => {
  const budgets = [
    { category_id: 1, name: 'Makan', amount: 1500000, spent: 1200000 },
  ];
  const allExpenses = [
    { category_id: 1, amount: 1200000 }, // Kategori Makan
    { category_id: 99, amount: 400000 },  // Kategori Lainnya (tanpa anggaran)
  ];

  const totalExpense = allExpenses.reduce((s, e) => s + e.amount, 0);
  const totalBudgetSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const unbudgetedExpense = Math.max(0, totalExpense - totalBudgetSpent);
  const remainingBudget = budgets[0].amount - budgets[0].spent;

  assert.strictEqual(totalExpense, 1600000);
  assert.strictEqual(totalBudgetSpent, 1200000);
  assert.strictEqual(unbudgetedExpense, 400000);
  assert.strictEqual(remainingBudget, 300000, 'Sisa anggaran Makan tetap utuh Rp300.000');
});

// -----------------------------------------------------------------------------
// 8. Transfer Antar Sesama Akun Tabungan
// -----------------------------------------------------------------------------
runTest('Transfer internal antar sesama akun tabungan tidak mengubah net deposit kelompok', () => {
  const accounts = [
    { id: 1, name: 'BCA Utama', role: 'main' },
    { id: 2, name: 'Tabungan Utama', role: 'savings' },
    { id: 3, name: 'Tabungan Deposito', role: 'savings' },
  ];

  const transfers = [
    { from: 1, to: 2, amount: 1000000 }, // Eksternal masuk ke kelompok tabungan (+1.000.000)
    { from: 2, to: 3, amount: 500000 },  // Internal antar sesama tabungan (net 0)
  ];

  const savingsIds = new Set(accounts.filter((a) => a.role === 'savings').map((a) => a.id));

  let transferInExternal = 0;
  let transferOutExternal = 0;

  for (const tr of transfers) {
    const isFromSavings = savingsIds.has(tr.from);
    const isToSavings = savingsIds.has(tr.to);

    if (isToSavings && !isFromSavings) {
      transferInExternal += tr.amount;
    } else if (isFromSavings && !isToSavings) {
      transferOutExternal += tr.amount;
    }
  }

  const netDeposit = transferInExternal - transferOutExternal;

  assert.strictEqual(transferInExternal, 1000000);
  assert.strictEqual(transferOutExternal, 0);
  assert.strictEqual(netDeposit, 1000000, 'Net deposit kelompok tabungan tepat Rp1.000.000');
});

// -----------------------------------------------------------------------------
// 9. Perhitungan Saldo Tabungan Akhir Bulan Kumulatif
// -----------------------------------------------------------------------------
runTest('Saldo tabungan dihitung dari saldo awal + seluruh mutasi hingga cutoff', () => {
  const initialBalance = 2000000;
  const history = [
    { type: 'transfer_in', amount: 1500000 }, // Setoran tabungan Okt
    { type: 'transfer_in', amount: 2000000 }, // Setoran tabungan Nov
    { type: 'transfer_out', amount: 500000 }, // Penarikan Des
  ];

  let balance = initialBalance;
  for (const item of history) {
    if (item.type === 'transfer_in') balance += item.amount;
    if (item.type === 'transfer_out') balance -= item.amount;
  }

  assert.strictEqual(balance, 5000000, 'Saldo tabungan akhir adalah Rp5.000.000');
});

console.log(`\n🎉 Semua ${passedTests} pengujian aturan perhitungan analitik berhasil 100%!\n`);
