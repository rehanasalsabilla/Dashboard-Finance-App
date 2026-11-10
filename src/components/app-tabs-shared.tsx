import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function AppTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0B7055',
        tabBarInactiveTintColor: '#738078',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E6ECE8',
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Beranda',
          tabBarIcon: ({ color }) => (
            <Text style={[styles.icon, { color }]}>⌂</Text>
          ),
        }}
      />

      <Tabs.Screen
        name="transaksi"
        options={{
          title: 'Transaksi',
          tabBarIcon: ({ color }) => (
            <Text style={[styles.icon, { color }]}>≡</Text>
          ),
        }}
      />

      <Tabs.Screen
        name="tambah"
        options={{
          title: 'Tambah transaksi',
          tabBarShowLabel: false,
          tabBarLabel: () => null,
          tabBarAccessibilityLabel: 'Tambah transaksi',
          tabBarIcon: () => (
            <View style={styles.addButton}>
              <Text style={styles.addIcon}>+</Text>
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="anggaran"
        options={{
          title: 'Anggaran',
          tabBarIcon: ({ color }) => (
            <Text style={[styles.icon, { color }]}>◷</Text>
          ),
        }}
      />

      <Tabs.Screen
        name="laporan"
        options={{
          title: 'Analitik',
          tabBarIcon: ({ color }) => (
            <Text style={[styles.icon, { color }]}>▥</Text>
          ),
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="dompet"
        options={{
          title: 'Dompet',
          tabBarButton: () => null,
          tabBarItemStyle: {
            display: 'none',
          },
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  icon: {
    fontSize: 26,
    fontWeight: '400',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0B7055',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIcon: {
    color: '#FFFFFF',
    fontSize: 30,
    lineHeight: 34,
  },
});