import { NextResponse } from "next/server";
import { getDashboardContext } from "@domains/catalogue/context";
import { loadConnection } from "@domains/media/connection";
import { isUuid } from "@domains/music/validation";
import { isSupabaseConfigured } from "@platform/supabase/env";
import { createServerSupabaseClient } from "@platform/supabase/server";
import { presignGet } from "@platform/storage/r2-storage";
import {
  ARTWORK_OBJECT_CACHE_CONTROL,
  PRIVATE_PLAYBACK_SECONDS,
} from "@platform/storage/signed-url-policy";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isUuid(id) || !isSupabaseConfigured()) {
    return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  }
  const dashboard = await getDashboardContext();
  if (dashboard.kind !== "ready" || !dashboard.canPreview) {
    return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  }
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("acc_media")
    .select("object_key, is_current, verification_state, kind")
    .eq("creator_id", dashboard.creator.id)
    .eq("id", id)
    .maybeSingle();
  if (!data?.is_current || data.verification_state !== "verified") {
    return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  }
  const loaded = await loadConnection(dashboard.creator.id);
  if (!loaded) {
    return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  }
  const artwork = data.kind === "cover";
  const signed = await presignGet({
    connection: loaded.connection,
    key: data.object_key,
    expiresIn: PRIVATE_PLAYBACK_SECONDS,
    responseCacheControl: artwork ? ARTWORK_OBJECT_CACHE_CONTROL : undefined,
  });
  return new NextResponse(null, {
    status: 302,
    headers: { location: signed, "cache-control": "no-store" },
  });
}
