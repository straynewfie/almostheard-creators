"use client";

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section>
      <h1>The dashboard could not be loaded</h1>
      <button className="primary" type="button" onClick={reset}>Try again</button>
    </section>
  );
}
