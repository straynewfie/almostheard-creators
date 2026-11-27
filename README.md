# Almost Heard Creators

Public mission site for **creators.almostheard.ca**, plus a private creator catalogue foundation.

The live Worker still deploys the static files in `public/`. The Next.js application is the private dashboard and catalogue. It does not replace that Worker until the owner chooses to switch deployment. Registration does not activate a membership, billing is not collected, and the public creator catalogue is closed.

## Static mission site

Open `public/index.html`, or run a simple static server from this directory.

## Private application

```text
npm.cmd install
npm.cmd run dev
```

Copy `.env.example` to `.env.local` and fill in the shared Almost Heard Supabase values. Do not commit secrets. All five files in `supabase/migrations` are already applied to that project. Do not run them again. Tests replay them on an isolated database. See `supabase/README.md` and `docs/implementation/OWNER-ACTIONS.md`.

```text
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

## Deploy via Cloudflare Workers (static assets)

1. In Cloudflare, create a Worker connected to this GitHub repository (or use Wrangler after cloning).
2. Use `public/` as the static assets directory, with no build command.
3. Attach the custom domain `creators.almostheard.ca` to that Worker once deployed.

`wrangler.jsonc` remains the static-asset Worker. `wrangler.app.jsonc` is the unused OpenNext configuration. **Deployment is deliberately manual.**

## Scope

The public site communicates the mission and identifies planned features as under development. Do not present creator subscriptions, public catalogues, or player promotion as available.
