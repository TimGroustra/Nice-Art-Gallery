import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const BOT_TOKEN = Deno.env.get("TG_TOKEN_GALLERY");
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;
const PROJECT_REF = "yvigiirlsdbhmmcqvznk"; 
const WEBHOOK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/gallery-bot`;
const APP_URL = "https://nice-art-gallery.vercel.app/"; 

serve(async (req) => {
  try {
    console.log("[gallery-setup] Initializing configuration...");
    
    if (!BOT_TOKEN) {
      console.error("[gallery-setup] ERROR: TG_TOKEN_GALLERY secret is missing!");
      return new Response(JSON.stringify({ error: "TG_TOKEN_GALLERY secret is not set in Supabase." }), { status: 500 });
    }

    console.log("[gallery-setup] Webhook URL:", WEBHOOK_URL);

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
    console.log("[gallery-setup] Webhook result:", webhookData);

    // 2. Set the Menu Button
    const menuRes = await fetch(`${BASE_URL}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menu_button: {
          type: "web_app",
          text: "🎨 Gallery",
          web_app: { url: APP_URL }
        }
      })
    });
    const menuData = await menuRes.json();

    // 3. Set Bot Commands
    const commandsRes = await fetch(`${BASE_URL}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: "start", description: "Enter the gallery" },
          { command: "launch", description: "Quick launch 3D experience" }
        ]
      })
    });
    const commandsData = await commandsRes.json();

    return new Response(JSON.stringify({ 
      success: true, 
      webhook: webhookData,
      menu: menuData,
      commands: commandsData,
      message: "Bot configuration updated successfully."
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("[gallery-setup] Setup failed:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
})