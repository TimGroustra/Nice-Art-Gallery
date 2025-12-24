import * as React from "react";

const MOBILE_BREAKPOINT = 1024; // Use a larger breakpoint for general mobile/tablet detection

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined,
  );

  React.useEffect(() => {
    // Check if window is defined (client-side only)
    if (typeof window === 'undefined') {
        setIsMobile(false); // Assume desktop if SSR
        return;
    }
    
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Return true only if explicitly detected as mobile, otherwise false (for SSR/initial render)
  if (isMobile === undefined) return false;
  return isMobile;
}