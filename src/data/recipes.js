export const recipeBook = {
  'Chicken Momo': {
    serves: '1 plate · 10 pcs',
    lines: [
      { ingredient: 'Chicken breast', qty: '90 g', unitCost: 56 },
      { ingredient: 'Momo wrappers', qty: '10 pcs', unitCost: 24 },
      { ingredient: 'Onion & garlic mix', qty: '40 g', unitCost: 9 },
      { ingredient: 'Coriander & spices', qty: '8 g', unitCost: 6 },
      { ingredient: 'Cooking oil', qty: '15 ml', unitCost: 5 }
    ],
    notes: 'Steamed, fried or jhol — same ingredient base.'
  },
  'Momo Jhol': {
    serves: '1 plate · 10 pcs',
    lines: [
      { ingredient: 'Buff mince', qty: '120 g', unitCost: 78 },
      { ingredient: 'Momo wrappers', qty: '10 pcs', unitCost: 24 },
      { ingredient: 'Onion & garlic mix', qty: '40 g', unitCost: 9 },
      { ingredient: 'Tomato achar', qty: '60 g', unitCost: 14 },
      { ingredient: 'Coriander & spices', qty: '8 g', unitCost: 6 },
      { ingredient: 'Cooking oil', qty: '15 ml', unitCost: 5 }
    ],
    notes: 'Jhol achar made in-house, holds 48 h in the fridge.'
  },
  'Veg Momo': {
    serves: '1 plate · 10 pcs',
    lines: [
      { ingredient: 'Mixed vegetables', qty: '120 g', unitCost: 32 },
      { ingredient: 'Momo wrappers', qty: '10 pcs', unitCost: 24 },
      { ingredient: 'Onion & garlic mix', qty: '40 g', unitCost: 9 },
      { ingredient: 'Coriander & spices', qty: '8 g', unitCost: 6 },
      { ingredient: 'Cooking oil', qty: '15 ml', unitCost: 5 }
    ],
    notes: 'Vegetarian — no meat by-products in wrappers.'
  },
  'Thakali Set': {
    serves: '1 thali set',
    lines: [
      { ingredient: 'Basmati rice', qty: '250 g', unitCost: 45 },
      { ingredient: 'Dal (lentils)', qty: '150 g', unitCost: 28 },
      { ingredient: 'Chicken breast', qty: '120 g', unitCost: 74 },
      { ingredient: 'Cooking oil', qty: '25 ml', unitCost: 8 },
      { ingredient: 'Tomato achar', qty: '60 g', unitCost: 14 },
      { ingredient: 'Fresh mint', qty: '10 g', unitCost: 5 }
    ],
    notes: 'Served with gundruk, papad and seasonal greens.'
  },
  'Dal Bhat': {
    serves: '1 plate',
    lines: [
      { ingredient: 'Basmati rice', qty: '300 g', unitCost: 54 },
      { ingredient: 'Dal (lentils)', qty: '200 g', unitCost: 38 },
      { ingredient: 'Cooking oil', qty: '20 ml', unitCost: 7 },
      { ingredient: 'Fresh mint', qty: '10 g', unitCost: 5 }
    ],
    notes: 'Unlimited dal refill on request.'
  },
  'Buff Sekuwa': {
    serves: '1 platter · 250 g',
    lines: [
      { ingredient: 'Buff mince', qty: '200 g', unitCost: 130 },
      { ingredient: 'Onion & garlic mix', qty: '30 g', unitCost: 7 },
      { ingredient: 'Coriander & spices', qty: '12 g', unitCost: 9 },
      { ingredient: 'Cooking oil', qty: '20 ml', unitCost: 7 }
    ],
    notes: 'Marinated overnight in natural yoghurt base.'
  },
  'Chicken Chilli': {
    serves: '1 portion',
    lines: [
      { ingredient: 'Chicken breast', qty: '180 g', unitCost: 112 },
      { ingredient: 'Onion & garlic mix', qty: '50 g', unitCost: 11 },
      { ingredient: 'Tomatoes', qty: '60 g', unitCost: 12 },
      { ingredient: 'Cooking oil', qty: '25 ml', unitCost: 8 }
    ],
    notes: 'Dry toss or gravy — gravy adds 20 min on the stove.'
  },
  'Mint Mojito': {
    serves: '1 glass · 400 ml',
    lines: [
      { ingredient: 'Fresh mint', qty: '20 g', unitCost: 10 },
      { ingredient: 'Lime', qty: '1 pcs', unitCost: 15 },
      { ingredient: 'Sugar', qty: '15 g', unitCost: 3 },
      { ingredient: 'Soda water', qty: '200 ml', unitCost: 18 }
    ],
    notes: 'Mocktail — add white rum for the cocktail version.'
  },
  'Old Fashioned': {
    serves: '1 glass',
    lines: [
      { ingredient: 'White rum', qty: '60 ml', unitCost: 90 },
      { ingredient: 'Sugar', qty: '10 g', unitCost: 2 },
      { ingredient: 'Bitters', qty: '2 ml', unitCost: 12 }
    ],
    notes: 'One ice cube, stirred not shaken.'
  },
  'Cheesecake': {
    serves: '1 slice',
    lines: [
      { ingredient: 'Cream cheese', qty: '150 g', unitCost: 120 },
      { ingredient: 'Biscuit crumb', qty: '60 g', unitCost: 22 },
      { ingredient: 'Eggs', qty: '2 pcs', unitCost: 28 },
      { ingredient: 'Whole milk', qty: '40 ml', unitCost: 8 }
    ],
    notes: 'Baked daily at 5 am, serves 12 slices per tin.'
  },
  'Tiramisu': {
    serves: '1 slice',
    lines: [
      { ingredient: 'Mascarpone', qty: '120 g', unitCost: 110 },
      { ingredient: 'Coffee', qty: '60 ml', unitCost: 9 },
      { ingredient: 'Eggs', qty: '2 pcs', unitCost: 28 },
      { ingredient: 'Sugar', qty: '40 g', unitCost: 7 }
    ],
    notes: 'Contains alcohol-free, low-caffeine brew.'
  }
};

export const recipeFor = (name) => recipeBook[name] || null;