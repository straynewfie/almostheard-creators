import { publicCatalogueDisabledBody } from "@domains/integration/catalogue-contract";

export function GET() {
  return Response.json(publicCatalogueDisabledBody(), {
    status: 403,
    headers: { "cache-control": "no-store" },
  });
}
