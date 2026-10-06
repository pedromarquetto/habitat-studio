import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Habitat Studio — Construir & explorar',
  description: 'Construa espaços em 3D, personalize cada apartamento e explore por dentro.',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
};
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
