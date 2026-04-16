/**
 * Local Setup Script for NiceArt Gallery Bot
 * 
 * This script configures your Telegram bot's metadata and webhook.
 * Run this manually from your terminal: node scripts/setup-tg-bot.js
 */

// Replace this with your actual bot token if running locally
const TG_TOKEN_GALLERY = "8430889786:AAECtWQYbegwZ33h8SqQIripwwXsZtQ2TeE";
const BASE_URL = `https://api.telegram.org/bot${TG_TOKEN_GALLERY}`;
const APP_URL = "https://nice-art-gallery.vercel.app/"; 
const PROJECT_REF = "yvigiirlsdbhmmcqvznk"; 
const WEBHOOK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/gallery-bot`;

async function setupBot() {
  console.log("--- Configuring Nice Art Gallery Bot ---");

  try {
    // 1. Set Webhook
    const webhookRes = await fetch(`${BASE_URL}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        url: WEBHOOK_URL, 
        allowed_updates: ["message"],
        drop_pending_updates: true
      })
    });
    console.log("Webhook Set:", (await webhookRes.json()).ok ? "Success" : "Failed");

    // 2. Set Bot Description (Shown in the empty chat window before Start)
    const descRes = await fetch(`${BASE_URL}/setMyDescription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: "Step inside a fully immersive 3D digital museum. Explore curated NFT collections from the Electroneum blockchain in a high-fidelity virtual environment."
      })
    });
    console.log("Description Set:", (await descRes.json()).ok ? "Success" : "Failed");

    // 3. Set the Menu Button as a Web App
    const menuBtnRes = await fetch(`${BASE_URL}/setChatMenuButton`, {
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
    console.log("Menu Button Set:", (await menuBtnRes.json()).ok ? "Success" : "Failed");

    // 4. Clear Commands (to keep the UI clean)
    const commandsRes = await fetch(`${BASE_URL}/deleteMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    console.log("Commands Cleared:", (await commandsRes.json()).ok ? "Success" : "Failed");

    console.log("--- Configuration Complete ---");
  } catch (error) {
    console.error("Setup failed:", error);
  }
}

setupBot();