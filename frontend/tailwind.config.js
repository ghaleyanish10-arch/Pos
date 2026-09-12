export default {
  content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}'
],
  theme: {
    extend: {
      colors: {
        canvas: '#F7F6F2',
        surface: '#FFFFFF',
        line: '#E8E6E1',
        ink: '#1C1B19',
        meta: '#8A867E',
        shelf: '#FBFAF7',
        status: {
          blue: '#2563EB',
          amber: '#C2740B',
          green: '#15803D',
          red: '#D0342C',
          purple: '#7C5CD6',
        },
        tint: {
          blue: '#EAF0FE',
          amber: '#FDF3E4',
          green: '#E8F3EC',
          red: '#FBEBEA',
          purple: '#F1ECFC',
        },
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Text', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: '18px',
        shelf: '20px',
      },
      boxShadow: {
        drawer: '-24px 0 60px -30px rgba(28,27,25,0.35)',
        pop: '0 18px 40px -24px rgba(28,27,25,0.45)',
      },
      transitionTimingFunction: {
        soft: 'cubic-bezier(0.23, 1, 0.32, 1)',
      },
    },
  },
  plugins: [],
}
