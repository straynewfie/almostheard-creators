import "server-only";

import type { ObjectStorage } from "@platform/storage/upload-lifecycle";
import { createServerSupabaseClient } from "@platform/supabase/server";
import { createServiceRoleClient } from "@platform/supabase/service-role";

type ClaimRow = {
  bucket_name: string;
  object_key: string;
  lease_token: string;
};

export async function recoverInterruptedStorage(
  creatorId: string,
  bucket: string,
  storage: ObjectStorage,
): Promise<number> {
  const supabase = await createServerSupabaseClient();
  await supabase.rpc("acc_recover_obsolete_audio", { p_creator_id: creatorId });
  const admin = createServiceRoleClient();
  await admin.rpc("acc_queue_finished_staging", { p_creator_id: creatorId, p_bucket: bucket });
  const claimed = await admin.rpc("acc_claim_storage_deletions", { p_creator_id: creatorId });
  const rows = Array.isArray(claimed.data) ? (claimed.data as ClaimRow[]) : [];
  let removed = 0;
  for (const row of rows) {
    if (row.bucket_name !== bucket) continue;
    const granted = await admin.rpc("acc_grant_storage_deletion", {
      p_creator_id: creatorId,
      p_bucket: row.bucket_name,
      p_object_key: row.object_key,
      p_lease_token: row.lease_token,
    });
    if (granted.data !== true) continue;
    try {
      await storage.delete(row.object_key);
      if (await storage.head(row.object_key)) continue;
      await admin.rpc("acc_complete_storage_deletion", {
        p_creator_id: creatorId,
        p_bucket: row.bucket_name,
        p_object_key: row.object_key,
      });
      removed += 1;
    } catch {
      await admin.rpc("acc_queue_storage_deletion", {
        p_creator_id: creatorId,
        p_bucket: row.bucket_name,
        p_object_key: row.object_key,
        p_error: "The previous file could not be deleted.",
      });
    }
  }
  return removed;
}
