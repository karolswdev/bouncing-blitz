/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'game-primary': '#1a1a1a',
        'game-secondary': '#2a2a2a',
        'game-accent': '#4a4a4a',
      },
    },
  },
  plugins: [],
}
