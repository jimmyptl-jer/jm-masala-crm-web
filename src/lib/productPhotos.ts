/**
 * Catalogue photos: one picture for each approved product name, taken from the JM Masala marketing site (jmmasala-client) and served
 * from public/product-photos. The Products screens show a product's own uploaded packaging image first and fall back to this photo.
 */
const PHOTOS: Record<string, string> = {
  'cumin seeds': 'cumin-seeds',
  'coriander seeds': 'coriander-seeds',
  'fennel seeds': 'fennel-seeds',
  'fenugreek seeds': 'fenugreek-seeds',
  'mustard seeds': 'mustard-seeds',
  'sesame seeds': 'sesame-seeds',
  'ajwain seeds': 'ajwain-seeds',
  'psyllium husk (isabgol)': 'psyllium-husk',
  'turmeric': 'turmeric',
  'turmeric powder': 'turmeric-powder',
  'red chili powder': 'red-chilli-powder',
  'dry ginger slices': 'dry-ginger-slices',
  'dry ginger powder': 'dry-ginger-powder',
};

/** The photo of a catalogue product, or null: matched without case, exactly first, then without one trailing note in brackets ("Cumin Seeds (Europe)"). */
export function productPhoto(name: string): string | null {
  const find = (s: string) => PHOTOS[s.trim().toLocaleLowerCase()];
  const file = find(name) ?? find(name.replace(/\s*\([^()]*\)\s*$/, ''));
  return file ? `/product-photos/${file}.jpg` : null;
}
