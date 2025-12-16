import { useState } from "react";
import { AvatarProfile } from "@/avatar/AvatarState";

/**
 * Custom hook for managing avatar state with history (undo).
 */
export function useAvatarStateEditor(initialState: AvatarProfile) {
  const [state, setState] = useState<AvatarProfile>(initialState);
  const [history, setHistory] = useState<AvatarProfile[]>([]);

  function update(next: AvatarProfile) {
    // Only push to history if the state actually changes (deep comparison is complex, shallow copy check is enough for now)
    if (JSON.stringify(state) !== JSON.stringify(next)) {
      setHistory(h => [...h, state]);
    }
    setState(next);
  }

  function undo() {
    setHistory(h => {
      const prev = h[h.length - 1];
      if (!prev) return h;
      setState(prev);
      return h.slice(0, -1);
    });
  }

  const canUndo = history.length > 0;

  return {
    state,
    update,
    undo,
    canUndo
  };
}