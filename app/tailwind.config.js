/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      colors: {
        surface: {
          0: "#09090b",
          1: "#111113",
          2: "#18181b",
          3: "#1f1f23",
          4: "#27272a",
        },
        accent: "#3b82f6",
        success: "#22c55e",
        danger: "#ef4444",
        warning: "#f59e0b",
        muted: "#71717a",
      },
    },
  },
  plugins: [],
};
