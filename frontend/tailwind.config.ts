import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#0a0d12",
        panel: "#10141c",
        panel2: "#161b25",
        border: "#1f2632",
        muted: "#8a93a6",
        text: "#e6e9ef",
        accent: "#f7931a", // Bitcoin orange
        accent2: "#facc15",
        success: "#22c55e",
        danger: "#ef4444",
        info: "#3b82f6",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(247,147,26,0.25), 0 8px 32px -8px rgba(247,147,26,0.35)",
      },
    },
  },
  plugins: [],
} satisfies Config;
