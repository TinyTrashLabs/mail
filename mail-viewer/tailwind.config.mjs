/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    screens: {
      'xs': '420px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        cream: '#fbfaf6',
        night: '#0F1119',
        ink: {
          DEFAULT: '#1f2333',
          soft: '#4a5168',
        },
        teal: {
          DEFAULT: '#7BB3B3',
          strong: '#5d9999',
        },
        card: '#ffffff',
        rule: '#e6e2d8',
        ok: '#6db28b',
        warn: '#d8a14a',
        err: '#c46663',
      },
      fontFamily: {
        serif: ['Lora', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'Menlo', 'monospace'],
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        display: ['4rem', { lineHeight: '1.05' }],
        h1: ['2.5rem', { lineHeight: '1.15' }],
        h2: ['1.75rem', { lineHeight: '1.2' }],
        body: ['1.0625rem', { lineHeight: '1.55' }],
        'mono-base': ['0.9375rem', { lineHeight: '1.4' }],
        'mono-sm': ['0.8125rem', { lineHeight: '1.4' }],
      },
      borderRadius: {
        card: '6px',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
