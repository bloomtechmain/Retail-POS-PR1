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

export interface ReceiveUnitOption {
  value: string;
  label: string;
  abbr: string;
  step: number;
  // Multiply a quantity entered in this unit by this factor to get the
  // equivalent quantity in the product's own (base) unit.
  factor: number;
}

// Sibling units a GRN line may be entered in, grouped by a product's own
// (base) unit — e.g. a kg-tracked product can still be received in grams,
// for the receipts where that's how the delivery is actually weighed.
// Always includes the base unit itself (factor 1) first.
const CONVERSION_GROUPS: Record<string, ReceiveUnitOption[]> = {
  kg: [
    { value: 'kg', label: 'Kilogram (kg)', abbr: 'kg', step: 0.1, factor: 1 },
    { value: 'g', label: 'Gram (g)', abbr: 'g', step: 10, factor: 0.001 },
  ],
  g: [
    { value: 'g', label: 'Gram (g)', abbr: 'g', step: 10, factor: 1 },
    { value: 'kg', label: 'Kilogram (kg)', abbr: 'kg', step: 0.1, factor: 1000 },
  ],
  litre: [
    { value: 'litre', label: 'Litre (L)', abbr: 'L', step: 0.1, factor: 1 },
    { value: 'ml', label: 'Millilitre (ml)', abbr: 'ml', step: 10, factor: 0.001 },
  ],
  ml: [
    { value: 'ml', label: 'Millilitre (ml)', abbr: 'ml', step: 10, factor: 1 },
    { value: 'litre', label: 'Litre (L)', abbr: 'L', step: 0.1, factor: 1000 },
  ],
};

// Units a GRN line for this product's base unit may be received in. For
// units with no known sibling (piece, box, custom, ...) this is just the
// base unit itself.
export function getReceiveUnitOptions(baseUnitType?: string | null): ReceiveUnitOption[] {
  const group = baseUnitType ? CONVERSION_GROUPS[baseUnitType] : undefined;
  if (group) return group;
  const meta = getUnitMeta(baseUnitType);
  return [{ value: meta.value, label: meta.label, abbr: meta.abbr, step: meta.step, factor: 1 }];
}

// Converts a quantity entered in `fromUnit` into the product's base unit
// (e.g. 500 g entered against a kg-tracked product -> 0.5).
export function convertToBaseUnit(quantity: number, fromUnit: string, baseUnitType?: string | null): number {
  const option = getReceiveUnitOptions(baseUnitType).find((o) => o.value === fromUnit);
  const factor = option ? option.factor : 1;
  return Math.round(quantity * factor * 1000) / 1000;
}

// Inverse of convertToBaseUnit — expresses a base-unit quantity (e.g. the
// cart's stored 0.5 kg) in whichever sibling unit is currently being
// displayed/entered (e.g. 500 when the shopper switched the row to grams).
export function convertFromBaseUnit(baseQuantity: number, toUnit: string, baseUnitType?: string | null): number {
  const option = getReceiveUnitOptions(baseUnitType).find((o) => o.value === toUnit);
  const factor = option && option.factor !== 0 ? option.factor : 1;
  return Math.round((baseQuantity / factor) * 1000) / 1000;
}
