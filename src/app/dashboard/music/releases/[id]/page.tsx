import { notFound } from "next/navigation";
import { DangerZone } from "@components/forms/danger-zone";
import { ReleaseForm } from "@components/forms/release-form";
import { MediaUpload } from "@components/forms/media-upload";
import { StorageNotice } from "@components/forms/storage-notice";
import { deleteReleaseAction } from "@domains/catalogue/actions";
import { getDashboardContext } from "@domains/catalogue/context";
import { currentCover, loadRelease, loadTracks } from "@domains/catalogue/load";
import { storageStatus } from "@domains/media/connection";
import { isVerifiedStorageConnection } from "@domains/media/storage-status";
import { listSongs } from "@domains/catalogue/queries";
import { publicationBlockers, publicationConfigFromEnv, releaseReadinessMissing } from "@domains/music/publication";

export default async function ReleaseEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getDashboardContext();
  if (ctx.kind !== "ready") return null;
  const { id } = await params;
  const { error } = await searchParams;
  const release = await loadRelease(ctx.creator.id, id);
  if (!release) notFound();
  const [tracks, songs, artists] = await Promise.all([
    loadTracks(ctx.creator.id, release.id),
    listSongs(ctx.creator.id),
    (await import("@domains/catalogue/queries")).listArtists(ctx.creator.id),
  ]);
  const songTitles = new Map(songs.map((song) => [song.id, song.title]));
  const [cover, storage] = await Promise.all([
    ctx.canPreview ? currentCover(ctx.creator.id, "release_id", release.id) : Promise.resolve(null),
    storageStatus(ctx.creator.id),
  ]);
  const storageReady = isVerifiedStorageConnection(storage?.healthStatus);
  const blockers = publicationBlockers({
    config: publicationConfigFromEnv(process.env),
    readinessMissing: releaseReadinessMissing(tracks.map((track) => ({
      songId: track.song_id,
      placeholderTitle: track.placeholder_title,
      songReady: Boolean(track.song_id),
    }))),
  });
  return (
    <section>
      <h1 className="page-title">{release.title}</h1>
      {error === "confirm" ? <p className="form-error">Confirm the deletion before removing this release.</p> : null}
      {error && error !== "confirm" ? <p className="form-error">That change could not be completed.</p> : null}
      <ReleaseForm
        release={{ ...release, release_date: release.release_date }}
        artists={artists.map((artist) => ({ id: artist.id, name: artist.name }))}
        tracks={tracks.map((track) => ({
          id: track.id,
          discNumber: track.disc_number,
          trackNumber: track.track_number,
          songId: track.song_id,
          songTitle: track.song_id ? songTitles.get(track.song_id) ?? "Song" : null,
          placeholderTitle: track.placeholder_title,
        }))}
        songs={songs.map((song) => ({ id: song.id, title: song.title }))}
        blockers={blockers}
        canWrite={ctx.canWrite}
      />
      <section className="editor-section">
        <h2>Artwork</h2>
        {cover ? (
          // Signed preview redirects cannot use the static image optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/media/${cover.id}?v=${cover.revision}`} alt="" width={240} height={240} />
        ) : <p>No artwork yet.</p>}
        {ctx.canWrite ? (
          storageReady
            ? <MediaUpload label="Cover image" accept="image/webp,image/png,image/jpeg" mode="cover" parent="releases" parentId={release.id} />
            : <StorageNotice />
        ) : null}
      </section>
      {ctx.canWrite ? (
        <DangerZone
          action={deleteReleaseAction}
          id={release.id}
          buttonLabel="Delete release"
          confirmation="I understand this removes the release and its track list."
          explanation="Songs stay in the catalogue. Their audio files are not deleted."
        />
      ) : null}
    </section>
  );
}
