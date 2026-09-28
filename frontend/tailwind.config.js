/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        // LabLink logo orange (#fc6800) and its scale
        brand: {
          50: "#fff5ec",
          100: "#ffe6d0",
          200: "#ffc9a0",
          300: "#ffa566",
          400: "#ff8533",
          500: "#fc6800",
          600: "#d95700",
          700: "#b34700",
          800: "#8a3700",
          900: "#6b2b00",
          950: "#3d1800",
        },
      },
    },
  },
  plugins: [],
};
