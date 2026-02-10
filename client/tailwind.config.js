/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dark theme palette
        background: '#121212',
        surface: '#1e1e1e',
        primary: '#4ade80', // Green-400
        secondary: '#60a5fa', // Blue-400
        accent: '#f472b6', // Pink-400
        danger: '#ef4444', // Red-500
        warning: '#f59e0b', // Amber-500
        text: '#e5e7eb', // Gray-200
        muted: '#9ca3af', // Gray-400
      }
    },
  },
  plugins: [],
}
