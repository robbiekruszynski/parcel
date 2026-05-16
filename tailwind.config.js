/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        parcel: {
          bg: {
            dark: '#0e0e10',
            light: '#e8eef5',
          },
          card: '#16161a',
          map: {
            dark: '#0e0e10',
            'dark-road': '#131820',
            light: '#dce8f0',
            'light-road': '#c8d8e4',
          },
          gold: '#f5c518',
          goldLegacy: '#f5c842',
          alert: '#ff3b3b',
          trail: {
            'dark-start': '#00c8ff',
            'light-start': '#ff6432',
          },
        },
      },
    },
  },
  plugins: [],
};
