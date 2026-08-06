"use client";

/**
 * Root-level error boundary — replaces the default Next.js
 * "Application error: a client-side exception has occurred" screen.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: "#F8FAFC",
          color: "#1E293B",
          padding: 24,
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/illustrations/error-state.svg"
            alt=""
            aria-hidden
            width={144}
            height={144}
            draggable={false}
            style={{
              display: "block",
              width: "clamp(96px, 22vw, 144px)",
              height: "clamp(96px, 22vw, 144px)",
              margin: "0 auto 20px",
              objectFit: "contain",
              background: "transparent",
              pointerEvents: "none",
              userSelect: "none",
            }}
          />
          <p style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.5, margin: 0 }}>
            Something went wrong. Please try again.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 20,
              padding: "10px 18px",
              borderRadius: 12,
              border: "none",
              background: "#FF5C39",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
