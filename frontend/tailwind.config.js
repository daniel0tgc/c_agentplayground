/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f4ff",
          100: "#dde7ff",
          500: "#4f6ef7",
          600: "#3b55d4",
          700: "#2d40a8",
          900: "#1a2461",
        },
      },
    },
  },
  plugins: [],
};
