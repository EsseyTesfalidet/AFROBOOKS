/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0e0e0e',
          secondary: '#161616',
          tertiary: '#111111',
        },
        border: {
          default: '#222222',
          subtle: '#1a1a1a',
        },
        text: {
          primary: '#f5f2eb',
          secondary: '#aaaaaa',
          muted: '#666666',
          hint: '#444444',
        },
        accent: {
          red: '#e8442a',
          gold: '#f5b800',
          green: '#4ade80',
          purple: '#7c3aed',
          blue: '#0ea5e9',
        },
        success: {
          bg: '#0f2e1a',
          text: '#4ade80',
        },
        warning: {
          bg: '#2e1a0f',
          text: '#f5b800',
        },
        danger: {
          bg: '#1f0e0c',
          text: '#e8442a',
        },
      },
      fontFamily: {
        display: ['Bebas Neue', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        reader: ['Lora', 'serif'],
      },
      fontSize: {
        xs: '11px',
        sm: '12px',
        base: '13px',
        md: '14px',
        lg: '15px',
        xl: '16px',
        '2xl': '18px',
        '3xl': '20px',
        '4xl': '22px',
        'display-sm': '24px',
        'display-md': '28px',
        'display-lg': '32px',
        'display-xl': '40px',
      },
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '10px',
        xl: '12px',
        '2xl': '14px',
        '3xl': '16px',
        full: '9999px',
      },
    },
  },
  plugins: [],
};
