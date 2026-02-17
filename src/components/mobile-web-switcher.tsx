import { Monitor, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import './mobile-preview.css';

type ViewMode = 'web' | 'mobile';

interface MobileWebSwitcherProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  className?: string;
}

export function MobileWebSwitcher({ viewMode, onViewModeChange, className }: MobileWebSwitcherProps) {
  const handleModeChange = (mode: ViewMode) => {
    onViewModeChange(mode);
    
    // Update viewport meta tag for mobile preview
    const viewport = document.querySelector('meta[name="viewport"]') as HTMLMetaElement;
    if (viewport) {
      if (mode === 'mobile') {
        viewport.content = 'width=375, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
      } else {
        viewport.content = 'width=device-width, initial-scale=1.0';
      }
    }
    
    // Add custom class to body for mobile preview styling
    if (mode === 'mobile') {
      document.body.classList.add('mobile-preview');
    } else {
      document.body.classList.remove('mobile-preview');
    }
  };

  return (
    <div className={cn("flex items-center gap-1 p-1 bg-bg-4 dark:bg-bg-2 rounded-lg border border-accent/20", className)}>
      <button
        onClick={() => handleModeChange('web')}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
          viewMode === 'web'
            ? "bg-accent text-white shadow-sm"
            : "text-text-secondary hover:text-text-primary hover:bg-bg-3 dark:hover:bg-bg-1"
        )}
        title="Web view"
      >
        <Monitor className="w-4 h-4" />
        <span className="hidden sm:inline">Web</span>
      </button>
      
      <button
        onClick={() => handleModeChange('mobile')}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
          viewMode === 'mobile'
            ? "bg-accent text-white shadow-sm"
            : "text-text-secondary hover:text-text-primary hover:bg-bg-3 dark:hover:bg-bg-1"
        )}
        title="Mobile view"
      >
        <Smartphone className="w-4 h-4" />
        <span className="hidden sm:inline">Mobile</span>
      </button>
    </div>
  );
}
