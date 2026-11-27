import { CatalogueList } from "@components/dashboard/catalogue-list";
import { getDashboardContext } from "@domains/catalogue/context";
import { listSongs } from "@domains/catalogue/queries";
import { visibilityLabel, type CatalogueVisibility } from "@domains/music/types";

export default async function SongsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await getDashboardContext();
  if (ctx.kind !== "ready") return null;
  const { q } = await searchParams;
  const songs = await listSongs(ctx.creator.id);
  return (
    <CatalogueList
      title="Songs"
      description="A song can appear on more than one release. Audio belongs to a recording, and replacing it creates a new recording."
      createHref="/dashboard/music/songs/new"
      createLabel="New song"
      query={q ?? ""}
      rows={songs.map((song) => ({
        href: `/dashboard/music/songs/${song.id}`,
        title: song.title,
        meta: visibilityLabel(song.visibility as CatalogueVisibility),
      }))}
    />
  );
}
