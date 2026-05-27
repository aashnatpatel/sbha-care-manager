/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#4F7EE0',
        'primary-light': '#EEF2FB',
        mauve: '#A671AA',
        'mauve-soft': '#B88BBE',
        'mauve-light': '#F5EFF6',
      },
      fontFamily: {
        heading: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        body: ['"Montserrat"', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 12px 0 rgba(79,126,224,0.08)',
        'card-hover': '0 4px 20px 0 rgba(79,126,224,0.15)',
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
      },
    },
  },
  plugins: [],
}
