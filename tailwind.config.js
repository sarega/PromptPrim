/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./app.html",
    "./admin.html",
    "./src/**/*.{js,ts,jsx,tsx}", // <-- บรรทัดนี้สำคัญมาก
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}