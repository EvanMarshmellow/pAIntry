import type { PantryItem, Product, Verdict } from './types'

// Offline fixtures so UI screens work when Mongo/API is down.
const now = Date.now()
const day = 24 * 60 * 60 * 1000

function product(
  id: string,
  name: string,
  brand: string,
  category: string,
  size: number,
  unit: string,
  prices: [number, number, number],
  protein_g: number,
  barcode: string,
): Product {
  return {
    _id: id,
    name,
    brand,
    category,
    size,
    unit,
    barcode,
    prices: { 'Store A': prices[0], 'Store B': prices[1], 'Store C': prices[2] },
    nutrition_per_serving: { protein_g },
  }
}

export const DEMO_PRODUCTS: Product[] = [
  product('p01', 'Protein Bar Chocolate', 'MaxFuel', 'snacks', 1, 'bar', [3.99, 3.49, 4.29], 20, '000000010001'),
  product('p02', 'Greek Yogurt Cup Vanilla', 'Olympus', 'snacks', 5.3, 'oz', [1.49, 1.29, 1.59], 15, '000000010002'),
  product('p03', 'Hummus Classic', 'Mezze', 'snacks', 10, 'oz', [3.99, 3.49, 4.29], 2, '000000010003'),
  product('p04', 'Tortilla Chips', 'Crunchy', 'snacks', 12, 'oz', [3.49, 2.99, 3.79], 2, '000000010004'),
  product('p05', 'Whole Milk', 'Valley Farms', 'dairy_eggs', 64, 'fl oz', [3.29, 2.89, 3.49], 8, '000000010005'),
  product('p06', 'Protein Bar Peanut Butter Crunch', 'MaxFuel', 'snacks', 1, 'bar', [2.99, 2.69, 3.19], 20, '000000010006'),
  product('p07', 'Black Beans Canned', 'Casa Verde', 'pantry', 15, 'oz', [1.19, 0.99, 1.29], 7, '000000010007'),
  product('p08', 'Baby Spinach', 'GreenLeaf', 'produce', 5, 'oz', [3.49, 2.99, 3.99], 2, '000000010008'),
]

function normalizeBarcode(code: string) {
  return code.replace(/\D/g, '').replace(/^0+/, '') || '0'
}

function productForBarcode(code: string): Product {
  const needle = normalizeBarcode(code)
  const exact = DEMO_PRODUCTS.find((p) => normalizeBarcode(p.barcode) === needle)
  if (exact) return exact
  // Offline demo: unknown real-world barcodes map stably onto the sample catalog.
  let hash = 0
  for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) >>> 0
  return DEMO_PRODUCTS[hash % DEMO_PRODUCTS.length]!
}

function productForQuery(query: string): Product | undefined {
  const q = query.trim().toLowerCase()
  if (!q) return undefined
  return (
    DEMO_PRODUCTS.find((p) => p.name.toLowerCase() === q) ??
    DEMO_PRODUCTS.find((p) => p.name.toLowerCase().includes(q)) ??
    DEMO_PRODUCTS.find((p) => q.includes(p.name.toLowerCase().split(' ')[0] ?? ''))
  )
}

function pantry(id: string, name: string, quantity: number, unit: string, days: number): PantryItem {
  return {
    _id: id,
    name,
    quantity,
    unit,
    expires_at: new Date(now + days * day).toISOString(),
    added_at: new Date(now).toISOString(),
  }
}

export const DEMO_PANTRY: PantryItem[] = [
  pantry('n01', 'Baby Spinach', 1, 'bag', 1),
  pantry('n02', 'Plain Greek Yogurt Nonfat', 1, 'tub', 2),
  pantry('n03', 'Whole Milk', 0.5, 'jug', 2),
  pantry('n04', 'Boneless Skinless Chicken Breast', 1, 'lb', 3),
  pantry('n05', 'Bananas', 3, 'count', 4),
  pantry('n06', 'Large Eggs', 6, 'count', 9),
  pantry('n07', 'Cheddar Cheese Block', 1, 'block', 21),
  pantry('n08', 'Granola', 1, 'bag', 60),
  pantry('n09', 'Long Grain White Rice', 1, 'bag', 365),
  pantry('n10', 'Black Beans Canned', 2, 'can', 540),
]

function engineProduct(productHit: Product, store: string, price: number) {
  return {
    name: productHit.name,
    brand: productHit.brand,
    category: productHit.category,
    cheapest_store: store,
    price,
    protein_g_per_package: productHit.nutrition_per_serving.protein_g ?? 0,
  }
}

function pantryNameMatch(productName: string, pantryName: string) {
  const a = productName.toLowerCase()
  const b = pantryName.toLowerCase()
  return a === b || a.includes(b) || b.includes(a)
}

