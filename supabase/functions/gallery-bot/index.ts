import { serve } from "https://deno.land/std@0.190.0/http/server.ts"

const BOT_TOKEN = Deno.env.get("TG_TOKEN_GALLERY");
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;
const APP_URL = "https://nice-art-gallery.vercel.app/"; 

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method === 'GET') {
      return new Response(JSON.stringify({ status: "ok", bot_configured: !!BOT_TOKEN }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const update = await req.json();
    console.log("[gallery-bot] Received update:", JSON.stringify(update));

    const message = update.message || update.edited_message;
    if (!message || !message.text) {
      return new Response("ok", { headers: corsHeaders });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();
    const firstName = message.from?.first_name || "Artist";

    // Handle /start and /launch commands specifically
    if (text.startsWith("/start") || text.startsWith("/launch")) {
      const responseText = `Welcome to the Nice Art Gallery, ${firstName}! 🎨\n\nStep inside a fully immersive 3D digital museum where you can explore curated NFT collections from the Electroneum blockchain.\n\nUse the button below to launch the experience directly in Telegram.`;
      
      await fetch(`${BASE_URL}/sendMessage`, {
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
    }

    return new Response("ok", { headers: corsHeaders });
  } catch (e) {
    console.error("[gallery-bot] Critical Error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 200, 
      headers: corsHeaders 
    });
  }
})