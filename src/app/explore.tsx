import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { clearDemoData, seedDemoData } from '@/analytics/demo-seed';

export default function ExploreScreen() {
  const db = useSQLiteContext();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  async function handleSeed() {
    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      await seedDemoData(db);
      setMessage(
        'Dataset demo sintetis berhasil dimuat! Buka menu Analitik atau Transaksi untuk melihat data.',
      );
    } catch (err) {
      console.error('Gagal memuat demo:', err);
      setIsError(true);
      setMessage(
        err instanceof Error ? err.message : 'Gagal memuat dataset demo.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      await clearDemoData(db);
      setMessage(
        'Data demo (BCA Utama, BCA Tabungan, GoPay beserta transaksi terkait) berhasil dibersihkan.',
      );
    } catch (err) {
      console.error('Gagal menghapus demo:', err);
      setIsError(true);
      setMessage(
        err instanceof Error ? err.message : 'Gagal menghapus data demo.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Developer & Demo Mode</Text>
        <Text style={styles.caption}>
          Halaman ini digunakan untuk mengelola data demo sintetis portofolio.
          Dataset sintetis mencakup transaksi 5 bulan (Oktober 2025 - Februari
          2026), 3 akun (BCA Utama, BCA Tabungan, GoPay), anggaran, dan biaya
          admin.
        </Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Kelola Dataset Portofolio</Text>
          <Text style={styles.cardDesc}>
            Data demo dirancang untuk menguji fitur Analitik: perbandingan antar
            bulan, kategori over budget, setoran bersih tabungan, dan insight
            otomatis.
          </Text>

          {message ? (
            <View
              style={[
                styles.messageBox,
                isError ? styles.errorBox : styles.successBox,
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  isError ? styles.errorText : styles.successText,
                ]}
              >
                {message}
              </Text>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#0B7055" />
              <Text style={styles.caption}>Sedang memproses database...</Text>
            </View>
          ) : (
            <View style={styles.btnColumn}>
              <Pressable
                onPress={handleSeed}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.primaryBtnText}>
                  📥 Muat Dataset Demo (Okt 2025 - Feb 2026)
                </Text>
              </Pressable>

              <Pressable
                onPress={handleClear}
                style={({ pressed }) => [
                  styles.dangerBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.dangerBtnText}>
                  🗑️ Hapus Dataset Demo
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Navigasi Cepat</Text>
          <Pressable
            onPress={() => router.push('/laporan')}
            style={styles.navLink}
          >
            <Text style={styles.navLinkText}>Buka Dashboard Analitik →</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/transaksi')}
            style={styles.navLink}
          >
            <Text style={styles.navLinkText}>Buka Riwayat Transaksi →</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/anggaran')}
            style={styles.navLink}
          >
            <Text style={styles.navLinkText}>Buka Anggaran →</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/dompet')}
            style={styles.navLink}
          >
            <Text style={styles.navLinkText}>Buka Dompet & Akun →</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F6F3' },
  content: { padding: 20, paddingBottom: 40, gap: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#102A23' },
  caption: { fontSize: 13, lineHeight: 20, color: '#738078' },
  card: {
    padding: 18,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    gap: 14,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#102A23' },
  cardDesc: { fontSize: 12, lineHeight: 18, color: '#55645B' },
  btnColumn: { gap: 10, marginTop: 4 },
  primaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#0B7055',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  dangerBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D94B20',
    alignItems: 'center',
    backgroundColor: '#FFF7F5',
  },
  dangerBtnText: {
    color: '#D94B20',
    fontWeight: '600',
    fontSize: 13,
  },
  pressed: { opacity: 0.8 },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  messageBox: {
    padding: 12,
    borderRadius: 12,
  },
  successBox: { backgroundColor: '#E8F5E9' },
  errorBox: { backgroundColor: '#FFEBEE' },
  messageText: { fontSize: 12, lineHeight: 18 },
  successText: { color: '#0B7055', fontWeight: '500' },
  errorText: { color: '#D94B20', fontWeight: '500' },
  navLink: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEF2EF',
  },
  navLinkText: {
    fontSize: 13,
    color: '#0B7055',
    fontWeight: '600',
  },
});
