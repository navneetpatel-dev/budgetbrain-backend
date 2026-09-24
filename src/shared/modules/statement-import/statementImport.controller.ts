import { promises as fs } from 'fs';
import type { Request, Response } from 'express';
import { successResponse } from '@core/http/errors';
import { AppError } from '@shared/errors';
import type { AuthRequest } from '@shared/types';
import { importStatement, previewStatement, type UploadedStatement } from './statementImport.service';
import { importOptionsSchema } from './statementImport.validator';
import type { ImportOptions } from './statementImport.types';

function readRequest(req: Request): { file: UploadedStatement; options: ImportOptions } {
  if (!req.file) throw new AppError(400, 'Choose a statement file', 'IMPORT_NO_FILE');
  let raw: unknown = {};
  const field = (req.body as { options?: string } | undefined)?.options;
  if (field) {
    try {
      raw = JSON.parse(field);
    } catch {
      throw new AppError(400, 'Import options are not valid JSON', 'VALIDATION_ERROR');
    }
  }
  const parsed = importOptionsSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid import options', 'VALIDATION_ERROR');
  return { file: { path: req.file.path, originalName: req.file.originalname }, options: parsed.data };
}

/** The uploaded file is removed however the request ends. */
async function withUpload<T>(req: Request, run: (file: UploadedStatement, options: ImportOptions) => Promise<T>): Promise<T> {
  try {
    const { file, options } = readRequest(req);
    return await run(file, options);
  } finally {
    if (req.file) await fs.rm(req.file.path, { force: true });
  }
}

export async function preview(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  successResponse(res, await withUpload(req, (file, options) => previewStatement(userId, file, options)));
}

export async function commit(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  successResponse(res, await withUpload(req, (file, options) => importStatement(userId, file, options)));
}
