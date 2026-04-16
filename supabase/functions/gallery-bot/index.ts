import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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
    const update = await req.json();
    console.log("[gallery-bot] Received update:", JSON.stringify(update));

    if (!update.message || !update.message.text) {
      return new Response("ok", { headers: corsHeaders });
    }

    const chatId = update.message.chat.id;
    const text = update.message.text.toLowerCase();
    const firstName = update.message.from.first_name;

    if (text.startsWith("/start") || text.startsWith("/launch")) {
      const responseText = `Welcome to the Nice Art Gallery, ${firstName}! 🎨\n\nStep inside a fully immersive 3D digital museum where you can explore curated NFT collections from the Electroneum blockchain.\n\nUse the button below to launch the experience directly in Telegram.`;
      
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
      console.log("[gallery-bot] Telegram API response:", resData);
    }

    return new Response("ok", { headers: corsHeaders });
  } catch (e) {
    console.error("[gallery-bot] Error handling update:", e);
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 200, // Return 200 to prevent Telegram from retrying failed requests
      headers: corsHeaders 
    });
  }
})