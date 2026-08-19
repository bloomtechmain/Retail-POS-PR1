import { Router } from 'express';
import * as staffController from '../controllers/staff.controller';
import { authenticateStaff, requireStaffRole } from '../middleware/auth';

const router = Router();

// Public — no login exists yet for a brand new admin/agent.
router.post('/login', staffController.login);

router.use(authenticateStaff);

router.get('/agents', requireStaffRole('admin'), staffController.listAgents);
router.post('/agents', requireStaffRole('admin'), staffController.createAgent);
router.patch('/agents/:id', requireStaffRole('admin'), staffController.setAgentActive);

router.get('/customers', staffController.listCustomers);
router.post('/customers', staffController.createCustomer);
router.get('/customers/:id', staffController.customerDetail);
router.post('/customers/:id/reactivate', staffController.reactivateCustomer);

router.get('/dashboard', staffController.dashboard);

export default router;
