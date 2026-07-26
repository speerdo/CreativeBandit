/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // Phase 0: names are final, values are still the old flame palette.
        // Phase 1 swaps these to the risograph ink set — see
        // docs/creative-bandit-visual-identity.md §2.
        base: {
          DEFAULT: '#0d0d0d',
          100: '#1a1a1a',
          200: '#141414',
          300: '#0d0d0d',
        },
        paper: {
          DEFAULT: '#ffffff',
          dim: '#f5f5f5',
          mute: '#e0e0e0',
        },
        'ink-hot': '#ff1c1c',
        'ink-hot-alt': '#ff6a00',
        'ink-acid': '#ffd700',
        'ink-cold': '#a100ff',
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
