import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { validateBody, validateParams, validateQuery } from '@core/middleware/validate';
import { authenticate, requireAdmin } from '../../shared/middleware/auth';
import { uuidParamSchema } from '../../shared/validation/index';
import * as controller from './detection.controller';
import {
  catalogCreateSchema,
  catalogQuerySchema,
  catalogStatusSchema,
  catalogUpdateSchema,
  dashboardQuerySchema,
  entityParamSchema,
  entityRowParamSchema,
  killSwitchCreateSchema,
  killSwitchUpdateSchema,
  packBuildSchema,
  promoteAliasSchema,
  skeletonParamSchema,
  templateFromSkeletonSchema,
} from './detection.validation';

/** Admin API for transaction detection (plan T7.3–T7.7), mounted at `/admin/detection`. */
const router = Router();
router.use(authenticate);
router.use(requireAdmin);

router.get('/dashboard', validateQuery(dashboardQuerySchema), asyncHandler(controller.getDashboard));
router.post('/rollup', asyncHandler(controller.runRollup));

router.get('/catalog/:entity', validateParams(entityParamSchema), validateQuery(catalogQuerySchema), asyncHandler(controller.listEntity));
router.post('/catalog/:entity', validateParams(entityParamSchema), validateBody(catalogCreateSchema), asyncHandler(controller.createEntityRow));
router.get('/catalog/:entity/:id', validateParams(entityRowParamSchema), asyncHandler(controller.getEntityRow));
router.patch('/catalog/:entity/:id', validateParams(entityRowParamSchema), validateBody(catalogUpdateSchema), asyncHandler(controller.updateEntityRow));
router.post('/catalog/:entity/:id/status', validateParams(entityRowParamSchema), validateBody(catalogStatusSchema), asyncHandler(controller.setEntityStatus));
router.get('/catalog/:entity/:id/history', validateParams(entityRowParamSchema), asyncHandler(controller.getEntityHistory));
router.post('/packs/build', validateBody(packBuildSchema), asyncHandler(controller.buildPacks));

router.get('/kill-switches', asyncHandler(controller.getKillSwitches));
router.post('/kill-switches', validateBody(killSwitchCreateSchema), asyncHandler(controller.addKillSwitch));
router.patch('/kill-switches/:id', validateParams(uuidParamSchema), validateBody(killSwitchUpdateSchema), asyncHandler(controller.changeKillSwitch));

router.get('/skeletons', asyncHandler(controller.getSkeletonQueue));
router.post('/skeletons/:hash/template', validateParams(skeletonParamSchema), validateBody(templateFromSkeletonSchema), asyncHandler(controller.templateFromSkeleton));
router.post('/skeletons/:hash/dismiss', validateParams(skeletonParamSchema), asyncHandler(controller.dismissSkeletonGroup));

router.get('/alias-candidates', asyncHandler(controller.getAliasCandidates));
router.post('/alias-candidates/promote', validateBody(promoteAliasSchema), asyncHandler(controller.promoteAlias));

router.get('/users/:id', validateParams(uuidParamSchema), asyncHandler(controller.getUserDetectionTab));
router.get('/deletions', asyncHandler(controller.getDeletionRequests));

export default router;
