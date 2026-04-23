import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        industrial: {
          50: "#f5f7fa",
          100: "#dce3ec",
          200: "#b8c6d7",
          300: "#93aac1",
          400: "#6f8daa",
          500: "#567390",
          600: "#445d76",
          700: "#33465a",
          800: "#24313f",
          900: "#171f2b"
        }
      }
    }
  },
  plugins: []
};

export default config;
