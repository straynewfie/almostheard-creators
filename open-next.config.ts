import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Application Worker adapter. The live static mission site still deploys from
 * wrangler.jsonc. Use wrangler.app.jsonc only after an explicit owner decision
 * to replace that Worker. Do not deploy from this repository without approval.
 */
export default defineCloudflareConfig({});
