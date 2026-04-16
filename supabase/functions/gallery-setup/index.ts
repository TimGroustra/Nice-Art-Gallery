import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const BOT_TOKEN = Deno.env.get("TG_TOKEN_GALLERY");
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;
// You'll need to provide your Supabase Project Ref here or use env var
const PROJECT_REF = "your-project-ref"; 
const WEBHOOK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/gallery-bot`;
const APP_URL = "https://nice-art-gallery.vercel.app/"; 

serve(async (req) => {
  try {
    console.log("[gallery-setup] Configuring NiceArtGalleryBot...");

    // 1. Set the Webhook
    await fetch(`${BASE_URL}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        url: WEBHOOK_URL, 
        drop_pending_updates: true,
        allowed_updates: ["message"]
      })
    });

    // 2. Set the Menu Button
    await fetch(`${BASE_URL}/setChatMenuButton`, {
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

    // 3. Set Bot Commands
    await fetch(`${BASE_URL}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: "start", description: "Enter the gallery" },
          { command: "launch", description: "Quick launch 3D experience" }
        ]
      })
    });

    // 4. Set Description
    await fetch(`${BASE_URL}/setMyDescription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: "Welcome to the Nice Art Gallery. Step inside a fully immersive 3D digital museum where you can view and interact with unique NFT collections from the Electroneum blockchain."
      })
    });

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Nice Art Gallery Bot configured successfully" 
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("[gallery-setup] Setup failed", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
})