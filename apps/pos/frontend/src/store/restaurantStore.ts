import { create } from 'zustand';

type OrderType = 'retail' | 'dine_in' | 'takeaway' | 'delivery';

interface RestaurantStore {
  orderType: OrderType;
  tableId: number | null;
  tableName: string | null;
  heldSaleId: number | null;
  // product_id -> quantity as of the last successful "Send to Kitchen" —
  // used to compute only what's new in the cart on the next send, so a
  // reprint never re-sends items the kitchen already has.
  lastSentQuantities: Record<number, number>;

  startOrder: (orderType: OrderType, tableId?: number, tableName?: string) => void;
  setHeldSale: (id: number) => void;
  recordSent: (quantities: Record<number, number>) => void;
  reset: () => void;
}

export const useRestaurantStore = create<RestaurantStore>((set) => ({
  orderType: 'retail',
  tableId: null,
  tableName: null,
  heldSaleId: null,
  lastSentQuantities: {},

  startOrder: (orderType, tableId, tableName) => {
    set({
      orderType,
      tableId: tableId ?? null,
      tableName: tableName ?? null,
      heldSaleId: null,
      lastSentQuantities: {},
    });
  },

  setHeldSale: (id) => set({ heldSaleId: id }),
  recordSent: (quantities) => set({ lastSentQuantities: quantities }),

  reset: () => set({
    orderType: 'retail',
    tableId: null,
    tableName: null,
    heldSaleId: null,
    lastSentQuantities: {},
  }),
}));
