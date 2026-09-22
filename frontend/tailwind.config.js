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
        lineStrong: '#DAD6CE',
        ink: '#1C1B19',
        meta: '#8A867E',
        metaStrong: '#6F6B62',
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
        tintBorder: {
          blue: '#C7D7FA',
          amber: '#F0D98C',
          green: '#C5E2D3',
          red: '#F3CFCC',
          purple: '#DDD5F4',
        },
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Text', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        micro: ['10px', { lineHeight: '14px' }],
        caption: ['11px', { lineHeight: '16px' }],
        13: ['13px', { lineHeight: '20px' }],
        15: ['15px', { lineHeight: '22px' }],
        17: ['17px', { lineHeight: '24px' }],
      },
      letterSpacing: {
        caps: '0.06em',
        label: '0.12em',
        title: '0.14em',
      },
      borderRadius: {
        card: '16px',
        shelf: '18px',
        xs: '4px',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgba(28,27,25,0.05)',
        card: '0 1px 3px 0 rgba(28,27,25,0.06), 0 1px 2px -1px rgba(28,27,25,0.04)',
        drawer: '-24px 0 60px -30px rgba(28,27,25,0.35)',
        pop: '0 18px 40px -24px rgba(28,27,25,0.45)',
        'pop-lg': '0 28px 64px -20px rgba(28,27,25,0.40)',
      },
      transitionTimingFunction: {
        soft: 'cubic-bezier(0.23, 1, 0.32, 1)',
      },
    },
  },
  plugins: [],
}
