import express from 'express';

export function mountApi(app, db) {
  const router = express.Router();
  router.use(express.json());
  // Endpoints added in later tasks
  app.use('/api', router);
  return router;
}
