import { v4 as uuidv4 } from 'uuid';

export const generateSaleNumber = (): string => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `INV-${date}-${rand}`;
};

export const generateGRNNumber = (): string => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `GRN-${date}-${rand}`;
};

export const generateReturnNumber = (): string => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `RET-${date}-${rand}`;
};

export const generateShiftNumber = (): string => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 900) + 100;
  return `SHF-${date}-${rand}`;
};

export const generateSKU = (): string => {
  return `SKU-${uuidv4().slice(0, 8).toUpperCase()}`;
};

export const round2 = (value: number): number => {
  return Math.round(value * 100) / 100;
};

export const calculateWeightedAvgCost = (
  currentStock: number,
  currentAvgCost: number,
  newQty: number,
  newCost: number
): number => {
  const totalQty = currentStock + newQty;
  if (totalQty <= 0) return newCost;
  const totalValue = currentStock * currentAvgCost + newQty * newCost;
  return round2(totalValue / totalQty);
};
