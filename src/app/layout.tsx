import type { Metadata, Viewport } from 'next';
import { Inter, Montserrat } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const texto = Inter({ subsets: ['latin'], variable: '--fonte-texto' });
const titulo = Montserrat({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--fonte-titulo' });

export const metadata: Metadata = {
  title: { default: 'DELLA Estoque', template: '%s | DELLA Estoque' },
  description: 'Controle de estoque — DELLA Distribuidora de Produtos',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${texto.variable} ${titulo.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        {children}
        <Toaster
          theme="dark"
          position="top-center"
          richColors
          closeButton
          toastOptions={{ style: { fontSize: '15px' } }}
        />
      </body>
    </html>
  );
}
