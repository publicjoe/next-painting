import type { Metadata } from 'next';
import './globals.css';

// Server Component. The root layout wraps every page and must render <html> and
// <body>. The `metadata` export is how Next.js sets <title>, description etc.
export const metadata: Metadata = {
  title: 'PaintLog',
  description: 'Track the build, prime, paint and base progress of your tabletop miniatures.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
