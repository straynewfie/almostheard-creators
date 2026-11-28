import "server-only";

import { createServiceRoleClient } from "@platform/supabase/service-role";

export async function queueObjectDeletion(
  creatorId: string,
  bucket: string,
  objectKey: string,
  lastError: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  await admin.rpc("acc_queue_storage_deletion", {
    p_creator_id: creatorId,
    p_bucket: bucket,
    p_object_key: objectKey,
    p_error: lastError.slice(0, 300),
  });
}

export type StuckDeletion = {
  objectKey: string;
  attempts: number;
  lastError: string | null;
};

export async function listStuckDeletions(creatorId: string, bucket: string): Promise<StuckDeletion[]> {
  const admin = createServiceRoleClient();
  const listed = await admin.rpc("acc_list_storage_deletions", { p_creator_id: creatorId });
  if (!Array.isArray(listed.data)) return [];
  return listed.data.flatMap((row: {
    bucket_name?: string;
    object_key?: string;
    attempts?: number;
    last_error?: string | null;
  }) => (
    row.bucket_name === bucket && row.object_key && (row.attempts ?? 0) >= 8
      ? [{ objectKey: row.object_key, attempts: row.attempts ?? 0, lastError: row.last_error ?? null }]
      : []
  ));
}

export async function clearObjectDeletion(
  creatorId: string,
  bucket: string,
  objectKey: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  await admin.rpc("acc_complete_storage_deletion", {
    p_creator_id: creatorId,
    p_bucket: bucket,
    p_object_key: objectKey,
  });
}
