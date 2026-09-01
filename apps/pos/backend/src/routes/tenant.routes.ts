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

// Server-to-server only — agent/admin upgrades/changes a customer's package
// anytime after signup, from the admin-dashboard customer detail page.
router.patch('/:id/plan', requireInternalApiKey, tenantController.updatePlan);

// Server-to-server only — deactivate/reactivate toggle.
router.patch('/:id/active', requireInternalApiKey, tenantController.setActive);

// Server-to-server only — permanent delete (admin-only, enforced on the
// admin-dashboard side before this is ever called).
router.delete('/:id', requireInternalApiKey, tenantController.remove);

export default router;
