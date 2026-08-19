import { Router } from 'express';
import * as tenantController from '../controllers/tenant.controller';
import { requireInternalApiKey } from '../middleware/auth';

const router = Router();

// Deliberately public — no `authenticate` — this is what a brand new
// business calls from the sign-up website, before they have any login at
// all yet.
router.post('/', tenantController.create);

// Server-to-server only — apps/admin-dashboard/backend calls this when an
// agent provisions an online customer with a customized feature set.
router.post('/provision', requireInternalApiKey, tenantController.provision);

export default router;
