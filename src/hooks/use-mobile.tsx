import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(
    window.innerWidth < MOBILE_BREAKPOINT
  );

  React.useEffect(() => {
    const check = () => {
      const isNarrow = window.innerWidth < MOBILE_BREAKPOINT;
      const isTelegram = !!window.Telegram?.WebApp?.initData;
      setIsMobile(isNarrow || isTelegram);
    };
    
    window.addEventListener("resize", check);
    check();
    
    return () => window.removeEventListener("resize", check);
  }, []);

  return isMobile;
}