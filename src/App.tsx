import { Outlet } from 'react-router';
import { AuthProvider } from './contexts/auth-context';
import { AuthModalProvider } from './components/auth/AuthModalProvider';
import { ThemeProvider } from './contexts/theme-context';
import { MobileViewProvider } from './contexts/mobile-view-context';
import { VaultProvider } from './contexts/vault-context';
import { Toaster } from './components/ui/sonner';
import { AppLayout } from './components/layout/app-layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FeatureProvider } from './features';
import { useAppDatabaseInit } from './hooks/use-app-database-init';

function AppContent() {
  // Initialize database when apps are created
  useAppDatabaseInit();

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <MobileViewProvider>
          <FeatureProvider>
            <AuthProvider>
              <VaultProvider>
                <AuthModalProvider>
                  <AppContent />
                  <Toaster richColors position="top-right" />
                </AuthModalProvider>
              </VaultProvider>
            </AuthProvider>
          </FeatureProvider>
        </MobileViewProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
