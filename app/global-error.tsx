"use client";

// Replaces the root layout when it fails, so it brings its own document and
// plain inline styles.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f3f7f5", color: "#12201c" }}>
        <title>Something went wrong · CareerProof</title>
        <main style={{ maxWidth: 560, margin: "64px auto", padding: "0 16px" }}>
          <h1 style={{ fontSize: 28 }}>Something went wrong on our side</h1>
          <p style={{ color: "#4a5a55", lineHeight: 1.5 }}>
            Your work is saved. Try again, and if it keeps happening, wait a minute and reload the page.
            {error.digest ? ` Reference: ${error.digest}` : ""}
          </p>
          <button
            onClick={() => retry()}
            style={{ minHeight: 44, padding: "0 16px", borderRadius: 8, border: 0, background: "#0e6b5b", color: "#fff", fontWeight: 600, fontSize: 16 }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
