import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f7f6f2",
          100: "#ebe8e0",
          200: "#d7d1c4",
          300: "#b9ae99",
          400: "#90826c",
          500: "#6f624f",
          600: "#564a3c",
          700: "#41382d",
          800: "#2a241e",
          900: "#171411"
        },
        mist: {
          50: "#f5f8fb",
          100: "#e7eef5",
          200: "#d0deea",
          300: "#aac3d8",
          400: "#7a9dbb",
          500: "#587f9f",
          600: "#45657f",
          700: "#385166",
          800: "#314455",
          900: "#2c3946"
        },
        glow: {
          sand: "#fff4b8",
          mint: "#cff5c8",
          sky: "#cde7ff",
          rose: "#ffd2e8"
        }
      },
      boxShadow: {
        halo: "0 30px 80px rgba(41, 58, 86, 0.12)",
        float: "0 14px 34px rgba(39, 52, 72, 0.14)"
      },
      fontFamily: {
        sans: ['"Avenir Next"', '"Hiragino Sans"', '"Yu Gothic"', '"Noto Sans JP"', "sans-serif"],
        serif: ['"Iowan Old Style"', '"Palatino Linotype"', '"Yu Mincho"', '"Hiragino Mincho ProN"', "serif"]
      },
      keyframes: {
        drift: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-3px)" }
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(18px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        pulseSoft: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(255, 231, 135, 0.0)" },
          "50%": { boxShadow: "0 0 0 8px rgba(255, 231, 135, 0.14)" }
        }
      },
      animation: {
        drift: "drift 7s ease-in-out infinite",
        "fade-up": "fadeUp 0.8s cubic-bezier(.22,1,.36,1) both",
        "pulse-soft": "pulseSoft 1.2s ease-out"
      }
    }
  },
  plugins: []
};

export default config;
