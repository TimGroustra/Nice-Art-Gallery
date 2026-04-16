/**
 * Local Setup Script for NiceArtGalleryBot
 * 
 * Instructions:
 * 1. Ensure you have Node.js installed.
 * 2. Run: node scripts/setup-tg-bot.js
 */

const BOT_TOKEN = "8430889786:AAECtWQYbegwZ33h8SqQIripwwXsZtQ2TeE";
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;
const APP_URL = "https://nice-art-gallery.vercel.app/"; 

async function setupBot() {
  console.log("--- Configuring NiceArtGalleryBot ---");

  try {
    // 1. Set the Short Description (About)
    const shortDescRes = await fetch(`${BASE_URL}/setMyShortDescription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        short_description: "Immersive 3D NFT Gallery on Electroneum. Step inside and explore digital art like never before."
      })
    });
    console.log("Short Description:", (await shortDescRes.json()).ok ? "Success" : "Failed");

    // 2. Set the Description (What can this bot do?)
    const descRes = await fetch(`${BASE_URL}/setMyDescription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: "Welcome to the Nice Art Gallery. Step inside a fully immersive 3D digital museum where you can view and interact with unique NFT collections from the Electroneum blockchain.\n\nUse the 'Launch' button to start your journey."
      })
    });
    console.log("Description:", (await descRes.json()).ok ? "Success" : "Failed");

    // 3. Set the Menu Button (The big button next to the keyboard)
    const menuBtnRes = await fetch(`${BASE_URL}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menu_button: {
          type: "web_app",
          text: "🎨 Launch",
          web_app: { url: APP_URL }
        }
      })
    });
    console.log("Menu Button:", (await menuBtnRes.json()).ok ? "Success" : "Failed");

    // 4. Set Bot Commands
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
    console.log("Commands:", (await commandsRes.json()).ok ? "Success" : "Failed");

    console.log("--- Setup Complete ---");
  } catch (error) {
    console.error("Setup failed:", error);
  }
}

setupBot();