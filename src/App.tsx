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

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <MobileViewProvider>
          <FeatureProvider>
            <AuthProvider>
              <VaultProvider>
                <AuthModalProvider>
                  <AppLayout>
                    <Outlet />
                  </AppLayout>
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
