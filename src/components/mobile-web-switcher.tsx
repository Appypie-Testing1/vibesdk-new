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
      // Force iframe to recalculate size
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        (iframe as HTMLIFrameElement).style.transform = 'scale(1)';
        void (iframe as HTMLIFrameElement).offsetWidth; // Trigger reflow
        (iframe as HTMLIFrameElement).style.transform = '';
      });
    } else {
      document.body.classList.remove('mobile-preview');
    }
  };

  return (
    <div className={cn("flex items-center gap-0.5 p-0.5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm", className)}>
      <button
        onClick={() => handleModeChange('web')}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
          viewMode === 'web'
            ? "bg-blue-500 text-white shadow-md"
            : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        )}
        title="Web view"
      >
        <Monitor className="w-4 h-4" />
        <span className="hidden sm:inline">Web</span>
      </button>
      
      <button
        onClick={() => handleModeChange('mobile')}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
          viewMode === 'mobile'
            ? "bg-blue-500 text-white shadow-md"
            : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        )}
        title="Mobile view"
      >
        <Smartphone className="w-4 h-4" />
        <span className="hidden sm:inline">Mobile</span>
      </button>
    </div>
  );
}
