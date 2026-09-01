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

// Internal, server-to-server only — apps/admin-dashboard/backend calls this
// whenever an agent/admin upgrades/changes a customer's package after signup.
export const updatePlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await tenantService.updateTenantPlan(parseInt(req.params.id, 10), req.body.planKey);
    res.json({ success: true });
  } catch (err) { next(err); }
};

// Internal, server-to-server only — deactivate/reactivate toggle from the
// admin dashboard's customer detail page.
export const setActive = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await tenantService.setTenantActive(parseInt(req.params.id, 10), !!req.body.isActive);
    res.json({ success: true });
  } catch (err) { next(err); }
};

// Internal, server-to-server only — permanent delete, admin-only on the
// admin-dashboard side. Drops the tenant's entire schema.
export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await tenantService.deleteTenant(parseInt(req.params.id, 10));
    res.json({ success: true });
  } catch (err) { next(err); }
};