export function demoConvince(input: { product_id?: string; barcode?: string; query?: string }): Verdict {
  const byId = input.product_id ? DEMO_PRODUCTS.find((p) => p._id === input.product_id) : undefined
  const byBarcode = input.barcode ? productForBarcode(input.barcode) : undefined
  const byName = input.query ? productForQuery(input.query) : undefined
  const productHit = byId ?? byBarcode ?? byName
  if (!productHit) {
    throw new Error('No product matched that scan. Try another barcode or pick from the list.')
  }

  const cheapest = Math.min(...Object.values(productHit.prices))
  const store =
    Object.entries(productHit.prices).find(([, price]) => price === cheapest)?.[0] ?? 'Store B'
  const productFacts = engineProduct(productHit, store, cheapest)

  if (/peanut/i.test(productHit.name)) {
    return {
      verdict: 'Skip',
      headline: 'Skip — peanut allergy',
      reasons: ['Maya is allergic to peanuts.', 'This product name mentions peanut.'],
      better_alternative: null,
      savings: 0,
      data_sources: ['allergies', 'catalog'],
      source: 'engine',
      logged: false,
      engine: { product: productFacts, alternative: null },
    }
  }

  if (DEMO_PANTRY.some((item) => pantryNameMatch(productHit.name, item.name))) {
    return {
      verdict: 'Skip',
      headline: 'Skip — already in pantry',
      reasons: [`${productHit.name} is already in your pantry.`],
      better_alternative: null,
      savings: 0,
      data_sources: ['pantry', 'catalog'],
      source: 'engine',
      logged: false,
      engine: { product: productFacts, alternative: null },
    }
  }

  // Only the chocolate protein bar demos Swap → Greek yogurt (not every scan).
  if (productHit._id === 'p01') {
    const alt = DEMO_PRODUCTS.find((p) => p._id === 'p02')!
    const altPrice = Math.min(...Object.values(alt.prices))
    const altStore =
      Object.entries(alt.prices).find(([, price]) => price === altPrice)?.[0] ?? 'Store B'
    const savings = Math.round((cheapest - altPrice) * 100) / 100
    return {
      verdict: 'Swap',
      headline: `Swap for ${alt.name}`,
      reasons: [
        `${alt.name} at ${altStore} is $${altPrice.toFixed(2)}.`,
        `Save $${savings.toFixed(2)} vs ${productHit.name}.`,
      ],
      better_alternative: { name: alt.name, store: altStore, price: altPrice },
      savings,
      data_sources: ['prices', 'protein'],
      source: 'engine',
      logged: false,
      engine: {
        product: productFacts,
        alternative: {
          name: alt.name,
          store: altStore,
          price: altPrice,
          protein_g_per_package: alt.nutrition_per_serving.protein_g ?? 0,
        },
      },
    }
  }

  return {
    verdict: 'Buy',
    headline: `Buy ${productHit.name}`,
    reasons: [
      `Cheapest at ${store} for $${cheapest.toFixed(2)}.`,
      input.barcode ? `Matched demo catalog for barcode ${input.barcode}.` : 'Fits your budget and pantry.',
    ],
    better_alternative: null,
    savings: 0,
    data_sources: ['prices', 'budget'],
    source: 'engine',
    logged: false,
    engine: { product: productFacts, alternative: null },
  }
}

export function demoAddPantry(item: {
  name: string
  quantity: number
  unit: string
  expires_at?: string
}): PantryItem {
  const row: PantryItem = {
    _id: `local-${Date.now()}`,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    expires_at: item.expires_at ?? null,
    added_at: new Date().toISOString(),
  }
  DEMO_PANTRY.push(row)
  return row
}

export function demoRemovePantry(itemId: string): void {
  const i = DEMO_PANTRY.findIndex((p) => p._id === itemId)
  if (i >= 0) DEMO_PANTRY.splice(i, 1)
}

const DEMO_GROUP_KEYS = [
  'grains',
  'vegetables',
  'fruits',
  'proteins_dairy',
  'sweets_fats',
] as const

export function demoPantryFoodGroups(): import('./types').PantryFoodGroups {
  const targets = {
    grains: 30,
    vegetables: 25,
    fruits: 20,
    proteins_dairy: 15,
    sweets_fats: 10,
  }
  const labels = {
    grains: 'Grains',
    vegetables: 'Vegetables',
    fruits: 'Fruit',
    proteins_dairy: 'Protein & Dairy',
    sweets_fats: 'Fat & Sweet',
  }
  const n = Math.max(DEMO_PANTRY.length, 1)
  const groups = Object.fromEntries(
    DEMO_GROUP_KEYS.map((key, idx) => {
      const pct = Math.round((100 / DEMO_GROUP_KEYS.length) * 10) / 10
      const target = targets[key]
      return [
        key,
        {
          label: labels[key],
          target_pct: target,
          pct,
          pct_calories: pct,
          pct_servings: pct,
          pct_grams: pct,
          delta_from_target: pct - target,
          calories_on_hand: n * 100 * (idx + 1),
          grams_on_hand: n * 50,
          serving_equiv: n,
          status: 'ok' as const,
        },
      ]
    }),
  ) as import('./types').PantryFoodGroups['groups']
  return {
    user_id: 'demo',
    primary_metric: 'calories',
    pyramid_model: 'classic',
    pyramid_targets: targets,
    groups,
    combined_produce_pct: 40,
    combined_produce_target_pct: 45,
    pantry_balance_hint: [],
    assumptions: ['Offline demo mix from local pantry fixture.'],
  }
}
