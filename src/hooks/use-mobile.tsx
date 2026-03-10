import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const checkTouch = () => {
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isNarrow = window.innerWidth < MOBILE_BREAKPOINT;
      
      // More comprehensive mobile detection including tablets
      const isMobileDevice = 
        isNarrow || 
        isTouch ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      setIsMobile(isMobileDevice);
    };
    
    const handleResize = () => {
      checkTouch();
      // Use local variable instead of window property
      let resizeTimeout: NodeJS.Timeout;
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(checkTouch, 100);
    };

    mql.addEventListener("change", checkTouch);
    window.addEventListener("resize", handleResize);
    checkTouch();
    
    return () => {
      mql.removeEventListener("change", checkTouch);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return !!isMobile;
}