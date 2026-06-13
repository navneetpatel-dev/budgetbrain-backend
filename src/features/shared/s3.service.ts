import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

function ensureUploadDir(): void {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

export interface UploadResult {
  key: string;
  url: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export async function uploadFile(
  file: Express.Multer.File,
  folder = 'receipts'
): Promise<UploadResult> {
  const ext = path.extname(file.originalname) || '.bin';
  const key = `${folder}/${uuidv4()}${ext}`;

  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });

    await client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
    );

    const url = `https://${env.S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
    return { key, url, fileName: file.originalname, fileType: file.mimetype, fileSize: file.size };
  }

  ensureUploadDir();
  const localPath = path.join(UPLOAD_DIR, path.basename(key));
  fs.writeFileSync(localPath, file.buffer);
  const url = `${env.APP_URL}/uploads/${path.basename(key)}`;

  return { key, url, fileName: file.originalname, fileType: file.mimetype, fileSize: file.size };
}
