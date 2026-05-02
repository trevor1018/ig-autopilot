/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fff7f2",
          100: "#ffe9dc",
          500: "#ff7a45",
          600: "#e35a23",
          700: "#b8431a",
        },
      },
    },
  },
  plugins: [],
};
