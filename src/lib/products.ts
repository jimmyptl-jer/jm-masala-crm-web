/**
 * The JM Masala product catalogue: the only product names the app accepts (products, buyers' interests, inquiries, quotations) and the
 * category of each. Names and categories only; everything commercial (grades, purity, GST, prices) is entered per product record and
 * only when verified. Black Pepper and Curry Leaf are deliberately not in the list. Keep it in step with api/src/catalogue.ts.
 */
export const APPROVED_PRODUCT_NAMES = [
  'Cumin Seeds',
  'Coriander Seeds',
  'Fennel Seeds',
  'Fenugreek Seeds',
  'Mustard Seeds',
  'Sesame Seeds',
  'Ajwain Seeds',
  'Psyllium Husk (Isabgol)',
  'Turmeric',
  'Turmeric Powder',
  'Red Chili Powder',
  'Dry Ginger Slices',
  'Dry Ginger Powder',
] as const;

export type ProductName = (typeof APPROVED_PRODUCT_NAMES)[number];

/** The category of each product (the API sets the same one on the record). */
export const PRODUCT_CATEGORY: Record<ProductName, string> = {
  'Cumin Seeds': 'Whole Spices',
  'Coriander Seeds': 'Whole Spices',
  'Fennel Seeds': 'Whole Spices',
  'Fenugreek Seeds': 'Whole Spices',
  'Mustard Seeds': 'Whole Spices',
  'Sesame Seeds': 'Oilseeds',
  'Ajwain Seeds': 'Whole Spices',
  'Psyllium Husk (Isabgol)': 'Seeds & Plant Products',
  'Turmeric': 'Whole Spices',
  'Turmeric Powder': 'Ground Spices',
  'Red Chili Powder': 'Ground Spices',
  'Dry Ginger Slices': 'Dried Spices',
  'Dry Ginger Powder': 'Ground Spices',
};

/**
 * Whether the text is a catalogue product: matched without case, exactly first, then without one trailing note in brackets
 * ("Cumin Seeds (Europe)" counts as Cumin Seeds; "Psyllium Husk (Isabgol)" is itself).
 */
export const isApprovedProduct = (name: string) => {
  const find = (s: string) => APPROVED_PRODUCT_NAMES.some((approved) => approved.toLocaleLowerCase() === s.trim().toLocaleLowerCase());
  return find(name) || find(name.replace(/\s*\([^()]*\)\s*$/, ''));
};
