/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      colors: {
        bg:         'var(--bg)',
        surface:    'var(--surface)',
        hairline:   'var(--hairline)',
        ink:        'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        'ink-faint':'var(--ink-faint)',
        steel:      'var(--steel)',
        'steel-soft':'var(--steel-soft)',
        low:        'var(--low)',
        'low-soft': 'var(--low-soft)',
        med:        'var(--med)',
        'med-soft': 'var(--med-soft)',
        high:       'var(--high)',
        'high-soft':'var(--high-soft)',
      },
      borderColor: {
        DEFAULT: 'var(--hairline)',
      },
    },
  },
  plugins: [],
}
