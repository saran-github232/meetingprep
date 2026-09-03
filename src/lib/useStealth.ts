import { useCallback, useEffect, useRef, useState } from "react";
import type { ShieldCapability } from "../../electron/stealth";

/** Capture shield state (kept in sync with the Electron main process) plus what the OS can actually do. */
export function useStealth() {
  const [enabled, setEnabled] = useState(false);
  const [capability, setCapability] = useState<ShieldCapability | null>(null);
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
    window.api.stealth.capability().then(setCapability);
    return window.api.menu.onToggleStealth(toggle);
  }, [toggle]);

  return { stealth: enabled, toggleStealth: toggle, capability };
}
