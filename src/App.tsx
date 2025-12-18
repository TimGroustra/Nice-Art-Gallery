import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import GalleryConfig from "./pages/GalleryConfig";
import Login from "./pages/Login";
import AvatarCreator from "./pages/AvatarCreator"; // New import
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from '@/integrations/wagmi/config';

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <WagmiProvider config={wagmiConfig}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/gallery-config" element={<GalleryConfig />} />
            <Route path="/avatar-creator" element={<AvatarCreator />} /> {/* New route */}
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </WagmiProvider>
  </QueryClientProvider>
);

export default App;