/** Product categories approved for JM Masala quotation and pricing workflows. */
export const APPROVED_PRODUCT_NAMES = [
  'Cumin Seeds',
  'Coriander Seeds',
  'Fennel Seeds',
  'Fenugreek Seeds',
  'Psyllium',
  'Turmeric',
  'Red Chili Powder',
  'Mustard Seeds',
] as const;

export const isApprovedProduct = (name: string) =>
  APPROVED_PRODUCT_NAMES.some((approved) => approved.toLocaleLowerCase() === name.trim().toLocaleLowerCase());
