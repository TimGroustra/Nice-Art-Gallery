import { serve } from "https://deno.land/std@0.190.0/http/server.ts"

const TG_TOKEN_GALLERY = Deno.env.get("TG_TOKEN_GALLERY");
const BASE_URL = `https://api.telegram.org/bot${TG_TOKEN_GALLERY}`;
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
    const message = update.message || update.edited_message;
    
    if (!message || !message.text) {
      return new Response("ok", { headers: corsHeaders });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();
    const firstName = message.from?.first_name || "Artist";

    // When user clicks the mandatory Start button, send the description and launch button
    if (text.startsWith("/start")) {
      const description = "Step inside a fully immersive 3D digital museum. Explore curated NFT collections from the Electroneum blockchain in a high-fidelity virtual environment.";
      
      await fetch(`${BASE_URL}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `Welcome to the Nice Art Gallery, ${firstName}! 🎨\n\n${description}\n\nClick below to enter the 3D experience.`,
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
    return new Response("ok", { headers: corsHeaders });
  }
})