import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Primary Accent — Warm Coral
        primary: {
          DEFAULT: "#FF5C39",
          dark: "#E84A28",
          light: "#FFE8E0",
        },
        // Coral accent for negative values, group types
        coral: {
          DEFAULT: "#F43F5E",
          light: "#FCE7EC",
        },
        // Success — Warm Mint Green
        success: {
          DEFAULT: "#2D9B6B",
          dark: "#10B981",
        },
        // Semantic Colors
        warning: "#E8A33D",
        error: "#E04848",
        info: "#3B82F6",
        // Neutral — Warm tones
        neutral: {
          50: "#F9FAFB",
          100: "#F3F4F6",
          200: "#E8E0D2",
          300: "#D1D5DB",
          400: "#9CA3AF",
          500: "#756B5E",
          600: "#4B5563",
          700: "#374151",
          800: "#1F2937",
          900: "#1A1612",
        },
        // Dark Mode — Warm blacks/browns (was cool navy/slate)
        dark: {
          bg: "#14110D",
          "bg-secondary": "#1F1B16",
          "bg-tertiary": "#28231D",
          text: "#F5F1EA",
          "text-secondary": "#968A7B",
          "text-tertiary": "#8B8275",
          border: "#2D2620",
        },
        cream: "#F7F4EE",
        navy: {
          DEFAULT: "#1F1B16",
          deep: "#14110D",
        },
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        sans: ["var(--font-plus-jakarta)", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "SF Mono", "monospace"],
      },
      fontSize: {
        h1: ["30px", { lineHeight: "1.2", fontWeight: "700" }],
        h2: ["26px", { lineHeight: "1.3", fontWeight: "600" }],
        h3: ["22px", { lineHeight: "1.4", fontWeight: "600" }],
        h4: ["18px", { lineHeight: "1.4", fontWeight: "500" }],
        "body-lg": ["17px", { lineHeight: "1.6", fontWeight: "400" }],
        body: ["16px", { lineHeight: "1.6", fontWeight: "400" }],
        "body-sm": ["14px", { lineHeight: "1.5", fontWeight: "400" }],
        caption: ["13px", { lineHeight: "1.4", fontWeight: "400" }],
        button: ["16px", { lineHeight: "1.2", fontWeight: "500" }],
      },
      spacing: {
        xs: "4px",
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "24px",
        "2xl": "32px",
        "3xl": "48px",
        "4xl": "64px",
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "24px",
      },
      boxShadow: {
        xs: "0 1px 2px rgba(28, 24, 20, 0.04)",
        sm: "0 1px 2px rgba(28, 24, 20, 0.04), 0 4px 12px rgba(28, 24, 20, 0.06)",
        md: "0 4px 12px rgba(28, 24, 20, 0.06)",
        lg: "0 8px 24px rgba(28, 24, 20, 0.10), 0 2px 6px rgba(28, 24, 20, 0.06)",
        xl: "0 12px 32px rgba(28, 24, 20, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
