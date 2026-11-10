import { DefaultTheme, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';

import AppTabs from '@/components/app-tabs-shared';
import { initializeDatabase } from '@/db/database';

export default function RootLayout() {
  return (
    <ThemeProvider value={DefaultTheme}>
      <SQLiteProvider
        databaseName="finance.db"
        onInit={initializeDatabase}
      >
        <AppTabs />
      </SQLiteProvider>
    </ThemeProvider>
  );
}