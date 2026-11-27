import { redirect } from "next/navigation";
import { DashboardShell } from "@components/dashboard/shell";
import { getDashboardContext } from "@domains/catalogue/context";
import { membershipNotice } from "@domains/music/membership";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getDashboardContext();
  if (ctx.kind === "anonymous") redirect("/login?next=/dashboard");
  const name = ctx.kind === "ready" ? ctx.creator.display_name : "Creator";
  return (
    <DashboardShell displayName={name}>
      {ctx.kind === "unconfigured" ? (
        <section className="panel">
          <h1>Setup required</h1>
          <p>Add the Supabase URL and publishable key before using the dashboard. Missing: {ctx.missing.join(", ")}.</p>
        </section>
      ) : null}
      {ctx.kind === "unverified" ? (
        <section className="panel">
          <h1>Verify your email</h1>
          <p>Open the verification message, then return here. The creator profile is created after the address is verified and starts inactive.</p>
        </section>
      ) : null}
      {ctx.kind === "ready" && !ctx.canRead ? (
        <section className="panel">
          <h1>Retention has ended</h1>
          <p>This cancelled account can no longer read catalogue metadata.</p>
        </section>
      ) : null}
      {ctx.kind === "ready" && ctx.canRead ? (
        <>
          {!ctx.canWrite ? <p className="banner">{membershipNotice(ctx.creator.membership_state)}</p> : null}
          {children}
        </>
      ) : null}
    </DashboardShell>
  );
}
