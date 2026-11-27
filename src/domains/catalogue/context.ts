import "server-only";

import { cache } from "react";
import { canMutateCatalogue, canReadMetadata } from "@domains/music/membership";
import type { MembershipState } from "@domains/music/types";
import { publicationConfigFromEnv } from "@domains/music/publication";
import {
  hasServiceRoleKey,
  isSupabaseConfigured,
  supabaseConfigStatus,
} from "@platform/supabase/env";
import { createServerSupabaseClient } from "@platform/supabase/server";

export type CreatorProfile = {
  id: string;
  auth_user_id: string;
  display_name: string;
  handle: string | null;
  membership_state: MembershipState;
  cancelled_at: string | null;
  retention_until: string | null;
};

export type DashboardContext =
  | { kind: "unconfigured"; missing: string[] }
  | { kind: "anonymous" }
  | { kind: "unverified" }
  | {
      kind: "ready";
      creator: CreatorProfile;
      email: string;
      canWrite: boolean;
      canRead: boolean;
      canPreview: boolean;
      publicationTestMode: boolean;
      storageConfigured: boolean;
    };

function isMembershipState(value: string): value is MembershipState {
  return value === "active" || value === "inactive" || value === "cancelled";
}

export const getDashboardContext = cache(async (): Promise<DashboardContext> => {
  const status = supabaseConfigStatus();
  if (!status.configured || !isSupabaseConfigured()) {
    return { kind: "unconfigured", missing: status.missing };
  }
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { kind: "anonymous" };
  if (!user.email_confirmed_at) return { kind: "unverified" };

  const displayName =
    typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : "Creator";
  await supabase.rpc("acc_ensure_creator_profile", {
    p_display_name: displayName,
  });
  const { data: creator, error } = await supabase
    .from("acc_creators")
    .select(
      "id, auth_user_id, display_name, handle, membership_state, cancelled_at, retention_until",
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error || !creator || !isMembershipState(creator.membership_state)) {
    throw new Error("creator_profile_unavailable");
  }
  const profile = creator as CreatorProfile;
  const canRead = canReadMetadata(
    { state: profile.membership_state, retentionUntil: profile.retention_until },
    new Date(),
  );
  return {
    kind: "ready",
    creator: profile,
    email: user.email ?? "",
    canWrite: canMutateCatalogue(profile.membership_state),
    canRead,
    canPreview: profile.membership_state === "active",
    publicationTestMode: publicationConfigFromEnv(process.env).allowPublication,
    storageConfigured: hasServiceRoleKey(),
  };
});
