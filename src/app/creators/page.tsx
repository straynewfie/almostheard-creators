import type { Metadata } from "next";

export const metadata: Metadata = { title: "Creators" };

export default function CreatorsDirectoryPage() {
  return (
    <main className="shell section">
      <p className="eyebrow">Public catalogue</p>
      <h1>Creator directory</h1>
      <p>The public creator directory is not open. Private catalogues stay private, and unpublished music is not listed here.</p>
    </main>
  );
}
