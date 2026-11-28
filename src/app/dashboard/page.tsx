import Link from "next/link";
import { getDashboardContext } from "@domains/catalogue/context";
import { catalogueCounts, listSongs } from "@domains/catalogue/queries";
import { storageStatus } from "@domains/media/connection";
import { isVerifiedStorageConnection } from "@domains/media/storage-status";

export default async function DashboardPage() {
  const ctx = await getDashboardContext();
  if (ctx.kind !== "ready") return null;
  const [counts, songs, storage] = await Promise.all([
    catalogueCounts(ctx.creator.id),
    listSongs(ctx.creator.id),
    storageStatus(ctx.creator.id),
  ]);
  return (
    <section>
      <p className="eyebrow">Overview</p>
      <h1 className="page-title">Your catalogue</h1>
      <div className="stats">
        <article className="panel stat"><span className="stat-label">Artists</span><strong className="stat-value">{counts.artists}</strong></article>
        <article className="panel stat"><span className="stat-label">Releases</span><strong className="stat-value">{counts.releases}</strong></article>
        <article className="panel stat"><span className="stat-label">Songs</span><strong className="stat-value">{counts.songs}</strong></article>
        <article className="panel stat"><span className="stat-label">Drafts</span><strong className="stat-value">{counts.drafts}</strong></article>
      </div>
      <div className="panel" style={{ marginTop: 18 }}>
        <h2>Storage</h2>
        <p>{isVerifiedStorageConnection(storage?.healthStatus) ? "Cloudflare R2 is connected." : "Storage not connected. Catalogue editing stays available."}</p>
        <Link href="/dashboard/storage?return=%2Fdashboard">{isVerifiedStorageConnection(storage?.healthStatus) ? "Review storage" : "Set up storage"}</Link>
      </div>
      <div className="panel" style={{ marginTop: 18 }}>
        <h2>Recent songs</h2>
        {songs.slice(0, 5).length === 0 ? <p>No songs yet.</p> : (
          <ul>{songs.slice(0, 5).map((song) => <li key={song.id}><Link href={`/dashboard/music/songs/${song.id}`}>{song.title}</Link></li>)}</ul>
        )}
      </div>
      {ctx.canWrite ? (
        <div className="row-actions" style={{ marginTop: 18 }}>
          <Link className="button" href="/dashboard/music/artists/new">New artist</Link>
          <Link className="button" href="/dashboard/music/releases/new">New release</Link>
          <Link className="button" href="/dashboard/music/songs/new">New song</Link>
        </div>
      ) : null}
    </section>
  );
}
