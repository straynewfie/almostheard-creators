import { SongForm } from "@components/forms/song-form";
import { getDashboardContext } from "@domains/catalogue/context";
import { listArtists } from "@domains/catalogue/queries";
import { isUuid } from "@domains/music/validation";
import { publicationBlockers, publicationConfigFromEnv, songReadinessMissing } from "@domains/music/publication";

export default async function NewSongPage({
  searchParams,
}: {
  searchParams: Promise<{ releaseId?: string; trackId?: string }>;
}) {
  const ctx = await getDashboardContext();
  if (ctx.kind !== "ready") return null;
  const query = await searchParams;
  const artists = await listArtists(ctx.creator.id);
  return (
    <section>
      <h1 className="page-title">New song</h1>
      <SongForm
        song={null}
        artists={artists.map((artist) => ({ id: artist.id, name: artist.name }))}
        releaseId={isUuid(query.releaseId ?? "") ? query.releaseId : undefined}
        trackId={isUuid(query.trackId ?? "") ? query.trackId : undefined}
        canWrite={ctx.canWrite}
        publicationTestMode={ctx.publicationTestMode}
        blockers={publicationBlockers({
          config: publicationConfigFromEnv(process.env),
          readinessMissing: songReadinessMissing({
            title: "",
            slug: "",
            primaryArtistId: "",
            durationMs: null,
            hasVerifiedAudio: false,
          }),
        })}
      />
    </section>
  );
}
