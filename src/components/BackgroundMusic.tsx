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
    audio.muted = true; // Start muted
    audioRef.current = audio;

    // Removed auto‑play on mount to avoid NotAllowedError on mobile.
    // Playback can now be triggered after a user interaction via the exposed play() method.

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