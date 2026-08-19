interface CategoryTemplate {
  label: string;
  categories: { name: string; color: string }[];
}

export const CATEGORY_TEMPLATES: Record<string, CategoryTemplate> = {
  general: {
    label: 'General Retail',
    categories: [
      { name: 'General', color: '#6366f1' },
      { name: 'Food & Beverage', color: '#f59e0b' },
      { name: 'Electronics', color: '#3b82f6' },
      { name: 'Clothing', color: '#ec4899' },
      { name: 'Health & Beauty', color: '#10b981' },
      { name: 'Home & Office', color: '#8b5cf6' },
    ],
  },
  grocery: {
    label: 'Grocery / Supermarket',
    categories: [
      { name: 'Fresh Produce', color: '#22c55e' },
      { name: 'Dairy & Eggs', color: '#f59e0b' },
      { name: 'Bakery', color: '#d97706' },
      { name: 'Meat & Seafood', color: '#ef4444' },
      { name: 'Beverages', color: '#3b82f6' },
      { name: 'Snacks & Confectionery', color: '#a855f7' },
      { name: 'Rice & Grains', color: '#84cc16' },
      { name: 'Cooking Essentials', color: '#f97316' },
      { name: 'Frozen Foods', color: '#06b6d4' },
      { name: 'Personal Care', color: '#ec4899' },
      { name: 'Household', color: '#8b5cf6' },
      { name: 'Baby Products', color: '#fbbf24' },
    ],
  },
  hardware: {
    label: 'Hardware / Tools',
    categories: [
      { name: 'Hand Tools', color: '#f59e0b' },
      { name: 'Power Tools', color: '#ef4444' },
      { name: 'Plumbing', color: '#3b82f6' },
      { name: 'Electrical', color: '#eab308' },
      { name: 'Fasteners & Hardware', color: '#64748b' },
      { name: 'Paint & Supplies', color: '#a855f7' },
      { name: 'Building Materials', color: '#78716c' },
      { name: 'Safety Equipment', color: '#f97316' },
      { name: 'Garden & Outdoor', color: '#22c55e' },
      { name: 'Adhesives & Sealants', color: '#06b6d4' },
    ],
  },
  pharmacy: {
    label: 'Pharmacy',
    categories: [
      { name: 'Medicines', color: '#3b82f6' },
      { name: 'Personal Care', color: '#ec4899' },
      { name: 'Baby Care', color: '#fbbf24' },
      { name: 'Medical Devices', color: '#64748b' },
      { name: 'Vitamins & Supplements', color: '#22c55e' },
      { name: 'First Aid', color: '#ef4444' },
    ],
  },
  clothing: {
    label: 'Clothing / Fashion',
    categories: [
      { name: "Men's Wear", color: '#3b82f6' },
      { name: "Women's Wear", color: '#ec4899' },
      { name: "Kids' Wear", color: '#f59e0b' },
      { name: 'Footwear', color: '#78716c' },
      { name: 'Accessories', color: '#a855f7' },
      { name: 'Bags', color: '#8b5cf6' },
    ],
  },
  electronics: {
    label: 'Electronics',
    categories: [
      { name: 'Mobile Phones', color: '#3b82f6' },
      { name: 'Accessories', color: '#a855f7' },
      { name: 'Computers', color: '#64748b' },
      { name: 'Home Appliances', color: '#f59e0b' },
      { name: 'Audio & Video', color: '#ef4444' },
      { name: 'Gaming', color: '#22c55e' },
    ],
  },
};
