import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

interface BackgroundMusicHandles {
  play: () => void;
  pause: () => void;
  toggleMute: () => void;
  isMuted: () => boolean;
}

const MUSIC_URL = "/audio/canvas-dreams.mp3";

const BackgroundMusic = forwardRef<BackgroundMusicHandles, {}>((props, ref) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(MUSIC_URL);
    audio.loop = true;
    audio.volume = 0.3; // Reasonable background volume
    audio.muted = true; // Start muted by default for better UX
    audioRef.current = audio;

    // Start automatically for mobile devices in unified mode
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      // Mobile starts automatically after user interaction is detected
      const startOnInteraction = () => {
        audio.play().catch(e => console.error("Mobile autoplay failed:", e));
        document.removeEventListener('touchstart', startOnInteraction);
      };
      document.addEventListener('touchstart', startOnInteraction);
    }

    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    play: () => {
      if (audioRef.current) {
        audioRef.current.play().catch(e => console.error("Play failed:", e));
      }
    },
    pause: () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    },
    toggleMute: () => {
      if (audioRef.current) {
        audioRef.current.muted = !audioRef.current.muted;
      }
    },
    isMuted: () => {
      return audioRef.current?.muted ?? true;
    }
  }));

  return null; // No visible UI
});

export default BackgroundMusic;