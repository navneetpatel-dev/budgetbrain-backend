import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';
import { AppError } from '@shared/errors';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_SIZE = 5 * 1024 * 1024;

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(400, 'Only JPG, PNG, and PDF files are allowed', 'INVALID_FILE_TYPE'));
    }
  },
});

/** Statement files (plan T6.5) go to a temp folder, are streamed, and are deleted after the request. */
export const STATEMENT_UPLOAD_DIR = path.join(os.tmpdir(), 'budgetbrain-statements');
const MAX_STATEMENT_SIZE = 20 * 1024 * 1024;
const STATEMENT_EXTENSIONS = ['.csv', '.txt', '.ofx', '.qfx', '.qif', '.sta', '.mt940', '.940', '.xml'];

export const uploadStatement = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdir(STATEMENT_UPLOAD_DIR, { recursive: true, mode: 0o700 }, (err) => cb(err, STATEMENT_UPLOAD_DIR));
    },
    // A random name: the user's file name never reaches the disk.
    filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.upload`),
  }),
  limits: { fileSize: MAX_STATEMENT_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (STATEMENT_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new AppError(400, 'Upload a CSV, OFX, QFX, QIF, MT940 or CAMT.053 file', 'INVALID_FILE_TYPE'));
    }
  },
});
