import "server-only";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2EndpointForAccount } from "@platform/storage/endpoint";
import type { ObjectStorage } from "@platform/storage/upload-lifecycle";

export type R2Connection = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function clientFor(connection: R2Connection): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: r2EndpointForAccount(connection.accountId),
    credentials: {
      accessKeyId: connection.accessKeyId,
      secretAccessKey: connection.secretAccessKey,
    },
    forcePathStyle: true,
  });
}

export function r2Storage(connection: R2Connection): ObjectStorage {
  const client = clientFor(connection);
  return {
    async put(key, bytes, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: connection.bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
        }),
      );
    },
    async head(key) {
      try {
        const result = await client.send(
          new HeadObjectCommand({ Bucket: connection.bucket, Key: key }),
        );
        return {
          byteSize: Number(result.ContentLength ?? 0),
          contentType: result.ContentType ?? null,
          etag: result.ETag ?? null,
        };
      } catch {
        return null;
      }
    },
    async get(key) {
      const result = await client.send(
        new GetObjectCommand({ Bucket: connection.bucket, Key: key }),
      );
      const body = result.Body;
      if (!body) return null;
      return new Uint8Array(await body.transformToByteArray());
    },
    async copy(fromKey, toKey) {
      await client.send(
        new CopyObjectCommand({
          Bucket: connection.bucket,
          CopySource: `${connection.bucket}/${fromKey}`,
          Key: toKey,
        }),
      );
    },
    async delete(key) {
      await client.send(
        new DeleteObjectCommand({ Bucket: connection.bucket, Key: key }),
      );
    },
  };
}

export async function presignPut(input: {
  connection: R2Connection;
  key: string;
  contentType: string;
  expiresIn: number;
}): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: input.connection.bucket,
    Key: input.key,
    ContentType: input.contentType,
  });
  return getSignedUrl(clientFor(input.connection), command, {
    expiresIn: input.expiresIn,
  });
}

export async function presignGet(input: {
  connection: R2Connection;
  key: string;
  expiresIn: number;
}): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: input.connection.bucket,
    Key: input.key,
  });
  return getSignedUrl(clientFor(input.connection), command, {
    expiresIn: input.expiresIn,
  });
}
