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
        // Primary Colors
        primary: {
          DEFAULT: "#00B8A9",
          dark: "#00A896",
          light: "#E6F7F5",
        },
        // Secondary Colors
        coral: {
          DEFAULT: "#FF6B6B",
          light: "#FFE5E5",
        },
        success: {
          DEFAULT: "#51CF66",
          dark: "#10B981",
        },
        // Semantic Colors
        warning: "#F59E0B",
        error: "#EF4444",
        info: "#3B82F6",
        // Neutral Colors
        neutral: {
          50: "#F9FAFB",
          100: "#F3F4F6",
          200: "#E5E7EB",
          300: "#D1D5DB",
          400: "#9CA3AF",
          500: "#6B7280",
          600: "#4B5563",
          700: "#374151",
          800: "#1F2937",
          900: "#1A1A1A",
        },
        // Dark Mode Colors
        dark: {
          bg: "#0F172A",
          "bg-secondary": "#1E293B",
          "bg-tertiary": "#334155",
          text: "#F1F5F9",
          "text-secondary": "#CBD5E1",
          "text-tertiary": "#94A3B8",
          border: "#334155",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "SF Mono", "monospace"],
      },
      fontSize: {
        // Mobile first
        h1: ["28px", { lineHeight: "1.2", fontWeight: "700" }],
        h2: ["24px", { lineHeight: "1.3", fontWeight: "600" }],
        h3: ["20px", { lineHeight: "1.4", fontWeight: "600" }],
        h4: ["18px", { lineHeight: "1.4", fontWeight: "500" }],
        "body-lg": ["16px", { lineHeight: "1.6", fontWeight: "400" }],
        body: ["14px", { lineHeight: "1.6", fontWeight: "400" }],
        "body-sm": ["13px", { lineHeight: "1.5", fontWeight: "400" }],
        caption: ["12px", { lineHeight: "1.4", fontWeight: "400" }],
        button: ["15px", { lineHeight: "1", fontWeight: "500" }],
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
        xs: "0 1px 2px rgba(0,0,0,0.05)",
        sm: "0 1px 3px rgba(0,0,0,0.1)",
        md: "0 4px 6px rgba(0,0,0,0.1)",
        lg: "0 10px 15px rgba(0,0,0,0.1)",
        xl: "0 20px 25px rgba(0,0,0,0.1)",
      },
    },
  },
  plugins: [],
};

export default config;
