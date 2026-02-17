import { ReactNode } from 'react';
import { useMobileView } from '@/contexts/mobile-view-context';
import { cn } from '@/lib/utils';

interface MobilePreviewWrapperProps {
  children: ReactNode;
  className?: string;
}

export function MobilePreviewWrapper({ children, className }: MobilePreviewWrapperProps) {
  const { isMobilePreview } = useMobileView();

  if (isMobilePreview) {
    return (
      <div className={cn("flex justify-center items-center min-h-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 p-8", className)}>
        <div className="relative">
          {/* Phone shadow */}
          <div className="absolute -inset-1 bg-black/20 rounded-[3rem] blur-xl"></div>
          
          {/* Phone frame */}
          <div className="relative mx-auto bg-black border-[12px] border-black rounded-[3rem] h-[700px] w-[350px] shadow-2xl">
            {/* Phone screen bezel */}
            <div className="absolute inset-0 bg-black rounded-[2.5rem] p-2">
              {/* Screen */}
              <div className="relative w-full h-full bg-white dark:bg-gray-900 rounded-[2rem] overflow-hidden">
                {/* Status bar area */}
                <div className="absolute top-0 left-0 right-0 h-8 bg-black dark:bg-black rounded-t-[2rem] flex items-center justify-center">
                  {/* Notch */}
                  <div className="w-32 h-6 bg-black rounded-full"></div>
                </div>
                
                {/* Content area */}
                <div className="h-full pt-8 overflow-hidden">
                  <div className="h-full overflow-y-auto scrollbar-hide">
                    {children}
                  </div>
                </div>
                
                {/* Home indicator */}
                <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-gray-600 dark:bg-gray-400 rounded-full"></div>
              </div>
            </div>
            
            {/* Side buttons */}
            <div className="absolute right-0 top-24 w-1 h-12 bg-gray-900 rounded-l-full"></div>
            <div className="absolute right-0 top-40 w-1 h-12 bg-gray-900 rounded-l-full"></div>
            <div className="absolute left-0 top-32 w-1 h-16 bg-gray-900 rounded-r-full"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("w-full h-full", className)}>
      {children}
    </div>
  );
}
