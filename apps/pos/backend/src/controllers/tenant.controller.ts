import { Request, Response, NextFunction } from 'express';
import * as tenantService from '../services/tenant.service';

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await tenantService.provisionTenant({
      businessName: req.body.businessName,
      businessType: req.body.businessType,
      templateKey: req.body.templateKey,
      adminName: req.body.adminName,
      adminEmail: req.body.adminEmail,
      adminPassword: req.body.adminPassword,
      planKey: req.body.planKey,
      currencyCode: req.body.currencyCode,
      currencySymbol: req.body.currencySymbol,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
};

// Internal, server-to-server only (see requireInternalApiKey) — called by
// apps/admin-dashboard/backend when an agent provisions an online customer.
// The only difference from the public `create` above: accepts
// `customFeatures`, which a public caller must never be able to set.
export const provision = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await tenantService.provisionTenant({
      businessName: req.body.businessName,
      adminName: req.body.adminName,
      adminEmail: req.body.adminEmail,
      adminPassword: req.body.adminPassword,
      planKey: req.body.planKey,
      customFeatures: req.body.customFeatures,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
};
