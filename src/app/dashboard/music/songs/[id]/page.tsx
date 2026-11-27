import { notFound } from "next/navigation";
import { MediaUpload } from "@components/forms/media-upload";
import { SongForm } from "@components/forms/song-form";
import { deleteSongAction } from "@domains/catalogue/actions";
import { getDashboardContext } from "@domains/catalogue/context";
import { currentCover, currentRecording, loadSong } from "@domains/catalogue/load";
import { listArtists } from "@domains/catalogue/queries";
import { publicationBlockers, publicationConfigFromEnv, songReadinessMissing } from "@domains/music/publication";
import type { CatalogueVisibility } from "@domains/music/types";

export default async function SongEditorPage({
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
  const song = await loadSong(ctx.creator.id, id);
  if (!song) notFound();
  const [artists, recording, cover] = await Promise.all([
    listArtists(ctx.creator.id),
    currentRecording(ctx.creator.id, song.id),
    ctx.canPreview ? currentCover(ctx.creator.id, "song_id", song.id) : Promise.resolve(null),
  ]);
  const blockers = publicationBlockers({
    config: publicationConfigFromEnv(process.env),
    readinessMissing: songReadinessMissing({
      title: song.title,
      slug: song.slug,
      primaryArtistId: song.primary_artist_id,
      durationMs: song.duration_ms,
      hasVerifiedAudio: Boolean(recording?.mediaId),
    }),
  });
  return (
    <section>
      <h1 className="page-title">{song.title}</h1>
      {error === "linked" ? <p className="form-error">Remove this song from its releases before deleting it.</p> : null}
      {error === "publish" ? <p className="form-error">The song was not published.</p> : null}
      <SongForm
        song={{ ...song, visibility: song.visibility as CatalogueVisibility }}
        artists={artists.map((artist) => ({ id: artist.id, name: artist.name }))}
        blockers={blockers}
        canWrite={ctx.canWrite}
        publicationTestMode={ctx.publicationTestMode}
      />
      <section className="editor-section">
        <h2>Artwork</h2>
        {cover ? (
          // Signed preview redirects cannot use the static image optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/media/${cover.id}?v=${cover.revision}`} alt="" width={240} height={240} />
        ) : <p>No artwork yet.</p>}
        {ctx.canWrite ? <MediaUpload label="Cover image" accept="image/webp,image/png,image/jpeg" mode="cover" parent="songs" parentId={song.id} /> : null}
      </section>
      <section className="editor-section">
        <h2>Audio</h2>
        {recording?.mediaId && ctx.canPreview ? (
          <audio controls preload="none" src={`/api/media/${recording.mediaId}`} />
        ) : <p>No current verified recording.</p>}
        {ctx.canWrite ? (
          <MediaUpload
            label="MP3"
            accept="audio/mpeg"
            mode="audio"
            songId={song.id}
            needsReplacementConfirm={Boolean(recording)}
          />
        ) : null}
      </section>
      {ctx.canWrite ? (
        <form action={deleteSongAction}>
          <input type="hidden" name="id" value={song.id} />
          <label className="check"><input type="checkbox" name="confirm" required /><span>Delete this song from the working catalogue.</span></label>
          <button type="submit">Delete song</button>
        </form>
      ) : null}
    </section>
  );
}
