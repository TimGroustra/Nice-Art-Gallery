import { supabase } from "@/integrations/supabase/client";

export const botService = {
  /**
   * Triggers the Supabase Edge Function to push bot configuration to Telegram.
   */
  async syncBotConfig() {
    try {
      const { data, error } = await supabase.functions.invoke('gallery-setup', {
        method: 'POST'
      });
      if (error) throw error;
      return data;
    } catch (e) {
      console.error("Bot sync failed:", e);
      throw e;
    }
  }
};