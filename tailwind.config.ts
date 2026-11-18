import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-cairo)", "Tajawal", "sans-serif"],
        display: ["var(--font-tajawal)", "Cairo", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#f0f7ff", 100: "#dceafd", 200: "#bcd9fb", 300: "#8dbff8",
          400: "#589ef3", 500: "#327eed", 600: "#1d5fe0", 700: "#174bce",
          800: "#183fa6", 900: "#193883", 950: "#142550",
        },
      },
    },
  },
  plugins: [],
};
export default config;
