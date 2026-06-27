import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1280px" } },
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1A56DB",
          50: "#EBF1FE",
          100: "#D7E2FD",
          200: "#AFC6FB",
          300: "#86A9F8",
          400: "#5E8DF6",
          500: "#1A56DB",
          600: "#1547B2",
          700: "#103889",
          800: "#0B2960",
          900: "#061A37",
        },
        border: "hsl(214 32% 91%)",
        input: "hsl(214 32% 91%)",
        ring: "#1A56DB",
        background: "hsl(0 0% 100%)",
        foreground: "hsl(222 47% 11%)",
        muted: { DEFAULT: "hsl(210 40% 96%)", foreground: "hsl(215 16% 47%)" },
        destructive: { DEFAULT: "hsl(0 72% 51%)", foreground: "hsl(0 0% 100%)" },
        success: { DEFAULT: "hsl(142 71% 45%)", foreground: "hsl(0 0% 100%)" },
        warning: { DEFAULT: "hsl(38 92% 50%)", foreground: "hsl(0 0% 100%)" },
        card: { DEFAULT: "hsl(0 0% 100%)", foreground: "hsl(222 47% 11%)" },
        paper: "#FAFAF8",
        ink: "#16181D",
        hairline: "#E7E5E0",
      },
      fontFamily: {
        sans: [
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Roboto",
          "sans-serif",
        ],
      },
      borderRadius: { lg: "0.625rem", md: "0.5rem", sm: "0.375rem" },
    },
  },
  plugins: [],
};

export default config;
