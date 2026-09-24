import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { gunzipSync, gzipSync } from 'zlib';
import { env } from '@config/env';
import { getSignedDownloadUrl } from '@core/storage/s3.service';

/**
 * Where built packs live (plan T4.3): S3 when configured, otherwise the local uploads folder
 * that the apps already serve at `/uploads`. S3 objects are gzip-encoded with
 * `Content-Encoding: gzip`, which Android and iOS HTTP stacks decode transparently.
 */
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

function usesS3(): boolean {
  return Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
}

async function s3() {
  const sdk = await import('@aws-sdk/client-s3');
  const client = new sdk.S3Client({
    region: env.AWS_REGION,
    credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID!, secretAccessKey: env.AWS_SECRET_ACCESS_KEY! },
  });
  return { sdk, client };
}

/** Local files are flat in the uploads folder, so keys must have unique base names. */
function localPath(key: string): string {
  return path.join(UPLOAD_DIR, path.basename(key));
}

export async function putPackFile(key: string, body: string): Promise<{ bytes: number }> {
  if (usesS3()) {
    const { sdk, client } = await s3();
    const gz = gzipSync(Buffer.from(body, 'utf8'));
    await client.send(
      new sdk.PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: gz,
        ContentType: 'application/json',
        ContentEncoding: 'gzip',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );
    return { bytes: gz.length };
  }
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(localPath(key), body, 'utf8');
  return { bytes: Buffer.byteLength(body) };
}

export async function getPackFile(key: string): Promise<string> {
  if (usesS3()) {
    const { sdk, client } = await s3();
    const out = await client.send(new sdk.GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    const bytes = Buffer.from(await out.Body!.transformToByteArray());
    return (out.ContentEncoding === 'gzip' ? gunzipSync(bytes) : bytes).toString('utf8');
  }
  return readFile(localPath(key), 'utf8');
}

/** A URL the app can download from: a short-lived signed S3 URL, or the local uploads path. */
export async function packFileUrl(key: string): Promise<string> {
  if (usesS3()) return getSignedDownloadUrl(key);
  return `${env.APP_URL}/uploads/${path.basename(key)}`;
}
