import NftGallery from "@/components/NftGallery";
import GalleryUI from "@/components/GalleryUI";
import BackgroundMusic from "@/components/BackgroundMusic";
import LoadingSplash from "@/components/LoadingSplash";
import React, { useState, useCallback, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { User, RefreshCw, Loader2, Sparkles } from "lucide-react";
import { useTelegram } from "@/hooks/useTelegram";
import { botService } from "@/services/botService";
import { toast } from "sonner";

interface BackgroundMusicHandles {
  play: () => void;
  pause: () => void;
  toggleMute: () => void;
  isMuted: () => boolean;
}

const Index = () => {
  const [instructionsVisible, setInstructionsVisible] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showAdmin, setShowAdmin] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const musicRef = useRef<BackgroundMusicHandles>(null);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { user, tg } = useTelegram();

  useEffect(() => {
    if (isMobile) {
      navigate('/mobile');
    }
  }, [isMobile, navigate]);

  useEffect(() => {
    (window as any).musicControls = {
      toggleMute: () => musicRef.current?.toggleMute(),
      isMuted: () => musicRef.current?.isMuted() ?? true,
    };
    return () => {
      delete (window as any).musicControls;
    };
  }, []);

  const handleSyncBot = async () => {
    setIsSyncing(true);
    try {
      const result = await botService.syncBotConfig();
      if (result.success) {
        toast.success("Bot configuration synced! Try sending /start to your bot.");
      } else {
        toast.error(`Sync failed: ${result.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      toast.error(`Error: ${e.message || 'Check your Supabase Secrets'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLockClick = useCallback(() => {
    const galleryControls = (window as any).galleryControls;
    if (galleryControls && galleryControls.lockControls) {
      galleryControls.lockControls();
    }
    musicRef.current?.play();
    
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred('medium');
    }
  }, [tg]);

  const handleLoadingComplete = useCallback(() => {
    setIsLoading(false);
  }, []);
  
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const galleryControls = (window as any).galleryControls;
      const musicControls = (window as any).musicControls;
      
      if (galleryControls?.isLocked?.() && musicControls && event.code === 'KeyM') {
        musicControls.toggleMute();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  if (isMobile) return null;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#050505]">
      {isLoading && <LoadingSplash progress={loadingProgress} />}
      
      <BackgroundMusic ref={musicRef} />

      <div className="fixed top-4 right-4 z-20 flex flex-col items-end gap-2">
        <div className="flex gap-2">
          {user && (
            <div 
              className="bg-black/50 backdrop-blur-sm border border-white/10 px-4 py-2 rounded-full flex items-center gap-2 cursor-pointer select-none"
              onClick={() => setShowAdmin(!showAdmin)}
            >
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-white uppercase">
                {user.first_name?.[0]}
              </div>
              <span className="text-xs font-bold text-white uppercase tracking-tighter">@{user.username || user.first_name}</span>
            </div>
          )}
          <Button asChild className="rounded-full shadow-lg">
            <Link to="/portal">
              <User className="mr-2 h-4 w-4" /> User Portal
            </Link>
          </Button>
        </div>

        {showAdmin && (
          <div className="bg-black/80 backdrop-blur-md border border-white/10 p-3 rounded-2xl w-48 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2 mb-2 text-white/40">
              <Sparkles size={12} />
              <span className="text-[10px] font-black uppercase tracking-widest">Admin Panel</span>
            </div>
            <Button 
              size="sm" 
              onClick={handleSyncBot}
              disabled={isSyncing}
              className="w-full text-[10px] font-bold uppercase h-8"
            >
              {isSyncing ? <Loader2 size={12} className="animate-spin mr-2" /> : <RefreshCw size={12} className="mr-2" />}
              Sync Telegram Bot
            </Button>
          </div>
        )}
      </div>
      
      <NftGallery 
        setInstructionsVisible={setInstructionsVisible}
        onLoadingProgress={setLoadingProgress}
        onLoadingComplete={handleLoadingComplete}
      />
      
      <GalleryUI 
        instructionsVisible={instructionsVisible} 
        onLockClick={handleLockClick}
      />
    </div>
  );
};

export default Index;