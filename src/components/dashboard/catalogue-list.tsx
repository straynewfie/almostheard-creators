import Link from "next/link";

export function CatalogueList({
  title,
  description,
  createHref,
  createLabel,
  canCreate,
  query,
  rows,
}: {
  title: string;
  description: string;
  createHref: string;
  createLabel: string;
  canCreate: boolean;
  query: string;
  rows: { href: string; title: string; meta: string }[];
}) {
  const visible = rows.filter((row) =>
    row.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <section>
      <div className="row-actions">
        <h1 className="page-title">{title}</h1>
        {canCreate ? <Link className="button" href={createHref}>{createLabel}</Link> : null}
      </div>
      <p className="muted">{description}</p>
      <form>
        <label>Search<input name="q" defaultValue={query} /></label>
      </form>
      {visible.length === 0 ? <p>Nothing here yet.</p> : (
        <table>
          <thead><tr><th>Name</th><th>Status</th></tr></thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.href}>
                <td><Link href={row.href}>{row.title}</Link></td>
                <td>{row.meta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
