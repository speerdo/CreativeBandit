/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // Risograph ink set. Contrast ratios below are measured against
        // base (#0B0B0C) — see docs/creative-bandit-visual-identity.md §2.
        base: {
          DEFAULT: '#0B0B0C',
          100: '#17171A', // raised surface (cards)
          200: '#111113', // alternating section band
          300: '#0B0B0C',
        },
        paper: {
          DEFAULT: '#EDE8DF', // 16.0:1 — headings, any size
          dim: '#D8D2C6', // 12.4:1 — secondary headings
          mute: '#B5AEA3', //  8.9:1 — body copy
        },
        'ink-hot': '#FF4D14', //  5.9:1 — passes AA for normal text
        'ink-acid': '#FFE800', // 15.7:1 - any size, fluorescent riso yellow
        'ink-pink': '#E5195A', //  4.3:1 — LARGE TEXT ONLY (>=24px / 19px bold)
        // 2.3:1 against base. Never carries text. Plates and fills only.
        'ink-cold': '#1B27E8',
        // 5.4:1 — the text-safe tint of ink-cold. Use for blue type on dark.
        'ink-cold-lift': '#6E79FF',
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
      },
      fontFamily: {
        // Archivo is variable on both weight and width, so one family covers
        // expanded poster headlines and condensed technical labels.
        display: ['Archivo', 'Archivo Expanded', 'system-ui', 'sans-serif'],
        heading: ['Archivo', 'Archivo Expanded', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Space Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      animation: {
        // Print misfeed: plates jolt apart, then resettle. Stepped, not
        // eased - smooth motion here reads as a wobble rather than a
        // mechanical misfeed.
        'plate-jitter': 'plate-jitter 320ms steps(3, end) 1',
      },
      keyframes: {
        'plate-jitter': {
          '0%': { transform: 'translate(0, 0)' },
          '33%': { transform: 'translate(-2px, 1px)' },
          '66%': { transform: 'translate(2px, -1px)' },
          '100%': { transform: 'translate(0, 0)' },
        },
      },
    },
  },
  plugins: [],
};
