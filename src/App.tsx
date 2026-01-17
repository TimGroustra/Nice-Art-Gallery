import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import GalleryConfig from "./pages/GalleryConfig";
import UserPortal from "./pages/UserPortal";
import AvatarConfig from "./pages/AvatarConfig";
import MobileGallery from "./pages/MobileGallery";
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from '@/integrations/wagmi/config';

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <WagmiProvider config={wagmiConfig}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/mobile" element={<MobileGallery />} />
            <Route path="/portal" element={<UserPortal />} />
            <Route path="/login" element={<UserPortal />} /> {/* Aliasing login to portal for compatibility */}
            <Route path="/gallery-config" element={<GalleryConfig />} />
            <Route path="/avatar-config" element={<AvatarConfig />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </WagmiProvider>
  </QueryClientProvider>
);

export default App;