import Link from "next/link";
import { getDashboardContext } from "@domains/catalogue/context";
import { membershipNotice } from "@domains/music/membership";
import { signOutAction } from "@platform/auth/actions";

export default async function AccountPage() {
  const ctx = await getDashboardContext();
  if (ctx.kind !== "ready") return null;
  return (
    <section className="form-grid">
      <h1 className="page-title">Account</h1>
      <p>Email: {ctx.email || "Not available"}</p>
      <p>Membership: {ctx.creator.membership_state}</p>
      <p>{membershipNotice(ctx.creator.membership_state)}</p>
      <p>Billing, prices, and cancellation checkout are not part of this foundation.</p>
      <p><Link href="/reset-password">Reset password</Link></p>
      <form action={signOutAction}><button className="primary" type="submit">Sign out</button></form>
    </section>
  );
}
