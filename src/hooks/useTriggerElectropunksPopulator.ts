import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const LOCAL_STORAGE_KEY = 'electropunks_populator_triggered';

export const useTriggerElectropunksPopulator = () => {
  useEffect(() => {
    const triggerPopulator = async () => {
      // Check if the populator has already been triggered in this browser
      if (localStorage.getItem(LOCAL_STORAGE_KEY)) {
        console.log('ElectroPunks populator has already been triggered for this session.');
        return;
      }

      console.log('Triggering Supabase function to populate ElectroPunks...');
      
      const { data, error } = await supabase.functions.invoke('populate-electropunks');

      if (error) {
        console.error('Error triggering ElectroPunks populator function:', error.message);
      } else {
        console.log('ElectroPunks populator function triggered successfully:', data.message);
        // Mark as triggered to avoid re-running
        localStorage.setItem(LOCAL_STORAGE_KEY, 'true');
      }
    };

    triggerPopulator();
  }, []);
};