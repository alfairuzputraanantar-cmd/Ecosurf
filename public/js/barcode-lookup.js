/**
 * CocaCoy Smart Barcode Lookup Service
 * Uses OpenFoodFacts API to fetch product metadata.
 */

const _lookupCache = new Map();

/**
 * Main lookup function
 * @param {string} barcode 
 * @returns {Promise<Object|null>}
 */
export async function lookupProductByBarcode(barcode) {
  if (!barcode) return null;
  
  // 1. Check Cache
  if (_lookupCache.has(barcode)) {
    return _lookupCache.get(barcode);
  }

  try {
    const url = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`;
    const response = await fetch(url);
    
    if (!response.ok) return null;

    const data = await response.json();

    if (data.status === 1 && data.product) {
      const normalized = normalizeProductData(data.product);
      _lookupCache.set(barcode, normalized);
      return normalized;
    }

    return null;
  } catch (error) {
    console.error('Barcode Lookup Error:', error);
    return null;
  }
}

/**
 * Extracts and cleans relevant fields from API response
 */
function normalizeProductData(p) {
  return {
    name: p.product_name || p.product_name_en || '',
    brand: p.brands || '',
    image: p.image_front_small_url || p.image_front_url || p.image_small_url || '',
    category: mapCategory(p.categories_tags || [])
  };
}

/**
 * Maps OpenFoodFacts categories to CocaCoy categories
 * CocaCoy Categories: Food, Drink, Electronics, Clothing, Cosmetics, Goods, Others
 */
function mapCategory(tags) {
  if (!tags || tags.length === 0) return 'Others';

  // Lowercase all tags for easier matching
  const t = tags.map(tag => tag.toLowerCase());

  // Mapping logic
  const matches = (keywords) => keywords.some(k => t.some(tag => tag.includes(k)));

  if (matches(['beverages', 'drink', 'soda', 'water', 'juice', 'coffee', 'tea', 'milk'])) return 'Drink';
  if (matches(['food', 'meal', 'snack', 'candy', 'cookie', 'noodle', 'pasta', 'fruit', 'vegetable', 'meat', 'dairy'])) return 'Food';
  if (matches(['cosmetics', 'beauty', 'hygiene', 'soap', 'shampoo', 'perfume', 'makeup', 'care'])) return 'Cosmetics';
  if (matches(['electronics', 'gadget', 'appliance', 'battery', 'cable'])) return 'Electronics';
  if (matches(['clothing', 'apparel', 'shirt', 'pants', 'shoe', 'garment'])) return 'Clothing';
  if (matches(['goods', 'household', 'tool', 'stationery', 'office'])) return 'Goods';

  return 'Others';
}
