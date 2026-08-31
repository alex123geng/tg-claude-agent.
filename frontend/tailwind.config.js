/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // TODO: заменить на реальные фирменные цвета бренда.
        brand: {
          DEFAULT: "#111827",
          50: "#f3f4f6",
          100: "#e5e7eb",
          200: "#d1d5db",
          300: "#9ca3af",
          400: "#6b7280",
          500: "#374151",
          600: "#1f2937",
          700: "#111827",
          800: "#0b0f19",
          900: "#05070c",
          accent: "#f59e0b",
        },
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
      },
    },
  },
  plugins: [],
};
