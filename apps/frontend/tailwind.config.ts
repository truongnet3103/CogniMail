import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#f3f5f7",
        panel: "#ffffff",
        ink: "#121212",
        accent: "#0a7d5d",
        border: "#d6dde3",
      },
    },
  },
  plugins: [],
};

export default config;
