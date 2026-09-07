import { Response, NextFunction } from 'express';
import * as kitchenStationService from '../services/kitchenStation.service';
import { AuthRequest } from '../middleware/auth';

export const list = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await kitchenStationService.getKitchenStations(req.query.active_only === 'true');
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const create = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await kitchenStationService.createKitchenStation(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
};

export const update = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await kitchenStationService.updateKitchenStation(parseInt(req.params.id), req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const remove = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await kitchenStationService.deleteKitchenStation(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
};
