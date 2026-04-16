/**
 * Local Setup Script for NiceArtGalleryBot
 * 
 * Instructions:
 * 1. Ensure you have Node.js installed.
 * 2. Run: node scripts/setup-tg-bot.js
 */

const BOT_TOKEN = "8430889786:AAECtWQYbegwZ33h8SqQIripwwXsZtQ2TeE";
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function setupBot() {
  console.log("--- Cleaning NiceArtGalleryBot Configuration ---");

  try {
    // 1. Remove the Menu Button
    const menuBtnRes = await fetch(`${BASE_URL}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menu_button: { type: "default" }
      })
    });
    console.log("Menu Button Removed:", (await menuBtnRes.json()).ok ? "Success" : "Failed");

    // 2. Delete Bot Commands
    const commandsRes = await fetch(`${BASE_URL}/deleteMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    console.log("Commands Deleted:", (await commandsRes.json()).ok ? "Success" : "Failed");

    console.log("--- Cleanup Complete ---");
  } catch (error) {
    console.error("Cleanup failed:", error);
  }
}

setupBot();