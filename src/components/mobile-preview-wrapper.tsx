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
      <div className={cn("flex justify-center items-center min-h-full bg-bg-2 dark:bg-bg-3 p-4", className)}>
        <div className="relative">
          {/* Phone frame */}
          <div className="relative mx-auto border-gray-800 dark:border-gray-800 bg-gray-800 border-[8px] rounded-[2.5rem] h-[600px] w-[300px] shadow-xl">
            {/* Phone notch */}
            <div className="absolute top-0 inset-x-0 h-6 bg-gray-800 dark:bg-gray-800 rounded-b-[1.5rem]"></div>
            
            {/* Screen */}
            <div className="overflow-hidden h-[580px] w-[284px] rounded-[1.5rem] bg-white dark:bg-bg-1">
              <div className="h-full overflow-y-auto">
                {children}
              </div>
            </div>
          </div>
          
          {/* Phone stand */}
          <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-20 h-2 bg-gray-800 dark:bg-gray-800 rounded-full"></div>
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
