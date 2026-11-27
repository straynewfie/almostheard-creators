"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="shell section">
      <h1>Something went wrong</h1>
      <p>This page could not be loaded.</p>
      <button className="primary" type="button" onClick={reset}>Try again</button>
    </main>
  );
}
