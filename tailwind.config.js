/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        raised: "rgb(var(--raised) / <alpha-value>)",
        fg: "rgb(var(--fg) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        faint: "rgb(var(--faint) / <alpha-value>)",
        hairline: "rgb(var(--hairline) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          strong: "rgb(var(--accent-strong) / <alpha-value>)",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
          fg: "rgb(var(--accent-fg) / <alpha-value>)",
        },
        gold: "rgb(var(--gold) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
      },
      fontFamily: {
        display: ['"Outfit"', "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        sans: ['"Geist"', "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ['"Geist Mono"', "ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
      boxShadow: {
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)",
        glow: "var(--shadow-glow)",
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
      },
      animation: {
        rise: "rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) both",
        "pulse-soft": "pulse-soft 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
