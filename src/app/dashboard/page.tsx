import Link from "next/link";
import { getDashboardContext } from "@domains/catalogue/context";
import { catalogueCounts, listSongs } from "@domains/catalogue/queries";
import { storageStatus } from "@domains/media/connection";
import { membershipNotice } from "@domains/music/membership";

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
      <p>{membershipNotice(ctx.creator.membership_state)}</p>
      <div className="stats">
        <article className="panel"><span>Artists</span><strong>{counts.artists}</strong></article>
        <article className="panel"><span>Releases</span><strong>{counts.releases}</strong></article>
        <article className="panel"><span>Songs</span><strong>{counts.songs}</strong></article>
        <article className="panel"><span>Drafts</span><strong>{counts.drafts}</strong></article>
      </div>
      <div className="panel" style={{ marginTop: 18 }}>
        <h2>Storage</h2>
        <p>{storage ? `Connection ${storage.healthStatus}.` : "No storage connection yet."}</p>
        <Link href="/dashboard/storage">Manage storage</Link>
      </div>
      <div className="panel" style={{ marginTop: 18 }}>
        <h2>Recent songs</h2>
        {songs.slice(0, 5).length === 0 ? <p>No songs yet.</p> : (
          <ul>{songs.slice(0, 5).map((song) => <li key={song.id}><Link href={`/dashboard/music/songs/${song.id}`}>{song.title}</Link></li>)}</ul>
        )}
      </div>
      <div className="row-actions" style={{ marginTop: 18 }}>
        <Link className="button" href="/dashboard/music/artists/new">New artist</Link>
        <Link className="button" href="/dashboard/music/releases/new">New release</Link>
        <Link className="button" href="/dashboard/music/songs/new">New song</Link>
      </div>
    </section>
  );
}
