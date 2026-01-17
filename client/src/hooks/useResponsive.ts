import { useState, useEffect } from 'react';

export type ScreenSize = 'mobile' | 'tablet' | 'desktop';

export function useResponsive() {
  const [screenSize, setScreenSize] = useState<ScreenSize>('desktop');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setScreenSize('mobile');
        setIsSidebarOpen(false);
      } else if (width < 1024) {
        setScreenSize('tablet');
        setIsSidebarOpen(false);
      } else {
        setScreenSize('desktop');
        setIsSidebarOpen(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    screenSize,
    isMobile: screenSize === 'mobile',
    isTablet: screenSize === 'tablet',
    isDesktop: screenSize === 'desktop',
    isSidebarOpen,
    setIsSidebarOpen,
    toggleSidebar: () => setIsSidebarOpen(prev => !prev)
  };
}
