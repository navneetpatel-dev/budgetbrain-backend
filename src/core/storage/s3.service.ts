import type { UploadResult } from '@shared/types';
import { sniffReceiptFileType } from '@shared/uploads/sniffFileType';
import { AppError } from '@shared/errors';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { env } from '@config/env';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
export const SIGNED_URL_EXPIRES_IN = 15 * 60;

function ensureUploadDir(): void {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function usesS3(): boolean {
  return Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
}

async function getS3Client() {
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

export async function getSignedDownloadUrl(key: string, fallbackUrl?: string): Promise<string> {
  if (!usesS3()) {
    return fallbackUrl ?? `${env.APP_URL}/uploads/${path.basename(key)}`;
  }

  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const client = await getS3Client();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), {
    expiresIn: SIGNED_URL_EXPIRES_IN,
  });
}

export async function withSignedDownloadUrl<T extends { s3Key: string; s3Url: string }>(
  attachment: T
): Promise<T & { s3UrlExpiresIn: number }> {
  const s3Url = await getSignedDownloadUrl(attachment.s3Key, attachment.s3Url);
  return { ...attachment, s3Url, s3UrlExpiresIn: SIGNED_URL_EXPIRES_IN };
}

export async function uploadFile(
  file: Express.Multer.File,
  folder = 'budgetbrain/receipts'
): Promise<UploadResult> {
  const sniffed = sniffReceiptFileType(file.buffer);
  if (!sniffed) {
    throw new AppError(400, 'Only JPG, PNG, and PDF files are allowed', 'INVALID_FILE_TYPE');
  }
  const key = `${folder}/${uuidv4()}${sniffed.ext}`;

  if (usesS3()) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await getS3Client();

    await client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: sniffed.mime,
      })
    );

    const url = `https://${env.S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
    return { key, url, fileName: file.originalname, fileType: sniffed.mime, fileSize: file.size };
  }

  ensureUploadDir();
  const localPath = path.join(UPLOAD_DIR, path.basename(key));
  await fs.promises.writeFile(localPath, file.buffer);
  const url = `${env.APP_URL}/uploads/${path.basename(key)}`;

  return { key, url, fileName: file.originalname, fileType: sniffed.mime, fileSize: file.size };
}

/**
 * Uploads a server-generated buffer (report exports, etc.) — unlike uploadFile, this
 * takes an already-known content type and file name instead of sniffing/validating a
 * user-uploaded Multer file, since the buffer is produced by our own code, not a client.
 */
export async function uploadGeneratedReport(
  buffer: Buffer,
  fileName: string,
  contentType: string,
  folder = 'budgetbrain/reports'
): Promise<{ key: string; url: string }> {
  const key = `${folder}/${fileName}`;

  if (usesS3()) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await getS3Client();

    await client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    const url = `https://${env.S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
    return { key, url };
  }

  ensureUploadDir();
  const localPath = path.join(UPLOAD_DIR, path.basename(key));
  await fs.promises.writeFile(localPath, buffer);
  const url = `${env.APP_URL}/uploads/${path.basename(key)}`;
  return { key, url };
}

export async function deleteFile(key: string): Promise<void> {
  if (usesS3()) {
    try {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      const client = await getS3Client();
      await client.send(
        new DeleteObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key,
        })
      );
    } catch (err) {
      console.warn('[Storage] Failed to delete S3 file:', key, err);
    }
    return;
  }

  try {
    const localPath = path.join(UPLOAD_DIR, path.basename(key));
    if (fs.existsSync(localPath)) {
      await fs.promises.unlink(localPath);
    }
  } catch (err) {
    console.warn('[Storage] Failed to delete local file:', key, err);
  }
}

