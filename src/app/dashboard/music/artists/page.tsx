import { CatalogueList } from "@components/dashboard/catalogue-list";
import { getDashboardContext } from "@domains/catalogue/context";
import { listArtists } from "@domains/catalogue/queries";
import { visibilityLabel, type CatalogueVisibility } from "@domains/music/types";

export default async function ArtistsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await getDashboardContext();
  if (ctx.kind !== "ready") return null;
  const { q } = await searchParams;
  const artists = await listArtists(ctx.creator.id);
  return (
    <CatalogueList
      title="Artists"
      description="Artist identities belong to this creator account. The account itself is not an artist."
      createHref="/dashboard/music/artists/new"
      createLabel="New artist"
      canCreate={ctx.canWrite}
      query={q ?? ""}
      rows={artists.map((artist) => ({
        href: `/dashboard/music/artists/${artist.id}`,
        title: artist.name,
        meta: visibilityLabel(artist.visibility as CatalogueVisibility),
      }))}
    />
  );
}
