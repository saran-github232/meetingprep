import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    window.api.settings.get("theme").then((stored) => {
      if (stored) setThemeState(stored as Theme);
    });
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark =
        theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", dark);
      setIsDark(dark);
    };
    apply();
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    window.api.settings.set("theme", t);
  };

  return { theme, setTheme, isDark };
}
