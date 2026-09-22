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

const CSV_TYPES = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
const MAX_CSV_SIZE = 2 * 1024 * 1024;

export const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CSV_SIZE },
  fileFilter: (_req, file, cb) => {
    if (CSV_TYPES.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new AppError(400, 'Only CSV files are allowed', 'INVALID_FILE_TYPE'));
    }
  },
});
