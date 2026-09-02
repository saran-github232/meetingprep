import { useCallback, useEffect, useRef, useState } from "react";

/** Capture shield state, kept in sync with the Electron main process. */
export function useStealth() {
  const [enabled, setEnabled] = useState(false);
  const enabledRef = useRef(false);

  const toggle = useCallback(() => {
    const next = !enabledRef.current;
    enabledRef.current = next;
    setEnabled(next);
    window.api.stealth.set(next);
  }, []);

  useEffect(() => {
    window.api.stealth.get().then((v) => {
      enabledRef.current = v;
      setEnabled(v);
    });
    return window.api.menu.onToggleStealth(toggle);
  }, [toggle]);

  return { stealth: enabled, toggleStealth: toggle };
}
