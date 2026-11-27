import { ProfileForm } from "@components/forms/profile-form";
import { getDashboardContext } from "@domains/catalogue/context";

export default async function ProfilePage() {
  const ctx = await getDashboardContext();
  if (ctx.kind !== "ready") return null;
  return (
    <section>
      <h1 className="page-title">Creator profile</h1>
      <p className="muted">The creator account is separate from the artist identities in the catalogue.</p>
      <ProfileForm
        displayName={ctx.creator.display_name}
        handle={ctx.creator.handle}
        canWrite={ctx.canWrite}
      />
    </section>
  );
}
