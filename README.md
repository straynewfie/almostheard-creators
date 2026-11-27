# Almost Heard Creators

Lightweight, static mission and coming-soon website for **creators.almostheard.ca**.

This repository is deliberately separate from the Almost Heard main website, Canon and player. It has no login, database, payments or media integration yet.

## Preview

Open `public/index.html` in a browser, or run a simple static server from this directory.

## Deploy via Cloudflare Workers (static assets)

1. In Cloudflare, create a Worker connected to this GitHub repository (or use Wrangler after cloning).
2. Use `public/` as the static assets directory, with no build command.
3. Attach the custom domain `creators.almostheard.ca` to that Worker once deployed.

A minimal `wrangler.jsonc` is included for local Wrangler deployments. **Deployment is deliberately manual**; no GitHub Actions or automatic deployment workflow is configured in this repository.

## Scope

The site communicates the long-term mission and clearly identifies the planned features as under development. Never imply registrations, creator subscriptions or player promotion are already available.
