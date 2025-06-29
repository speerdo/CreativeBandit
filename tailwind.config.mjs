/** @type {import('tailwindcss').Config} */
const config = {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        charcoal: '#0D0D0D',
        flameTip: '#FFD700',
        coreFire: '#FF6A00',
        blazingEmber: '#FF1C1C',
        magentaFlame: '#A100FF',
        dark: {
          100: '#1A1A1A',
          200: '#141414',
          300: '#0D0D0D',
        },
        light: {
          100: '#FFFFFF',
          200: '#F5F5F5',
          300: '#E0E0E0',
        },
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' }
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.9' }
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' }
        }
      },
      animation: {
        flicker: 'flicker 3s ease-in-out infinite',
        pulse: 'pulse 2s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite'
      }
    }
  },
  plugins: []
}

export default config;