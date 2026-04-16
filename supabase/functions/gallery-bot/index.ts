import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const BOT_TOKEN = Deno.env.get("TG_TOKEN_GALLERY");
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;
// Replace this with your actual production domain when deployed
const APP_URL = "https://nice-art-gallery.vercel.app/"; 

serve(async (req) => {
  try {
    const update = await req.json();
    console.log("[gallery-bot] Received update", update);

    if (!update.message) return new Response("ok");

    const chatId = update.message.chat.id;
    const text = update.message.text;
    const firstName = update.message.from.first_name;

    if (text === "/start" || text === "/launch") {
      await fetch(`${BASE_URL}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `Welcome to the Nice Art Gallery, ${firstName}! 🎨\n\nExplore curated NFT collections in an immersive 3D environment right here in Telegram.`,
          reply_markup: {
            inline_keyboard: [[
              { text: "🖼️ Launch Gallery", web_app: { url: APP_URL } }
            ]]
          }
        })
      });
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("[gallery-bot] Error handling update", e);
    return new Response(e.message, { status: 500 });
  }
})