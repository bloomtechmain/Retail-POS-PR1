export interface UnitMeta {
  value: string;
  label: string;
  abbr: string;
  decimals: number;
  step: number;
}

export const UNIT_PRESETS: UnitMeta[] = [
  { value: 'piece', label: 'Piece', abbr: 'pcs', decimals: 0, step: 1 },
  { value: 'kg', label: 'Kilogram (kg)', abbr: 'kg', decimals: 3, step: 0.1 },
  { value: 'g', label: 'Gram (g)', abbr: 'g', decimals: 0, step: 10 },
  { value: 'litre', label: 'Litre (L)', abbr: 'L', decimals: 3, step: 0.1 },
  { value: 'ml', label: 'Millilitre (ml)', abbr: 'ml', decimals: 0, step: 10 },
  { value: 'box', label: 'Box', abbr: 'box', decimals: 0, step: 1 },
  { value: 'pack', label: 'Pack', abbr: 'pack', decimals: 0, step: 1 },
  { value: 'dozen', label: 'Dozen', abbr: 'dz', decimals: 0, step: 1 },
  { value: 'pair', label: 'Pair', abbr: 'pr', decimals: 0, step: 1 },
  { value: 'meter', label: 'Meter (m)', abbr: 'm', decimals: 2, step: 0.1 },
];

const PRESET_MAP: Record<string, UnitMeta> = Object.fromEntries(UNIT_PRESETS.map((u) => [u.value, u]));

// Falls back gracefully for any custom, shop-typed unit not in the preset list
// (e.g. "roll", "sheet") — matches the "any business, any unit" philosophy.
export function getUnitMeta(unitType?: string | null): UnitMeta {
  if (!unitType) return PRESET_MAP.piece;
  const preset = PRESET_MAP[unitType];
  if (preset) return preset;
  return { value: unitType, label: unitType, abbr: unitType, decimals: 2, step: 0.01 };
}

export function formatQuantity(qty: number | string, unitType?: string | null): string {
  const meta = getUnitMeta(unitType);
  const n = Number(qty) || 0;
  return `${n.toFixed(meta.decimals)} ${meta.abbr}`;
}
