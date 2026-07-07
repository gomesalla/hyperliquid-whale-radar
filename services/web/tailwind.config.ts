import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0e17",
        panel: "rgba(255,255,255,0.04)",
        long: "#16c784",
        longDeep: "#0b6e46",
        short: "#ea3943",
        shortDeep: "#8b1e26",
      },
    },
  },
  plugins: [],
} satisfies Config;
