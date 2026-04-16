import { serve } from "https://deno.land/std@0.190.0/http/server.ts"

const BOT_TOKEN = Deno.env.get("TG_TOKEN_GALLERY");
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;
const PROJECT_REF = "yvigiirlsdbhmmcqvznk"; 
const WEBHOOK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/gallery-bot`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    console.log("[gallery-setup] Cleaning up bot configuration...");
    
    if (!BOT_TOKEN) {
      throw new Error("TG_TOKEN_GALLERY secret is missing from Supabase.");
    }

    // 1. Set the Webhook
    const webhookRes = await fetch(`${BASE_URL}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        url: WEBHOOK_URL, 
        drop_pending_updates: true,
        allowed_updates: ["message"]
      })
    });
    const webhookData = await webhookRes.json();

    // 2. Remove the Menu Button (Reset to default)
    const menuRes = await fetch(`${BASE_URL}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menu_button: { type: "default" }
      })
    });
    const menuData = await menuRes.json();

    // 3. Remove Bot Commands
    const commandsRes = await fetch(`${BASE_URL}/deleteMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const commandsData = await commandsRes.json();

    return new Response(JSON.stringify({ 
      success: true, 
      webhook: webhookData,
      menu: menuData,
      commands: commandsData,
      message: "Bot configuration cleaned. Commands and menu button removed."
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("[gallery-setup] Setup failed:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
})