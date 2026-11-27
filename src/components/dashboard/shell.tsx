"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@platform/auth/actions";

const links = [
  ["/dashboard", "Overview"],
  ["/dashboard/music/artists", "Artists"],
  ["/dashboard/music/releases", "Releases"],
  ["/dashboard/music/songs", "Songs"],
  ["/dashboard/storage", "Storage"],
  ["/dashboard/profile", "Profile"],
  ["/dashboard/account", "Account"],
  ["/dashboard/analytics", "Analytics"],
] as const;

export function DashboardShell({
  children,
  displayName,
}: {
  children: React.ReactNode;
  displayName: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <div className="app-shell">
      <aside className={open ? "sidebar open" : "sidebar"}>
        <Link className="brand" href="/">almost heard<span> / creators</span></Link>
        <p className="muted">{displayName}</p>
        <nav aria-label="Creator workspace">
          {links.map(([href, label]) => {
            const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined}>{label}</Link>
            );
          })}
        </nav>
        <form action={signOutAction}>
          <button type="submit">Sign out</button>
        </form>
      </aside>
      <div>
        <div className="dash-top">
          <div className="shell nav">
            <button className="menu-button primary" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
              Menu
            </button>
            <strong>{displayName}</strong>
          </div>
        </div>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
