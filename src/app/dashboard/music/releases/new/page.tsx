import { ReleaseForm } from "@components/forms/release-form";
import { getDashboardContext } from "@domains/catalogue/context";
import { listArtists } from "@domains/catalogue/queries";
import { publicationBlockers, publicationConfigFromEnv, releaseReadinessMissing } from "@domains/music/publication";

export default async function NewReleasePage() {
  const ctx = await getDashboardContext();
  if (ctx.kind !== "ready") return null;
  const artists = await listArtists(ctx.creator.id);
  return (
    <section>
      <h1 className="page-title">New release</h1>
      <ReleaseForm
        release={null}
        artists={artists.map((artist) => ({ id: artist.id, name: artist.name }))}
        tracks={[]}
        songs={[]}
        canWrite={ctx.canWrite}
        blockers={publicationBlockers({
          config: publicationConfigFromEnv(process.env),
          readinessMissing: releaseReadinessMissing([]),
        })}
      />
    </section>
  );
}
