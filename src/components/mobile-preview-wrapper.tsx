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
      <div className={cn("flex justify-center items-center min-h-full bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-8", className)}>
        <div className="relative">
          {/* Ambient shadow */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-purple-400/20 rounded-[3rem] blur-3xl transform scale-105"></div>
          
          {/* Phone frame */}
          <div className="relative mx-auto bg-gradient-to-b from-gray-900 to-black border-[2px] border-gray-800 rounded-[3rem] h-[750px] w-[375px] shadow-2xl">
            {/* Screen bezel */}
            <div className="absolute inset-1 bg-black rounded-[2.8rem] p-1.5">
              {/* Screen */}
              <div className="relative w-full h-full bg-white dark:bg-black rounded-[2.5rem] overflow-hidden">
                {/* Status bar area */}
                <div className="absolute top-0 left-0 right-0 h-11 bg-black/95 backdrop-blur-xl rounded-t-[2.5rem] flex items-center justify-center z-10">
                  {/* Dynamic island */}
                  <div className="w-40 h-7 bg-black rounded-full shadow-inner flex items-center justify-center">
                    <div className="w-32 h-5 bg-gray-900 rounded-full"></div>
                  </div>
                </div>
                
                {/* Content area */}
                <div className="h-full pt-11 overflow-hidden">
                  <div className="h-full overflow-y-auto scrollbar-hide bg-white dark:bg-gray-950">
                    {children}
                  </div>
                </div>
                
                {/* Home indicator */}
                <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-gray-600/50 dark:bg-gray-400/50 rounded-full backdrop-blur-sm"></div>
              </div>
            </div>
            
            {/* Side buttons */}
            <div className="absolute right-0 top-32 w-0.5 h-14 bg-gray-700/80 rounded-l-full backdrop-blur-sm"></div>
            <div className="absolute right-0 top-52 w-0.5 h-10 bg-gray-700/80 rounded-l-full backdrop-blur-sm"></div>
            <div className="absolute right-0 top-64 w-0.5 h-6 bg-gray-700/80 rounded-l-full backdrop-blur-sm"></div>
            <div className="absolute left-0 top-40 w-0.5 h-20 bg-gray-700/80 rounded-r-full backdrop-blur-sm"></div>
            
            {/* Top speaker */}
            <div className="absolute top-2 left-1/2 transform -translate-x-1/2 w-24 h-4 bg-gray-900/60 rounded-full"></div>
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
