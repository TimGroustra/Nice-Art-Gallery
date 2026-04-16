import { serve } from "https://deno.land/std@0.190.0/http/server.ts"

const TG_TOKEN_GALLERY = Deno.env.get("TG_TOKEN_GALLERY");
const BASE_URL = `https://api.telegram.org/bot${TG_TOKEN_GALLERY}`;
const APP_URL = "https://nice-art-gallery.vercel.app/"; 
const PROJECT_REF = "yvigiirlsdbhmmcqvznk"; 
const WEBHOOK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/gallery-bot`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    if (!TG_TOKEN_GALLERY) throw new Error("TG_TOKEN_GALLERY secret is missing.");

    // 1. Set Webhook
    await fetch(`${BASE_URL}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        url: WEBHOOK_URL, 
        allowed_updates: ["message"],
        drop_pending_updates: true
      })
    });

    // 2. Set Bot Description (This text shows automatically in the empty chat window)
    await fetch(`${BASE_URL}/setMyDescription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: "Step inside a fully immersive 3D digital museum. Explore curated NFT collections from the Electroneum blockchain in a high-fidelity virtual environment."
      })
    });

    // 3. Set the Menu Button as a Web App
    await fetch(`${BASE_URL}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menu_button: {
          type: "web_app",
          text: "Launch Gallery",
          web_app: { url: APP_URL }
        }
      })
    });

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Bot configured. The description will now show automatically in new chats." 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 200, headers: corsHeaders });
  }
})