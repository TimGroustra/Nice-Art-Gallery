import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const BOT_TOKEN = Deno.env.get("TG_TOKEN_GALLERY");
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;
const APP_URL = "https://nice-art-gallery.vercel.app/"; 

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Basic health check for GET requests
    if (req.method === 'GET') {
      return new Response(JSON.stringify({ status: "ok", bot_configured: !!BOT_TOKEN }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const update = await req.json();
    console.log("[gallery-bot] Received update:", JSON.stringify(update));

    // Handle messages
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim().toLowerCase();
      const firstName = update.message.from.first_name;

      console.log(`[gallery-bot] Processing message: "${text}" from ${firstName} (ID: ${chatId})`);

      if (text.startsWith("/start") || text.startsWith("/launch")) {
        const responseText = `Welcome to the Nice Art Gallery, ${firstName}! 🎨\n\nStep inside a fully immersive 3D digital museum where you can explore curated NFT collections from the Electroneum blockchain.\n\nUse the button below to launch the experience directly in Telegram.`;
        
        console.log(`[gallery-bot] Sending welcome message to ${chatId}`);

        const res = await fetch(`${BASE_URL}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: responseText,
            reply_markup: {
              inline_keyboard: [[
                { text: "🖼️ Launch Gallery", web_app: { url: APP_URL } }
              ]]
            }
          })
        });
        
        const resData = await res.json();
        console.log("[gallery-bot] Telegram API response:", JSON.stringify(resData));
        
        if (!resData.ok) {
          console.error("[gallery-bot] Telegram error:", resData.description);
        }
      }
    }

    return new Response("ok", { headers: corsHeaders });
  } catch (e) {
    console.error("[gallery-bot] Critical Error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 200, // Still return 200 so Telegram doesn't retry infinitely
      headers: corsHeaders 
    });
  }
})