'use client';

// Root-layout error boundary. It replaces the root layout when active, so it must
// render its own <html> and <body>, and the global stylesheet is not loaded: the
// styling is inline. It does not touch stored data; the route-level error.tsx
// offers export and reset.
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#18181b', color: '#f4f4f5', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ display: 'flex', minHeight: '100dvh', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
            <div role="alert">
              <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem' }}>Something went wrong</h1>
              <p style={{ margin: '0 0 1.5rem', color: '#a1a1aa' }}>
                PaintLog hit an unexpected error. Your data has not been changed. You can try again.
              </p>
            </div>
            <button
              type="button"
              onClick={() => retry()}
              style={{ border: 0, borderRadius: '0.5rem', background: '#2563eb', color: '#fff', padding: '0.5rem 1rem', fontSize: '1rem', fontWeight: 500, cursor: 'pointer' }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
