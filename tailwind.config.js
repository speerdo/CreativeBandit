/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        charcoal: '#0d0d0d',
        flameTip: '#ffd700',
        coreFire: '#ff6a00',
        blazingEmber: '#ff1c1c',
        magentaFlame: '#a100ff',
        dark: {
          100: '#1a1a1a',
          200: '#141414',
          300: '#0d0d0d',
        },
        light: {
          100: '#ffffff',
          200: '#f5f5f5',
          300: '#e0e0e0',
        },
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
      },
      fontFamily: {
        heading: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        flicker: 'flicker 3s ease-in-out infinite',
        pulse: 'pulse 2s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
      },
      keyframes: {
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.9' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
      },
    },
  },
  plugins: [],
};
