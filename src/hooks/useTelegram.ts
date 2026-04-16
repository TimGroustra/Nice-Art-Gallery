import { useEffect, useState } from 'react';

export const useTelegram = () => {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      // Set theme colors for the gallery
      tg.setHeaderColor('#050505');
      tg.setBackgroundColor('#050505');
      
      if (tg.initDataUnsafe?.user) {
        setUser(tg.initDataUnsafe.user);
      }
    }
  }, []);

  const onClose = () => {
    window.Telegram?.WebApp.close();
  };

  return {
    tg: window.Telegram?.WebApp,
    user,
    onClose,
    startParam: window.Telegram?.WebApp?.initDataUnsafe?.start_param,
  };
};