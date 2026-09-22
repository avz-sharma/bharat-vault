/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: 'hsl(var(--card))',
        'card-foreground': 'hsl(var(--card-foreground))',
        primary: {
          DEFAULT: '#0077B3',
          foreground: '#ffffff',
          hover: '#006294',
        },
        accent: {
          DEFAULT: '#0077B3',
          foreground: '#ffffff',
        },
        palette: {
          ice: '#F0F8FF',
          ocean: '#0077B3',
          'ocean-hover': '#006294',
          'ocean-light': '#0095de',
          cyan: '#E0F7FA',
          white: '#FFFFFF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
