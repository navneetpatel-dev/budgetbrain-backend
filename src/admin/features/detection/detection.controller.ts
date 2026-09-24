import type { Request, Response } from 'express';
import { successResponse } from '@core/http/errors';
import { AppError } from '@shared/errors';
import { writeAuditLog, AuditAction, AuditResource } from '@shared/audit/index';
import type { AuthRequest } from '../../shared/types/index';
import {
  catalogHistory,
  createCatalogRow,
  getCatalogRow,
  listCatalog,
  setCatalogStatus,
  updateCatalogRow,
  type CatalogEntity,
  type CatalogStatus,
} from '@modules/knowledge-base/catalog.service';
import { buildAllPacks, buildPack } from '@modules/knowledge-base/packBuilder.service';
import { createKillSwitch, listKillSwitches, setKillSwitchActive } from '@modules/knowledge-base/killSwitches.service';
import {
  getDetectionDashboard,
  getUserDetection,
  isAliasCandidate,
  listAliasCandidates,
  listDeletionRequests,
  runDetectionRollup,
} from '@modules/transaction-detection/detectionAdmin.service';
import {
  createTemplateFromSkeleton,
  dismissSkeleton,
  listSkeletonQueue,
  type TemplateFromSkeletonInput,
} from '@modules/transaction-detection/skeletons.service';

const adminId = (req: Request) => (req as AuthRequest).userId!;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function getDashboard(req: Request, res: Response) {
  const { from, to } = req.query as { from?: string; to?: string };
  const end = to ?? new Date().toISOString().slice(0, 10);
  const start = from ?? new Date(Date.parse(`${end}T00:00:00Z`) - 29 * DAY_MS).toISOString().slice(0, 10);
  successResponse(res, await getDetectionDashboard({ from: start, to: end }));
}

export async function runRollup(_req: Request, res: Response) {
  successResponse(res, await runDetectionRollup());
}

export async function listEntity(req: Request, res: Response) {
  const { entity } = req.params as { entity: CatalogEntity };
  successResponse(res, await listCatalog(entity, req.query as Parameters<typeof listCatalog>[1]));
}

export async function getEntityRow(req: Request, res: Response) {
  const { entity, id } = req.params as { entity: CatalogEntity; id: string };
  successResponse(res, await getCatalogRow(entity, id));
}

export async function createEntityRow(req: Request, res: Response) {
  const { entity } = req.params as { entity: CatalogEntity };
  successResponse(res, await createCatalogRow(entity, req.body as { id?: string; data: unknown }, adminId(req)), 201);
}

export async function updateEntityRow(req: Request, res: Response) {
  const { entity, id } = req.params as { entity: CatalogEntity; id: string };
  successResponse(res, await updateCatalogRow(entity, id, (req.body as { data: unknown }).data, adminId(req)));
}

export async function setEntityStatus(req: Request, res: Response) {
  const { entity, id } = req.params as { entity: CatalogEntity; id: string };
  const { status } = req.body as { status: CatalogStatus };
  successResponse(res, await setCatalogStatus(entity, id, status, adminId(req)));
}

export async function getEntityHistory(req: Request, res: Response) {
  const { entity, id } = req.params as { entity: CatalogEntity; id: string };
  successResponse(res, await catalogHistory(entity, id));
}

/** Builds the pack now instead of waiting for the nightly job (T7.3). */
export async function buildPacks(req: Request, res: Response) {
  const { country } = req.body as { country?: string };
  const result = country ? [{ country, ...(await buildPack(country)) }] : await buildAllPacks();
  await writeAuditLog({
    action: AuditAction.KB_PACK_BUILD,
    resource: AuditResource.KNOWLEDGE_BASE,
    actorUserId: adminId(req),
    metadata: { country: country ?? 'all' },
    afterState: { packs: result },
  });
  successResponse(res, result);
}

export async function getKillSwitches(_req: Request, res: Response) {
  successResponse(res, await listKillSwitches());
}

export async function addKillSwitch(req: Request, res: Response) {
  successResponse(res, await createKillSwitch(req.body as Parameters<typeof createKillSwitch>[0], adminId(req)), 201);
}

export async function changeKillSwitch(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const { active, reason } = req.body as { active: boolean; reason?: string };
  successResponse(res, await setKillSwitchActive(id, active, reason, adminId(req)));
}

export async function getSkeletonQueue(_req: Request, res: Response) {
  successResponse(res, await listSkeletonQueue());
}

export async function templateFromSkeleton(req: Request, res: Response) {
  const { hash } = req.params as { hash: string };
  const input = req.body as TemplateFromSkeletonInput;
  const created = await createTemplateFromSkeleton(hash, input, (template) =>
    createCatalogRow(
      'templates',
      {
        id: template.id,
        data: {
          institutionId: template.institutionId,
          language: template.language,
          skeleton: template.skeleton,
          fields: template.fields,
          direction: template.direction,
          transactionType: template.transactionType,
          subtype: template.subtype ?? null,
          paymentMethod: template.paymentMethod ?? null,
          dateOrder: template.dateOrder ?? null,
          sample: template.sample,
        },
      },
      adminId(req),
      { source: 'learned' }
    )
  );
  successResponse(res, created, 201);
}

export async function dismissSkeletonGroup(req: Request, res: Response) {
  const { hash } = req.params as { hash: string };
  await dismissSkeleton(hash);
  successResponse(res, { dismissed: true });
}

export async function getAliasCandidates(_req: Request, res: Response) {
  successResponse(res, await listAliasCandidates());
}

/** Turns a crowd candidate into a draft global alias of a known merchant (T7.5). */
export async function promoteAlias(req: Request, res: Response) {
  const { aliasKey, merchantId, country } = req.body as { aliasKey: string; merchantId: string; country?: string };
  if (!(await isAliasCandidate(aliasKey))) throw new AppError(404, 'Not an alias candidate', 'NOT_FOUND');
  const row = await createCatalogRow('aliases', { data: { merchantId, alias: aliasKey, country: country ?? '' } }, adminId(req), {
    source: 'crowd',
  });
  successResponse(res, row, 201);
}

export async function getUserDetectionTab(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  successResponse(res, await getUserDetection(id));
}

export async function getDeletionRequests(_req: Request, res: Response) {
  successResponse(res, await listDeletionRequests());
}
