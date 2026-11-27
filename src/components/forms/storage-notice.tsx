import Link from "next/link";

export function StorageNotice() {
  return (
    <div className="storage-notice" role="status">
      <h3>Storage not connected</h3>
      <p>Connect your Cloudflare R2 storage to upload artwork and audio files.</p>
      <Link className="button" href="/dashboard/storage">Manage storage</Link>
    </div>
  );
}
