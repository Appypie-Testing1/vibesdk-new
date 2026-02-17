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
    <div className={cn("relative flex items-center bg-gray-100 dark:bg-gray-800 rounded-full p-1 shadow-inner", className)}>
      {/* Sliding indicator */}
      <div 
        className={cn(
          "absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white dark:bg-gray-700 rounded-full shadow-sm transition-all duration-300 ease-out",
          viewMode === 'web' ? 'left-1' : 'left-[calc(50%+1px)]'
        )}
      />
      
      <button
        onClick={() => handleModeChange('web')}
        className={cn(
          "relative z-10 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 min-w-0",
          viewMode === 'web'
            ? "text-gray-900 dark:text-white"
            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        )}
        title="Web view"
      >
        <Monitor className="w-4 h-4 flex-shrink-0" />
        <span className="hidden sm:inline truncate">Web</span>
      </button>
      
      <button
        onClick={() => handleModeChange('mobile')}
        className={cn(
          "relative z-10 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 min-w-0",
          viewMode === 'mobile'
            ? "text-gray-900 dark:text-white"
            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        )}
        title="Mobile view"
      >
        <Smartphone className="w-4 h-4 flex-shrink-0" />
        <span className="hidden sm:inline truncate">Mobile</span>
      </button>
    </div>
  );
}
