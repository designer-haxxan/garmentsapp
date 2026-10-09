// Garment-shop reference data: sections (Kids / Men / Women), garment types, size charts and colours.
// Everything here is a starting point; the shopkeeper can type any other size, colour or type.

export const SECTIONS = {
  kids: { id: 'kids', name: 'Kids', color: '#f472b6' },
  men: { id: 'men', name: 'Men', color: '#2563eb' },
  women: { id: 'women', name: 'Women', color: '#db2777' },
};
export const SECTION_LIST = Object.values(SECTIONS);
export const sectionName = (id) => SECTIONS[id]?.name || '';

export const GARMENT_TYPES = [
  'Shalwar Kameez', 'Kurta', 'Kurta Pajama', 'Waistcoat', 'Shirt', 'T-Shirt', 'Polo Shirt', 'Trouser',
  'Jeans', 'Shorts', 'Frock', 'Kids Set', 'Night Suit', 'School Uniform', 'Dupatta', 'Jacket',
  'Sweater', 'Hoodie', 'Shawl', 'Lehenga', 'Maxi', 'Abaya', 'Other',
];

// Size charts. Kids are by age (Pakistan market), adults by letter.
export const SIZE_PRESETS = {
  kids: ['0-6M', '6-12M', '1Y', '2Y', '3Y', '4Y', '5Y', '6Y', '7Y', '8Y', '9Y', '10Y', '11Y', '12Y', '13Y', '14Y'],
  men: ['S', 'M', 'L', 'XL', 'XXL', '3XL'],
  women: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
};
// Trousers and jeans are sized by waist (inches) in every section.
export const WAIST_SIZES = ['28', '30', '32', '34', '36', '38', '40', '42'];

export const COLORS = [
  { name: 'Black', hex: '#111827' }, { name: 'White', hex: '#ffffff' }, { name: 'Navy', hex: '#1e3a8a' },
  { name: 'Maroon', hex: '#7f1d1d' }, { name: 'Red', hex: '#dc2626' }, { name: 'Pink', hex: '#f9a8d4' },
  { name: 'Green', hex: '#16a34a' }, { name: 'Olive', hex: '#556b2f' }, { name: 'Mustard', hex: '#ca8a04' },
  { name: 'Beige', hex: '#d6c6a5' }, { name: 'Grey', hex: '#9ca3af' }, { name: 'Sky Blue', hex: '#7dd3fc' },
  { name: 'Royal Blue', hex: '#2563eb' }, { name: 'Brown', hex: '#78350f' }, { name: 'Purple', hex: '#7e22ce' },
  { name: 'Peach', hex: '#fdba74' }, { name: 'Cream', hex: '#fef3c7' }, { name: 'Yellow', hex: '#facc15' },
];
export const colorHex = (name) => COLORS.find((c) => c.name.toLowerCase() === String(name || '').toLowerCase())?.hex || '#cbd5e1';

// Label sizes in millimetres (common thermal label rolls and sticker sheets).
export const LABEL_SIZES = [
  { id: '50x25', name: '50 × 25 mm (2 × 1 in)', w: 50, h: 25 },
  { id: '40x30', name: '40 × 30 mm', w: 40, h: 30 },
  { id: '38x25', name: '38 × 25 mm', w: 38, h: 25 },
  { id: '60x40', name: '60 × 40 mm', w: 60, h: 40 },
  { id: '32x25', name: '32 × 25 mm (small tag)', w: 32, h: 25 },
  { id: 'custom', name: 'Custom size', w: 50, h: 25 },
];

// Short style-code prefix from a garment type, e.g. "Shalwar Kameez" -> "SK".
export function typeCode(type) {
  const letters = String(type || '').replace(/[^A-Za-z ]/g, ' ').trim().split(/\s+/).filter(Boolean).map((w) => w[0]).join('');
  return (letters || 'G').toUpperCase().slice(0, 3);
}
