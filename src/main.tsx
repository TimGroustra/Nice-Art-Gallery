import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./globals.css";
import { WalletProvider } from "./context/WalletContext.tsx";

createRoot(document.getElementById("root")!).render(
  <WalletProvider>
    <App />
  </WalletProvider>,
);