import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0d12",
        surface: "#151821",
        border: "#262a36",
        accent: "#7c5cff",
        accent2: "#22d3ee",
        ok: "#22c55e",
        warn: "#f59e0b",
        danger: "#ef4444",
        muted: "#8a93a6",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
