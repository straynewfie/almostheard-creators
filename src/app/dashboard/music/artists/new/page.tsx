import { ArtistForm } from "@components/forms/artist-form";
import { getDashboardContext } from "@domains/catalogue/context";

export default async function NewArtistPage() {
  const ctx = await getDashboardContext();
  if (ctx.kind !== "ready") return null;
  return (
    <section>
      <h1 className="page-title">New artist</h1>
      <ArtistForm artist={null} canWrite={ctx.canWrite} />
    </section>
  );
}
