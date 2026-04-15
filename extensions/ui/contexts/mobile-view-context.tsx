import { createContext, useContext, useState, ReactNode } from 'react';

type MobileViewMode = 'web' | 'mobile';

interface MobileViewContextType {
  mobileViewMode: MobileViewMode;
  setMobileViewMode: (mode: MobileViewMode) => void;
  isMobilePreview: boolean;
}

const MobileViewContext = createContext<MobileViewContextType | undefined>(undefined);

interface MobileViewProviderProps {
  children: ReactNode;
}

export function MobileViewProvider({ children }: MobileViewProviderProps) {
  const [mobileViewMode, setMobileViewMode] = useState<MobileViewMode>('web');

  const isMobilePreview = mobileViewMode === 'mobile';

  return (
    <MobileViewContext.Provider value={{ mobileViewMode, setMobileViewMode, isMobilePreview }}>
      {children}
    </MobileViewContext.Provider>
  );
}

export function useMobileView() {
  const context = useContext(MobileViewContext);
  if (context === undefined) {
    throw new Error('useMobileView must be used within a MobileViewProvider');
  }
  return context;
}
