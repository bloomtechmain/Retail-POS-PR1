import { Router, Request, Response } from 'express';
import db from '../db';
import { isValidKeyFormat, createActivationToken } from '../licenseUtils';

const router = Router();

interface VerifyBody {
  license_key?: string;
  machine_fingerprint?: string;
  machine_name?: string;
}

// POST /api/verify
// Called by the POS Electron app during first-time activation.
router.post('/', (req: Request, res: Response) => {
  const { license_key, machine_fingerprint, machine_name } = req.body as VerifyBody;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  const logAttempt = (licKey: string, fp: string, success: boolean, reason: string) => {
    db.prepare(
      `INSERT INTO activation_log (license_key, machine_fingerprint, machine_name, ip_address, success, reason)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(licKey, fp, machine_name || null, ip, success ? 1 : 0, reason);
  };

  // Input validation
  if (!license_key || !machine_fingerprint) {
    res.status(400).json({ success: false, error: 'license_key and machine_fingerprint are required' });
    return;
  }

  const key = license_key.trim().toUpperCase();

  if (!isValidKeyFormat(key)) {
    res.status(400).json({ success: false, error: 'Invalid license key format' });
    return;
  }

  if (!/^[a-f0-9]{64}$/i.test(machine_fingerprint)) {
    res.status(400).json({ success: false, error: 'Invalid machine fingerprint' });
    return;
  }

  // Fetch the license record
  const license = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(key) as
    | {
        id: number;
        license_key: string;
        is_active: number;
        is_used: number;
        machine_fingerprint: string | null;
        activation_token: string | null;
      }
    | undefined;

  if (!license) {
    logAttempt(key, machine_fingerprint, false, 'License not found');
    res.status(404).json({ success: false, error: 'License key not found' });
    return;
  }

  if (!license.is_active) {
    logAttempt(key, machine_fingerprint, false, 'License revoked');
    res.status(403).json({ success: false, error: 'This license has been revoked' });
    return;
  }

  // Already activated
  if (license.is_used) {
    // Allow re-activation only if the same machine is trying
    if (license.machine_fingerprint === machine_fingerprint) {
      // Return the same token — idempotent re-activation for the same machine
      logAttempt(key, machine_fingerprint, true, 'Re-activation (same machine)');
      res.json({ success: true, token: license.activation_token, reactivated: true });
    } else {
      logAttempt(key, machine_fingerprint, false, 'Already used on different machine');
      res.status(409).json({
        success: false,
        error: 'This license key has already been activated on another machine',
      });
    }
    return;
  }

  // First-time activation — sign and store
  try {
    const token = createActivationToken(key, machine_fingerprint);

    db.prepare(
      `UPDATE licenses
       SET is_used = 1,
           activated_at = datetime('now'),
           machine_fingerprint = ?,
           machine_name = ?,
           activation_token = ?
       WHERE license_key = ?`
    ).run(machine_fingerprint, machine_name || null, token, key);

    logAttempt(key, machine_fingerprint, true, 'First activation');
    res.json({ success: true, token, reactivated: false });
  } catch (err) {
    console.error('Activation signing error:', err);
    logAttempt(key, machine_fingerprint, false, 'Server signing error');
    res.status(500).json({ success: false, error: 'Server error during activation' });
  }
});

export default router;
