/** @type {import('tailwindcss').Config} */
export default {
  // Scan every template + the SSG renderer + the hydration JS so no class is purged.
  content: [
    './*.html',
    './{yachts,villas,hotels,experiences,transfers,guides,about,it,de}/**/*.html',
    './scripts/build-ssg.mjs',
    './assets/js/**/*.js'
  ],
  theme: {
    extend: {
      colors: {
        ocean:  '#0A2540', ocean2: '#143A61',
        teal:   '#1E70B0', tealb:  '#2A86C9',
        gold:   '#2FA8E0', goldd:  '#2790C4', azure: '#2FA8E0',
        sunset: '#F2854A', clay:   '#CB6A43',
        sand:   '#F3F8FC', ink:    '#14304F',
        danger: '#F2545B'
      },
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans:  ['Inter', 'system-ui', 'sans-serif'],
        brand: ['"Open Sans"', 'Inter', 'sans-serif']
      }
    }
  },
  plugins: []
};
