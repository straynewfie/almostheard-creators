import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type EncryptedSecret = {
  ciphertext: Buffer;
  nonce: Buffer;
  tag: Buffer;
  keyVersion: number;
};

export function masterKeyFromBase64(value: string): Buffer {
  const key = Buffer.from(value.trim(), "base64");
  if (key.length !== 32) {
    throw new Error("The credential master key must be 32 bytes of base64.");
  }
  return key;
}

export function encryptSecret(
  plaintext: string,
  masterKey: Buffer,
  keyVersion: number,
): EncryptedSecret {
  if (!Number.isInteger(keyVersion) || keyVersion < 1) {
    throw new Error("The key version is not valid.");
  }
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return { ciphertext, nonce, tag: cipher.getAuthTag(), keyVersion };
}

export function decryptSecret(
  secret: EncryptedSecret,
  masterKey: Buffer,
): string {
  const decipher = createDecipheriv("aes-256-gcm", masterKey, secret.nonce);
  decipher.setAuthTag(secret.tag);
  return Buffer.concat([
    decipher.update(secret.ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Redacts storage secrets from diagnostic objects. */
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => redactSecrets(entry));
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/secret|ciphertext|token|password|accesskey|authorization/i.test(key)) {
      output[key] = "[redacted]";
    } else {
      output[key] = redactSecrets(entry);
    }
  }
  return output;
}
