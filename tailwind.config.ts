import type { Config } from 'tailwindcss';

// Cores da marca DELLA (conferidas na logo)
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        preto: '#0A0A0A',
        painel: '#131313',
        painel2: '#1B1B1B',
        borda: '#2B2B2B',
        marinho: { DEFAULT: '#0D3B82', escuro: '#082a5e' },
        azul: '#1E5BC6',
        dourado: { DEFAULT: '#D4A437', claro: '#E6BE5A', escuro: '#B08422' },
        suave: '#A3A3A3',
      },
      fontFamily: {
        sans: ['var(--fonte-texto)', 'system-ui', 'sans-serif'],
        titulo: ['var(--fonte-titulo)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
