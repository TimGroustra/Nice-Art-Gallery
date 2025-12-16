import { useState } from "react";
import { AvatarState } from "@/avatar/AvatarState";

/**
 * Custom hook for managing avatar state with history (undo).
 */
export function useAvatarStateEditor(initialState: AvatarState) {
  const [state, setState] = useState<AvatarState>(initialState);
  const [history, setHistory] = useState<AvatarState[]>([]);

  function update(next: AvatarState) {
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

  return { state, update, undo, canUndo };
}