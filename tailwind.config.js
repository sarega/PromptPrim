/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./app.html",
    "./admin.html",
    "./public/**/*.html",
    "./src/**/*.{html,js,jsx,ts,tsx}",
    "./src/js/react-components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  corePlugins: { preflight: false },
  prefix: "tw-",
  safelist: [{ pattern: /^tw-.*/ }],
};