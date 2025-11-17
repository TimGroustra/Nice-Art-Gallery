import { supabase } from "@/integrations/supabase/client";

export type ProbeStatus = "available" | "unavailable" | "error" | "checking";

export interface ProbeResponse {
  status: ProbeStatus;
  reason?: string;
  probe?: string;
  url?: string;
}

/**
 * Calls the server-side market-probe Edge Function to check if an NFT exists on a marketplace.
 */
export async function probeMarketplaceServerSide(marketplace: string, collection: string, tokenId: string | number): Promise<ProbeResponse> {
  try {
    const { data, error } = await supabase.functions.invoke('market-probe', {
      method: 'POST',
      body: { marketplace, collection, tokenId: String(tokenId) },
    });

    if (error) {
      console.error("Supabase Edge Function error:", error);
      return { status: "error", reason: error.message };
    }
    
    // The data returned from the function is the JSON response body
    return data as ProbeResponse;

  } catch (e) {
    console.error("Client side error invoking Edge Function:", e);
    return { status: "error", reason: String(e) };
  }
}