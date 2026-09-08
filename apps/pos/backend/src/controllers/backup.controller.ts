import { Response, NextFunction } from 'express';
import fs from 'fs';
import * as backupService from '../services/backup.service';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/error';

export const getSchedule = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await backupService.getBackupSchedule();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const updateSchedule = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await backupService.updateBackupSchedule(req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const exportBackup = async (req: AuthRequest, res: Response, next: NextFunction) => {
  let filePath: string | undefined;
  try {
    const result = await backupService.exportOnDemandBackup();
    filePath = result.filePath;
    res.download(result.filePath, result.downloadName, (err) => {
      // res.download already sent (or failed to send) the response by the
      // time this fires — the temp file just needs cleaning up either way.
      if (filePath) fs.unlink(filePath, () => {});
      if (err && !res.headersSent) next(err);
    });
  } catch (err) {
    if (filePath) fs.unlink(filePath, () => {});
    next(err);
  }
};

export const restoreBackup = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const uploadedPath = req.file?.path;
  try {
    if (!uploadedPath) throw createError('No backup file uploaded', 400);
    if (req.body.confirm !== 'true') {
      throw createError('Restore must be explicitly confirmed', 400);
    }
    await backupService.restoreFromUpload(uploadedPath);
    res.json({ success: true, message: 'Restore complete' });
  } catch (err) {
    next(err);
  } finally {
    if (uploadedPath) fs.unlink(uploadedPath, () => {});
  }
};

export const listScheduled = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await backupService.listScheduledBackups();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const downloadScheduled = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const filePath = await backupService.getScheduledBackupPath(req.params.filename);
    res.download(filePath, req.params.filename, (err) => {
      if (err && !res.headersSent) next(err);
    });
  } catch (err) { next(err); }
};
