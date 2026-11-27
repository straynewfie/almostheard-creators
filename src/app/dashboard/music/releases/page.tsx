import { CatalogueList } from "@components/dashboard/catalogue-list";
import { getDashboardContext } from "@domains/catalogue/context";
import { listReleases } from "@domains/catalogue/queries";
import { CREATOR_RELEASE_TYPE_LABELS, visibilityLabel, type CatalogueVisibility, type CreatorReleaseType } from "@domains/music/types";

export default async function ReleasesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await getDashboardContext();
  if (ctx.kind !== "ready") return null;
  const { q } = await searchParams;
  const releases = await listReleases(ctx.creator.id);
  return (
    <CatalogueList
      title="Releases"
      description="Releases group songs. Removing a release removes the track list, not the songs."
      createHref="/dashboard/music/releases/new"
      createLabel="New release"
      canCreate={ctx.canWrite}
      query={q ?? ""}
      rows={releases.map((release) => ({
        href: `/dashboard/music/releases/${release.id}`,
        title: release.title,
        meta: `${CREATOR_RELEASE_TYPE_LABELS[release.release_type as CreatorReleaseType] ?? release.release_type} · ${visibilityLabel(release.visibility as CatalogueVisibility)}`,
      }))}
    />
  );
}
