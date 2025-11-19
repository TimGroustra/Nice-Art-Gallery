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
    audio.volume = 0.3; // Start at a reasonable background volume
    audio.muted = true; // Mute by default
    audioRef.current = audio;

    // Function to attempt playback after user interaction
    const attemptPlay = () => {
      if (audioRef.current) {
        audioRef.current.play().catch(e => {
          // console.warn("Autoplay blocked, waiting for user gesture:", e);
        });
      }
    };

    // Use pointerdown event on the window to capture the first user gesture
    const onFirstInteract = () => {
      attemptPlay();
      window.removeEventListener('pointerdown', onFirstInteract);
    };

    window.addEventListener('pointerdown', onFirstInteract, { once: true });

    return () => {
      window.removeEventListener('pointerdown', onFirstInteract);
      if (audio.paused === false) {
        audio.pause();
      }
      audio.currentTime = 0;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    play: () => {
      if (audioRef.current) {
        // Attempt to play only when explicitly called after user gesture (e.g., locking controls)
        audioRef.current.play().catch(e => console.error("Failed to play music after user gesture:", e));
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

  return null; // This component renders nothing visible
});

export default BackgroundMusic;