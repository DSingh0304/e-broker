import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pcb: {
          green: "#0F3B2C",
          copper: "#B87333",
          solder: "#C0C0C0",
          gold: "#EAD0AC",
          trace: "#165B45",
          accent: "#D98C53",
          accentHover: "#b77543"
        },
        // Shared surface + semantic tokens so `surface-*` / `brand-*`
        // classes used across admin, recyclers, scan and result views
        // resolve to the PCB palette instead of being purged.
        surface: {
          1: "#14402F",
          2: "#1B4D38",
          border: "#B87333",
        },
        brand: {
          green: "#35C26E",
          red: "#F87171",
          amber: "#FBBF24",
        },
        text: {
          secondary: "#B9C4B8",
        },
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          '"Segoe UI"',
          "Roboto",
          '"Noto Sans"',
          "sans-serif",
        ],
        mono: ['"Courier New"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
