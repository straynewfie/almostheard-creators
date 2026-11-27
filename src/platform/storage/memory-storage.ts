import type { ObjectHead, ObjectStorage } from "@platform/storage/upload-lifecycle";

export function createMemoryStorage(): ObjectStorage & {
  objects: Map<string, { bytes: Uint8Array; contentType: string }>;
} {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  return {
    objects,
    async put(key, bytes, contentType) {
      objects.set(key, { bytes: Uint8Array.from(bytes), contentType });
    },
    async head(key): Promise<ObjectHead | null> {
      const found = objects.get(key);
      if (!found) return null;
      return {
        byteSize: found.bytes.byteLength,
        contentType: found.contentType,
        etag: `mem-${found.bytes.byteLength}`,
      };
    },
    async get(key) {
      const found = objects.get(key);
      return found ? Uint8Array.from(found.bytes) : null;
    },
    async copy(fromKey, toKey) {
      const found = objects.get(fromKey);
      if (!found) throw new Error("Missing source object.");
      objects.set(toKey, {
        bytes: Uint8Array.from(found.bytes),
        contentType: found.contentType,
      });
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}
