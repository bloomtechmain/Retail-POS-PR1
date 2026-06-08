import { create } from 'zustand';
import { CartItem, Product } from '../types';

const round2 = (v: number) => Math.round(v * 100) / 100;

interface POSStore {
  cart: CartItem[];
  billDiscount: number;
  customerName: string;
  notes: string;
  appliedPromotionNames: string[];
  appliedPromotionIds: number[];
  prePromoCart: CartItem[] | null;

  // Computed
  subtotal: () => number;
  itemDiscountTotal: () => number;
  taxTotal: () => number;
  total: () => number;

  // Actions
  addProduct: (product: Product, qty?: number) => void;
  removeItem: (productId: number) => void;
  updateQty: (productId: number, qty: number) => void;
  updateItemDiscount: (productId: number, discount: number) => void;
  updateUnitPrice: (productId: number, price: number) => void;
  setBillDiscount: (discount: number) => void;
  setCustomerName: (name: string) => void;
  setNotes: (notes: string) => void;
  clearCart: () => void;
  applyCartPromotions: (promotedItems: CartItem[], promoName: string, promoId: number) => void;
  clearPromotions: () => void;
}

export const usePOSStore = create<POSStore>((set, get) => ({
  cart: [],
  billDiscount: 0,
  customerName: '',
  notes: '',
  appliedPromotionNames: [],
  appliedPromotionIds: [],
  prePromoCart: null,

  subtotal: () => {
    return round2(get().cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0));
  },

  itemDiscountTotal: () => {
    return round2(get().cart.reduce((sum, item) => sum + item.item_discount * item.quantity, 0));
  },

  taxTotal: () => {
    return round2(
      get().cart.reduce((sum, item) => {
        const taxable = (item.unit_price - item.item_discount) * item.quantity;
        return sum + (taxable * item.tax_rate) / 100;
      }, 0)
    );
  },

  total: () => {
    const subtotal = get().subtotal();
    const itemDiscount = get().itemDiscountTotal();
    const tax = get().taxTotal();
    const billDiscount = get().billDiscount;
    return round2(Math.max(0, subtotal - itemDiscount - billDiscount + tax));
  },

  addProduct: (product, qty = 1) => {
    set((state) => {
      const existing = state.cart.find((i) => i.product_id === product.id);
      const newItem: CartItem = {
        product_id: product.id,
        product_name: product.name,
        barcode: product.barcode,
        sku: product.sku,
        quantity: qty,
        unit_price: round2(product.selling_price),
        original_price: round2(product.selling_price),
        cost_price: round2(product.avg_cost || product.cost_price),
        item_discount: 0,
        tax_rate: product.tax_rate || 0,
        category_id: product.category_id,
      };

      const updatedCart = existing
        ? state.cart.map((i) =>
            i.product_id === product.id
              ? { ...i, quantity: round2(i.quantity + qty) }
              : i
          )
        : [...state.cart, newItem];

      // Keep prePromoCart in sync so clearing promotions doesn't lose new items
      let updatedPrePromoCart = state.prePromoCart;
      if (updatedPrePromoCart) {
        const existingPre = updatedPrePromoCart.find((i) => i.product_id === product.id);
        updatedPrePromoCart = existingPre
          ? updatedPrePromoCart.map((i) =>
              i.product_id === product.id
                ? { ...i, quantity: round2(i.quantity + qty) }
                : i
            )
          : [...updatedPrePromoCart, newItem];
      }

      return { cart: updatedCart, prePromoCart: updatedPrePromoCart };
    });
  },

  removeItem: (productId) => {
    set((state) => ({
      cart: state.cart.filter((i) => i.product_id !== productId),
      prePromoCart: state.prePromoCart
        ? state.prePromoCart.filter((i) => i.product_id !== productId)
        : null,
    }));
  },

  updateQty: (productId, qty) => {
    if (qty <= 0) {
      get().removeItem(productId);
      return;
    }
    set((state) => ({
      cart: state.cart.map((i) =>
        i.product_id === productId ? { ...i, quantity: round2(qty) } : i
      ),
      prePromoCart: state.prePromoCart
        ? state.prePromoCart.map((i) =>
            i.product_id === productId ? { ...i, quantity: round2(qty) } : i
          )
        : null,
    }));
  },

  updateItemDiscount: (productId, discount) => {
    set((state) => ({
      cart: state.cart.map((i) =>
        i.product_id === productId ? { ...i, item_discount: round2(Math.max(0, discount)) } : i
      ),
    }));
  },

  updateUnitPrice: (productId, price) => {
    set((state) => ({
      cart: state.cart.map((i) =>
        i.product_id === productId ? { ...i, unit_price: round2(Math.max(0, price)) } : i
      ),
    }));
  },

  setBillDiscount: (discount) => {
    set({ billDiscount: round2(Math.max(0, discount)) });
  },

  setCustomerName: (name) => set({ customerName: name }),
  setNotes: (notes) => set({ notes }),

  clearCart: () => {
    set({
      cart: [],
      billDiscount: 0,
      customerName: '',
      notes: '',
      appliedPromotionNames: [],
      appliedPromotionIds: [],
      prePromoCart: null,
    });
  },

  // Appends one promotion at a time; saves original cart on first call
  applyCartPromotions: (promotedItems, promoName, promoId) => {
    set((state) => ({
      prePromoCart: state.prePromoCart ?? [...state.cart],
      cart: promotedItems,
      appliedPromotionNames: [...state.appliedPromotionNames, promoName],
      appliedPromotionIds: [...state.appliedPromotionIds, promoId],
    }));
  },

  clearPromotions: () => {
    set((state) => ({
      cart: state.prePromoCart ?? state.cart,
      appliedPromotionNames: [],
      appliedPromotionIds: [],
      prePromoCart: null,
    }));
  },
}));
