export type ShieldMode = "excluded" | "black-box" | "unsupported";

export interface ShieldCapability {
  mode: ShieldMode;
  /** What a screen share / recording / screenshot shows when the shield is on. */
  capturesShow: string;
  /** What the user's own display shows when the shield is on. */
  localShows: string;
  osVersion: string;
}

/**
 * What Electron's setContentProtection can actually deliver on this OS. On Windows it maps to
 * SetWindowDisplayAffinity: WDA_EXCLUDEFROMCAPTURE (window removed from captures entirely, still
 * visible on the local display) needs Windows 10 2004 (build 19041) or newer; older builds fall
 * back to WDA_MONITOR, where captures show a black rectangle instead. macOS disables window
 * sharing outright. Linux (X11) has no equivalent, so the shield is a no-op there.
 */
export function shieldCapability(): ShieldCapability {
  const osVersion = process.getSystemVersion();
  if (process.platform === "win32") {
    const build = Number(osVersion.split(".")[2] ?? 0);
    if (build >= 19041) {
      return {
        mode: "excluded",
        capturesShow:
          "The window is removed entirely from screen shares, recordings, and screenshots — viewers see your other windows, not this one.",
        localShows: "Fully visible on your display, exactly like a normal window.",
        osVersion,
      };
    }
    return {
      mode: "black-box",
      capturesShow:
        "Captures show a black rectangle where the window is (legacy Windows fallback — update to Windows 10 2004+ for full exclusion).",
      localShows: "Visible on your primary monitor only.",
      osVersion,
    };
  }
  if (process.platform === "darwin") {
    return {
      mode: "excluded",
      capturesShow:
        "The window is removed entirely from screen shares, recordings, and screenshots — viewers see your other windows, not this one.",
      localShows: "Fully visible on your display, exactly like a normal window.",
      osVersion,
    };
  }
  return {
    mode: "unsupported",
    capturesShow: "The window is captured like any other window — this platform has no capture exclusion.",
    localShows: "Visible, but the shield cannot hide it from captures on this platform.",
    osVersion,
  };
}
