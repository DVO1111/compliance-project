/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary ramp from the Figma style guide (Colors/Primary).
        primary: {
          100: '#d3e0fb',
          200: '#a8c1f7',
          300: '#7ca1f3',
          400: '#5182ef',
          500: '#2563eb',
          700: '#1041ae',
        },
        danger: {
          DEFAULT: '#fb3748',
          hover: '#fa0511',
          active: '#c8040e',
        },
        ink: {
          primary: '#070808',
          secondary: '#525252',
          placeholder: '#9ba2a6',
          disabled: '#b6bbbe',
        },
        stroke: {
          subtle: '#ecedee',
          strong: '#d1d4d6',
        },
        brand: {
          50: '#e6f0ff',
          100: '#b3d1ff',
          200: '#80b3ff',
          300: '#4d94ff',
          400: '#1a75ff',
          500: '#004A99',
          600: '#003d7a',
          700: '#002D62',
          800: '#001f42',
          900: '#001029',
        },
        accent: {
          50: '#e6fff5',
          100: '#b3ffe0',
          200: '#80ffcc',
          300: '#4dffb8',
          400: '#1affa3',
          500: '#00D084',
          600: '#00A86B',
          700: '#008054',
          800: '#00573a',
          900: '#002e1f',
        },
        // Legacy palette from the starter template. `blue` now points at the
        // Figma primary so existing `bg-behance-blue` usages theme correctly —
        // new code should use `primary-500`, and these should be migrated out.
        behance: {
          blue: '#2563eb',
          purple: '#8145CD',
          pink: '#CD45A2',
          green: '#13CD3C',
          dark: '#0F172A',
          surface: '#1E293B',
          'surface-light': '#334155'
        }
      },
      fontFamily: {
        // Mulish is the typeface specified by the Figma style guide. The
        // previous value named Inter, but no font was ever loaded — no link
        // tag, no @font-face — so the whole app fell back to the system sans.
        sans: ['Mulish Variable', 'Mulish', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      // Type scale from the Figma style guide. Pairs each size with its
      // designed line height, so `text-heading-04` sets both.
      fontSize: {
        'heading-01': ['0.875rem', { lineHeight: '1.125rem', fontWeight: '600' }],
        'heading-02': ['1rem', { lineHeight: '1.375rem', fontWeight: '600' }],
        'heading-03': ['1.25rem', { lineHeight: '1.625rem', fontWeight: '500' }],
        'heading-04': ['1.75rem', { lineHeight: '2.125rem', fontWeight: '500' }],
        'heading-05': ['2rem', { lineHeight: '2.5rem', fontWeight: '500' }],
        'heading-06': ['2.625rem', { lineHeight: '3.125rem', fontWeight: '500' }],
        'heading-07': ['3.375rem', { lineHeight: '4rem', fontWeight: '500' }],
        'body-short-01': ['0.875rem', { lineHeight: '1.125rem' }],
        'body-long-01': ['0.875rem', { lineHeight: '1.25rem' }],
        'body-short-02': ['1rem', { lineHeight: '1.375rem' }],
        'body-long-02': ['1rem', { lineHeight: '1.5rem' }],
        'label-01': ['0.75rem', { lineHeight: '1rem' }],
        'label-02': ['0.875rem', { lineHeight: '1.125rem' }],
        'caption-01': ['0.75rem', { lineHeight: '1rem' }],
        'helper-text-01': ['0.75rem', { lineHeight: '1rem' }],
      },
      // Control heights from the Button component sheet.
      height: {
        'control-sm': '32px',
        'control-md': '40px',
        'control': '48px',
        'control-lg': '56px',
      },
      animation: {
        'shimmer': 'shimmer 1.5s ease-in-out infinite',
        'fade-in': 'fade-in 0.5s ease-out',
        'slide-up': 'slide-up 0.4s ease-out',
        'count-up': 'count-up 0.6s ease-out',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'count-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
