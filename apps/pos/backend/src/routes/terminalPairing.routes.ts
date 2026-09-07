import { Router } from 'express';
import * as terminalController from '../controllers/terminal.controller';

// Deliberately NOT behind `authenticate` — a Terminal calls this before any
// staff has logged in on it. Mounted directly in app.ts, not under the
// normal /api router, so it's obvious at a glance that this one endpoint
// is intentionally public (LAN-reachability is the only real gate; see
// terminal.service.ts for the actual multi_terminal/seat-cap checks).
const router = Router();

router.post('/register', terminalController.register);

export default router;
