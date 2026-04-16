import { serve } from "https://deno.land/std@0.190.0/http/server.ts"

const BOT_TOKEN = Deno.env.get("TG_TOKEN_GALLERY");
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;
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
    if (!BOT_TOKEN) throw new Error("TG_TOKEN_GALLERY secret is missing.");

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

    // 2. Set Bot Description (Shown before the user clicks Start)
    await fetch(`${BASE_URL}/setMyDescription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: "Step inside a fully immersive 3D digital museum. Explore curated NFT collections from the Electroneum blockchain in a high-fidelity virtual environment."
      })
    });

    // 3. Set Short Description (Shown on the bot's profile)
    await fetch(`${BASE_URL}/setMyShortDescription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        short_description: "Experience the future of digital art in a 3D NFT gallery."
      })
    });

    // 4. Set the Menu Button as a Web App
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

    // 5. Clear Commands
    await fetch(`${BASE_URL}/deleteMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Bot fully configured with descriptions, menu button, and webhook." 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 200, headers: corsHeaders });
  }
})