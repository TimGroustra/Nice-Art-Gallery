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
      setIsMobile(isNarrow || isTouch);
    };
    
    mql.addEventListener("change", checkTouch);
    checkTouch();
    
    return () => mql.removeEventListener("change", checkTouch);
  }, []);

  return !!isMobile;
}