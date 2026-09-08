import { Router } from 'express';
import os from 'os';
import multer from 'multer';
import * as backupController from '../controllers/backup.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// Restore uploads go to disk (not memory) — a tenant's schema dump can be
// sizeable, and this avoids holding the whole file in RAM. 500MB cap is a
// generous ceiling for a single tenant's data; real uploads should be a
// small fraction of that.
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 500 * 1024 * 1024 },
});

router.use(authenticate);
router.use(requireRole('admin'));

// Deliberately no requireFeature gate — backup/restore is available on every
// plan, same as the offline desktop app's version of this feature.
router.get('/schedule', backupController.getSchedule);
router.put('/schedule', backupController.updateSchedule);
router.get('/export', backupController.exportBackup);
router.post('/restore', upload.single('file'), backupController.restoreBackup);
router.get('/scheduled', backupController.listScheduled);
router.get('/scheduled/:filename', backupController.downloadScheduled);

export default router;
