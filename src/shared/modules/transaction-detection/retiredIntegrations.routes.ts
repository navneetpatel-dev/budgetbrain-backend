import { Router } from 'express';

/**
 * The legacy `/integrations` parser (SMS, email, CSV) is retired (plan T6.3). Its paths answer
 * 410 Gone with the replacement, so an outdated app shows a clear message instead of a 404.
 */
const router = Router();

router.all('*', (_req, res) => {
  res.status(410).json({
    success: false,
    error: {
      code: 'ENDPOINT_RETIRED',
      message: 'This import has moved. Update the app to paste messages or import statements.',
      replacement: '/detected-transactions/ingest',
    },
  });
});

export default router;
