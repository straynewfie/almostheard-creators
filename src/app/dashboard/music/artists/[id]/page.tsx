import { notFound } from "next/navigation";
import { ArtistForm } from "@components/forms/artist-form";
import { MediaUpload } from "@components/forms/media-upload";
import { getDashboardContext } from "@domains/catalogue/context";
import { deleteArtistAction } from "@domains/catalogue/actions";
import { currentCover, loadArtist } from "@domains/catalogue/load";

export default async function ArtistEditorPage({
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
  const artist = await loadArtist(ctx.creator.id, id);
  if (!artist) notFound();
  const cover = ctx.canPreview ? await currentCover(ctx.creator.id, "artist_id", artist.id) : null;
  return (
    <section>
      <h1 className="page-title">{artist.name}</h1>
      {error === "linked" ? <p className="form-error">Remove this artist&apos;s songs and releases before deleting the artist.</p> : null}
      <ArtistForm artist={artist} canWrite={ctx.canWrite} />
      <section className="editor-section">
        <h2>Artwork</h2>
        {cover ? (
          // Signed preview redirects cannot use the static image optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/media/${cover.id}?v=${cover.revision}`} alt="" width={240} height={240} />
        ) : <p>No artwork yet.</p>}
        {ctx.canWrite ? <MediaUpload label="Cover image" accept="image/webp,image/png,image/jpeg" mode="cover" parent="artists" parentId={artist.id} /> : null}
      </section>
      {ctx.canWrite ? (
        <form action={deleteArtistAction}>
          <input type="hidden" name="id" value={artist.id} />
          <label className="check"><input type="checkbox" name="confirm" required /><span>Delete this artist from the working catalogue.</span></label>
          <button type="submit">Delete artist</button>
        </form>
      ) : null}
    </section>
  );
}
