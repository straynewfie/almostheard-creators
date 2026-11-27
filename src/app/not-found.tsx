import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell section">
      <h1>Page not found</h1>
      <p><Link href="/">Return to the mission</Link></p>
    </main>
  );
}
