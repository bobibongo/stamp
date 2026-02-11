import type { Metadata } from 'next';
import { Inter, Roboto, Montserrat } from 'next/font/google';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin', 'latin-ext'],
});

const roboto = Roboto({
  variable: '--font-roboto',
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '700'],
});

const montserrat = Montserrat({
  variable: '--font-montserrat',
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'StampFlow – Kreator Pieczątek',
  description:
    'Stwórz profesjonalną pieczątkę w 30 sekund. Eksport do SVG/PDF gotowy do druku.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body
        className={`${inter.variable} ${roboto.variable} ${montserrat.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
