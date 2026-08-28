import { Request, Response, NextFunction } from 'express';
import * as staffService from '../services/staff.service';
import { StaffAuthRequest } from '../middleware/auth';

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const result = await staffService.loginStaff(email, password);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

export const createAgent = async (req: StaffAuthRequest, res: Response, next: NextFunction) => {
  try {
    const agent = await staffService.createAgent(req.body, req.staff!.staff_id);
    res.status(201).json({ success: true, data: agent });
  } catch (err) { next(err); }
};

export const listAgents = async (req: StaffAuthRequest, res: Response, next: NextFunction) => {
  try {
    const agents = await staffService.listAgents();
    res.json({ success: true, data: agents });
  } catch (err) { next(err); }
};

export const setAgentActive = async (req: StaffAuthRequest, res: Response, next: NextFunction) => {
  try {
    const agent = await staffService.setAgentActive(parseInt(req.params.id, 10), !!req.body.is_active);
    res.json({ success: true, data: agent });
  } catch (err) { next(err); }
};

export const createCustomer = async (req: StaffAuthRequest, res: Response, next: NextFunction) => {
  try {
    const customer = await staffService.createCustomer(req.body, req.staff!.staff_id);
    res.status(201).json({ success: true, data: customer });
  } catch (err) { next(err); }
};

export const listCustomers = async (req: StaffAuthRequest, res: Response, next: NextFunction) => {
  try {
    const customers = await staffService.listCustomers({ staff_id: req.staff!.staff_id, role: req.staff!.role });
    res.json({ success: true, data: customers });
  } catch (err) { next(err); }
};

export const dashboard = async (req: StaffAuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = req.staff!.role === 'admin'
      ? await staffService.getAdminDashboardStats()
      : await staffService.getAgentDashboardStats(req.staff!.staff_id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const customerDetail = async (req: StaffAuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await staffService.getCustomerDetail(parseInt(req.params.id, 10), {
      staff_id: req.staff!.staff_id,
      role: req.staff!.role,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const reactivateCustomer = async (req: StaffAuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await staffService.reactivateCustomer(parseInt(req.params.id, 10), {
      staff_id: req.staff!.staff_id,
      role: req.staff!.role,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const updateCustomerFeatures = async (req: StaffAuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await staffService.updateCustomerFeatures(
      parseInt(req.params.id, 10),
      { staff_id: req.staff!.staff_id, role: req.staff!.role },
      req.body.customFeatures || null
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const setCustomerActive = async (req: StaffAuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await staffService.setCustomerActive(
      parseInt(req.params.id, 10),
      { staff_id: req.staff!.staff_id, role: req.staff!.role },
      !!req.body.is_active
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const deleteCustomer = async (req: StaffAuthRequest, res: Response, next: NextFunction) => {
  try {
    await staffService.permanentlyDeleteCustomer(parseInt(req.params.id, 10));
    res.json({ success: true });
  } catch (err) { next(err); }
};
