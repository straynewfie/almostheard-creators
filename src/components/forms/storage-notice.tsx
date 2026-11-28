import Link from "next/link";
import { safeDashboardReturnPath } from "@platform/auth/paths";

export function StorageNotice({ returnTo }: { returnTo: string }) {
  const href = `/dashboard/storage?return=${encodeURIComponent(safeDashboardReturnPath(returnTo))}`;
  return (
    <div className="storage-notice" role="status">
      <h3>Storage not connected</h3>
      <p>Connect your Cloudflare R2 storage to upload artwork and audio files. You can keep editing this page after you come back.</p>
      <Link className="button" href={href}>Set up storage</Link>
    </div>
  );
}
