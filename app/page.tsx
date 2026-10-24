import PaintLogApp from '@/components/PaintLogApp';

// Server Component (no 'use client'): it runs on the server at build time and
// ships no JavaScript of its own. It only renders the client boundary component.
// The route "/" exists because this file is app/page.tsx.
export default function Home() {
  return <PaintLogApp />;
}
