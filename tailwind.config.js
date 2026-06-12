/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Marka renkleri
        grissini: {
          50:  '#FFF8ED',
          100: '#FFE8C3',
          500: '#D97706',
          600: '#B45309',
          900: '#451A03',
        }
      }
    }
  },
  plugins: []
}