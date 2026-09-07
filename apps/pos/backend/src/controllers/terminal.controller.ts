import { Response, NextFunction, Request } from 'express';
import * as terminalService from '../services/terminal.service';
import { AuthRequest } from '../middleware/auth';

// Unauthenticated — called by a Terminal machine before any staff login
// exists on it. See terminal.service.ts's registerTerminal for the trust
// model (LAN-reachability + a seat cap, nothing more).
export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fingerprint, name } = req.body || {};
    const terminal = await terminalService.registerTerminal(fingerprint, name || null);
    res.json({ success: true, data: terminal });
  } catch (err) { next(err); }
};

export const list = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await terminalService.getTerminals();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const remove = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await terminalService.removeTerminal(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
};
