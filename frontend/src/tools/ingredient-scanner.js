import { getPref, setPref } from '../services/db.js';
import { toolLog } from '../services/tool-logger.js';
import Tesseract from 'tesseract.js';

export const icon = '🔬';
export const name = 'Ingredient Scanner';
export const description = 'Scan food ingredient labels using camera or image upload, extract text with OCR, and get AI-powered health analysis';

const SETTINGS_KEY = 'ingredient_scanner_analysis';



const ALL_ANALYSES = [
  {
    id: 'sugar', label: 'Sugar Analysis',
    description: 'Total sugar, added sugar %, sugar per 100g, compare to daily limits',
  },
  {
    id: 'additives', label: 'Additive Count & Warning',
    description: 'Count of E-numbers / preservatives / artificial additives with risk level',
  },
  {
    id: 'nova', label: 'NOVA Processing Level',
    description: 'Classify as unprocessed, processed, or ultra-processed based on ingredient list',
  },
  {
    id: 'nutriscore', label: 'Nutritional Score Estimate',
    description: 'Estimated Nutri-Score based on ingredients profile',
  },
  {
    id: 'calorie_density', label: 'Calorie Density Estimate',
    description: 'Estimate calorie density from fat/carb/protein ingredients',
  },
  {
    id: 'allergens', label: 'Allergen Detection',
    description: 'Flag common allergens (milk, eggs, nuts, soy, gluten, etc.)',
  },
  {
    id: 'recognizability', label: 'Ingredient Recognizability',
    description: 'Proportion of ingredients a typical consumer would recognize as real food',
  },
  {
    id: 'fat_quality', label: 'Fat Quality Index',
    description: 'Health quality of fats and oils by type',
  },
  {
    id: 'whole_food', label: 'Whole Food Density',
    description: 'Proportion of minimally-processed whole food ingredients',
  },
  {
    id: 'sodium_risk', label: 'Sodium Risk Position',
    description: 'Estimated sodium level based on salt position in ingredient list',
  },
  {
    id: 'preservatives', label: 'Preservative Spectrum',
    description: 'Count and diversity of chemical preservatives',
  },
  {
    id: 'list_length', label: 'Ingredient List Length Grade',
    description: 'Total ingredient count as a proxy for processing complexity',
  },
  {
    id: 'plant_score', label: 'Beneficial Plant Food Score',
    description: 'Position-weighted estimate of fruit, vegetable, nut, seed, whole grain content',
  },
  {
    id: 'artificial', label: 'Artificial Additive Index',
    description: 'Count of artificial colors, flavors, and sweeteners',
  },
  {
    id: 'texture_additives', label: 'Textural Additive Load',
    description: 'Count of emulsifiers, stabilizers, thickeners, gelling agents',
  },
  {
    id: 'fortification', label: 'Fortification & Enrichment',
    description: 'Presence of added vitamins, minerals, and synthetic nutrients',
  },
  {
    id: 'nutrition_breakdown', label: 'Nutrition Breakdown (Per Serving)',
    description: 'Energy, protein, carbs, fat, sodium per serving — requires nutrition data from label',
  },
  {
    id: 'daily_values', label: 'Daily Value Completeness',
    description: 'How well the product covers daily nutritional needs based on a 2000 kcal diet',
  },
  {
    id: 'nutrient_density', label: 'Nutrient Density Scoring',
    description: 'Ratio of beneficial nutrients (protein, fiber) to calories',
  },
];

const INGREDIENT_FUNCTIONS = {
  sweetener: 'Sweetening',
  preservative: 'Preservation',
  emulsifier: 'Emulsification',
  thickener: 'Thickening',
  stabilizer: 'Stabilization',
  gelling_agent: 'Gelling',
  artificial_color: 'Coloring (Artificial)',
  artificial_flavor: 'Flavoring (Artificial)',
  artificial_sweetener: 'Sweetening (Artificial)',
  fat_oil: 'Fat/Oil Base',
  grain: 'Grain Base',
  fruit_vegetable: 'Fruit/Vegetable',
  nut_seed: 'Nut/Seed',
  dairy: 'Dairy',
  protein: 'Protein Source',
  salt_sodium: 'Salt/Sodium',
  leavening_agent: 'Leavening',
  acidity_regulator: 'Acidity Regulation',
  fortification_nutrient: 'Nutrient Fortification',
  allergen: 'Contains Allergen',
  whole_food: 'Whole Food',
  water: 'Liquid Base',
  spice: 'Spice/Herb',
  other: 'Other',
};

const CATEGORY_COLORS = {
  sweetener: '#e74c3c',
  preservative: '#e67e22',
  emulsifier: '#f39c12',
  thickener: '#f1c40f',
  stabilizer: '#2ecc71',
  gelling_agent: '#27ae60',
  artificial_color: '#e74c3c',
  artificial_flavor: '#e74c3c',
  artificial_sweetener: '#e74c3c',
  fat_oil: '#e67e22',
  grain: '#f39c12',
  fruit_vegetable: '#2ecc71',
  nut_seed: '#27ae60',
  dairy: '#3498db',
  protein: '#9b59b6',
  salt_sodium: '#e67e22',
  leavening_agent: '#95a5a6',
  acidity_regulator: '#95a5a6',
  fortification_nutrient: '#3498db',
  allergen: '#e74c3c',
  whole_food: '#2ecc71',
  water: '#3498db',
  spice: '#9b59b6',
  other: '#95a5a6',
};

const CATEGORY_ICONS = {
  sweetener: '🍬', preservative: '🧪', emulsifier: '🫒', thickener: '🥣',
  stabilizer: '🔬', gelling_agent: '🍮', artificial_color: '🎨',
  artificial_flavor: '🧪', artificial_sweetener: '🍬', fat_oil: '🫒',
  grain: '🌾', fruit_vegetable: '🥦', nut_seed: '🥜', dairy: '🥛',
  protein: '🥩', salt_sodium: '🧂', leavening_agent: '🎈',
  acidity_regulator: '⚗️', fortification_nutrient: '💊', allergen: '⚠️',
  whole_food: '🌿', water: '💧', spice: '🌶️', other: '📦',
};

const ANALYSIS_ICONS = {
  sugar: '🍬', additives: '🧪', nova: '🏭', nutriscore: '🥗',
  calorie_density: '🔥', allergens: '⚠️', recognizability: '👨‍🍳',
  fat_quality: '🫒', whole_food: '🌾', sodium_risk: '🧂',
  preservatives: '🧫', list_length: '📋', plant_score: '🌱',
  artificial: '☣️', texture_additives: '🧴', fortification: '💊',
  nutrition_breakdown: '🍱', daily_values: '📊', nutrient_density: '🧬',
};

const RECOGNIZABLE_INGREDIENTS = new Set([
  'sugar', 'salt', 'wheat flour', 'rice flour', 'corn flour', 'butter', 'egg', 'eggs',
  'milk', 'cream', 'buttermilk', 'yogurt', 'cheese', 'paneer', 'honey', 'vinegar',
  'lemon juice', 'lime juice', 'tomato', 'onion', 'garlic', 'ginger', 'chili',
  'turmeric', 'cumin', 'coriander', 'black pepper', 'cinnamon', 'cardamom', 'clove',
  'nutmeg', 'vanilla extract', 'olive oil', 'coconut oil', 'sunflower oil', 'water',
  'yeast', 'baking soda', 'baking powder', 'cocoa powder', 'chocolate', 'oats',
  'rice', 'wheat', 'corn', 'potato', 'sweet potato', 'carrot', 'spinach', 'apple',
  'banana', 'strawberry', 'blueberry', 'orange', 'lemon', 'lime', 'almond', 'walnut',
  'cashew', 'peanut', 'pecan', 'coconut', 'raisin', 'date', 'molasses', 'maple syrup',
  'buttermilk', 'sourdough', 'soy sauce', 'tamarind', 'mango', 'pineapple', 'papaya',
  'bell pepper', 'broccoli', 'cauliflower', 'cabbage', 'lettuce', 'celery', 'beetroot',
  'cucumber', 'zucchini', 'pumpkin', 'mushroom', 'green bean', 'pea', 'lentil',
  'chickpea', 'black bean', 'kidney bean', 'tofu', 'tempeh', 'sesame seed',
  'sunflower seed', 'pumpkin seed', 'flaxseed', 'chia seed', 'quinoa', 'brown rice',
  'whole wheat', 'rye', 'barley', 'millet', 'sorghum', 'tapioca', 'sago',
  'ghee', 'lard', 'chicken', 'beef', 'pork', 'fish', 'shrimp', 'egg white',
  'egg yolk', 'mascarpone', 'ricotta', 'mozzarella', 'parmesan', 'cheddar',
  'corn syrup', 'glucose', 'fructose', 'dextrose', 'maltose', 'lactose',
]);

const ADDITIVE_DB = [
  { e: 'E100', name: 'curcumin', type: 'color', risk: 'safe' },
  { e: 'E102', name: 'tartrazine', type: 'color', risk: 'caution' },
  { e: 'E104', name: 'quinoline yellow', type: 'color', risk: 'caution' },
  { e: 'E110', name: 'sunset yellow', type: 'color', risk: 'caution' },
  { e: 'E120', name: 'cochineal', type: 'color', risk: 'caution' },
  { e: 'E122', name: 'azorubine', type: 'color', risk: 'caution' },
  { e: 'E124', name: 'ponceau 4r', type: 'color', risk: 'caution' },
  { e: 'E129', name: 'allura red', type: 'color', risk: 'caution' },
  { e: 'E133', name: 'brilliant blue', type: 'color', risk: 'caution' },
  { e: 'E150a', name: 'plain caramel', type: 'color', risk: 'safe' },
  { e: 'E150c', name: 'ammonia caramel', type: 'color', risk: 'caution' },
  { e: 'E150d', name: 'sulphite ammonia caramel', type: 'color', risk: 'caution' },
  { e: 'E160a', name: 'beta-carotene', type: 'color', risk: 'safe' },
  { e: 'E200', name: 'sorbic acid', type: 'preservative', risk: 'safe' },
  { e: 'E202', name: 'potassium sorbate', type: 'preservative', risk: 'safe' },
  { e: 'E210', name: 'benzoic acid', type: 'preservative', risk: 'caution' },
  { e: 'E211', name: 'sodium benzoate', type: 'preservative', risk: 'caution' },
  { e: 'E220', name: 'sulphur dioxide', type: 'preservative', risk: 'caution' },
  { e: 'E223', name: 'sodium metabisulphite', type: 'preservative', risk: 'caution' },
  { e: 'E224', name: 'potassium metabisulphite', type: 'preservative', risk: 'caution' },
  { e: 'E250', name: 'sodium nitrite', type: 'preservative', risk: 'warning' },
  { e: 'E251', name: 'sodium nitrate', type: 'preservative', risk: 'warning' },
  { e: 'E252', name: 'potassium nitrate', type: 'preservative', risk: 'warning' },
  { e: 'E270', name: 'lactic acid', type: 'acidity', risk: 'safe' },
  { e: 'E282', name: 'calcium propionate', type: 'preservative', risk: 'safe' },
  { e: 'E296', name: 'malic acid', type: 'acidity', risk: 'safe' },
  { e: 'E300', name: 'ascorbic acid', type: 'antioxidant', risk: 'safe' },
  { e: 'E301', name: 'sodium ascorbate', type: 'antioxidant', risk: 'safe' },
  { e: 'E306', name: 'tocopherols', type: 'antioxidant', risk: 'safe' },
  { e: 'E307', name: 'alpha-tocopherol', type: 'antioxidant', risk: 'safe' },
  { e: 'E320', name: 'bha', type: 'antioxidant', risk: 'caution' },
  { e: 'E321', name: 'bht', type: 'antioxidant', risk: 'caution' },
  { e: 'E322', name: 'lecithin', type: 'emulsifier', risk: 'safe' },
  { e: 'E330', name: 'citric acid', type: 'acidity', risk: 'safe' },
  { e: 'E331', name: 'sodium citrate', type: 'acidity', risk: 'safe' },
  { e: 'E334', name: 'tartaric acid', type: 'acidity', risk: 'safe' },
  { e: 'E335', name: 'sodium tartrate', type: 'acidity', risk: 'safe' },
  { e: 'E339', name: 'sodium phosphate', type: 'mineral', risk: 'safe' },
  { e: 'E340', name: 'potassium phosphate', type: 'mineral', risk: 'safe' },
  { e: 'E341', name: 'calcium phosphate', type: 'mineral', risk: 'safe' },
  { e: 'E400', name: 'alginic acid', type: 'thickener', risk: 'safe' },
  { e: 'E401', name: 'sodium alginate', type: 'thickener', risk: 'safe' },
  { e: 'E406', name: 'agar', type: 'gelling', risk: 'safe' },
  { e: 'E407', name: 'carrageenan', type: 'thickener', risk: 'caution' },
  { e: 'E410', name: 'locust bean gum', type: 'thickener', risk: 'safe' },
  { e: 'E412', name: 'guar gum', type: 'thickener', risk: 'safe' },
  { e: 'E414', name: 'gum arabic', type: 'thickener', risk: 'safe' },
  { e: 'E415', name: 'xanthan gum', type: 'thickener', risk: 'safe' },
  { e: 'E418', name: 'gellan gum', type: 'gelling', risk: 'safe' },
  { e: 'E422', name: 'glycerol', type: 'humectant', risk: 'safe' },
  { e: 'E435', name: 'polysorbate 60', type: 'emulsifier', risk: 'caution' },
  { e: 'E440', name: 'pectin', type: 'gelling', risk: 'safe' },
  { e: 'E450', name: 'diphosphates', type: 'leavening', risk: 'safe' },
  { e: 'E451', name: 'triphosphates', type: 'stabilizer', risk: 'safe' },
  { e: 'E452', name: 'polyphosphates', type: 'stabilizer', risk: 'safe' },
  { e: 'E460', name: 'cellulose', type: 'bulking', risk: 'safe' },
  { e: 'E466', name: 'cmc', type: 'thickener', risk: 'safe' },
  { e: 'E471', name: 'mono- and diglycerides', type: 'emulsifier', risk: 'safe' },
  { e: 'E472e', name: 'datem', type: 'emulsifier', risk: 'safe' },
  { e: 'E475', name: 'polyglycerol esters', type: 'emulsifier', risk: 'caution' },
  { e: 'E476', name: 'polyglycerol polyricinoleate', type: 'emulsifier', risk: 'caution' },
  { e: 'E481', name: 'sodium stearoyl lactylate', type: 'emulsifier', risk: 'safe' },
  { e: 'E491', name: 'sorbitan monostearate', type: 'emulsifier', risk: 'safe' },
  { e: 'E500', name: 'sodium carbonate', type: 'leavening', risk: 'safe' },
  { e: 'E500ii', name: 'sodium bicarbonate', type: 'leavening', risk: 'safe' },
  { e: 'E501', name: 'potassium carbonate', type: 'acidity', risk: 'safe' },
  { e: 'E503', name: 'ammonium carbonate', type: 'leavening', risk: 'safe' },
  { e: 'E504', name: 'magnesium carbonate', type: 'acidity', risk: 'safe' },
  { e: 'E541', name: 'sodium aluminium phosphate', type: 'leavening', risk: 'caution' },
  { e: 'E621', name: 'msg', type: 'flavor', risk: 'safe' },
  { e: 'E627', name: 'disodium guanylate', type: 'flavor', risk: 'safe' },
  { e: 'E631', name: 'disodium inosinate', type: 'flavor', risk: 'safe' },
  { e: 'E635', name: 'disodium ribonucleotides', type: 'flavor', risk: 'safe' },
  { e: 'E950', name: 'acesulfame k', type: 'sweetener', risk: 'safe' },
  { e: 'E951', name: 'aspartame', type: 'sweetener', risk: 'caution' },
  { e: 'E952', name: 'cyclamate', type: 'sweetener', risk: 'caution' },
  { e: 'E954', name: 'saccharin', type: 'sweetener', risk: 'caution' },
  { e: 'E955', name: 'sucralose', type: 'sweetener', risk: 'safe' },
  { e: 'E960', name: 'steviol glycosides', type: 'sweetener', risk: 'safe' },
  { e: 'E961', name: 'neotame', type: 'sweetener', risk: 'caution' },
];

const ALLERGEN_KEYWORDS = [
  { name: 'Milk / Dairy', keywords: ['milk', 'cream', 'butter', 'cheese', 'paneer', 'whey', 'casein', 'lactose', 'buttermilk', 'curd', 'yogurt', 'ghee', 'mascarpone', 'ricotta', 'mozzarella', 'parmesan', 'cheddar', 'dairy'] },
  { name: 'Eggs', keywords: ['egg', 'eggs', 'egg white', 'egg yolk', 'albumin', 'ovalbumin', 'lysozyme', 'mayonnaise'] },
  { name: 'Peanuts', keywords: ['peanut', 'peanuts', 'groundnut', 'monkey nut'] },
  { name: 'Tree Nuts', keywords: ['almond', 'walnut', 'cashew', 'pecan', 'pistachio', 'hazelnut', 'macadamia', 'brazil nut', 'pine nut', 'chestnut'] },
  { name: 'Soy', keywords: ['soy', 'soya', 'soybean', 'tofu', 'tempeh', 'soy lecithin', 'soy protein', 'edamame', 'miso', 'soy sauce'] },
  { name: 'Wheat / Gluten', keywords: ['wheat', 'flour', 'atta', 'maida', 'semolina', 'sooji', 'rava', 'durum', 'spelt', 'kamut', 'rye', 'barley', 'oats', 'triticale', 'gluten', 'seitan', 'couscous', 'pasta', 'bran'] },
  { name: 'Fish', keywords: ['fish', 'salmon', 'tuna', 'cod', 'haddock', 'sardine', 'anchovy', 'mackerel', 'trout', 'herring'] },
  { name: 'Shellfish', keywords: ['shrimp', 'prawn', 'crab', 'lobster', 'crayfish', 'mussel', 'clam', 'oyster', 'scallop', 'krill'] },
  { name: 'Sesame', keywords: ['sesame', 'til', 'sesame seed', 'tahini', 'sesame oil'] },
  { name: 'Sulfites', keywords: ['sulphur dioxide', 'sodium metabisulphite', 'potassium metabisulphite', 'sulfite', 'sulphite', 'e220', 'e223', 'e224'] },
  { name: 'Mustard', keywords: ['mustard', 'mustard seed', 'mustard oil', 'mustard powder'] },
  { name: 'Celery', keywords: ['celery', 'celeriac', 'celery seed'] },
  { name: 'Lupin', keywords: ['lupin', 'lupine', 'lupin flour'] },
  { name: 'Molluscs', keywords: ['snail', 'squid', 'octopus', 'clam', 'mussel', 'oyster', 'scallop', 'abalone'] },
];

const SWEETENER_KEYWORDS = ['sugar', 'brown sugar', 'icing sugar', 'caster sugar', 'demerara', 'muscovado', 'glucose', 'glucose syrup', 'fructose', 'dextrose', 'maltose', 'maltodextrin', 'corn syrup', 'high fructose corn syrup', 'hfcs', 'honey', 'molasses', 'treacle', 'maple syrup', 'agave', 'agave syrup', 'rice syrup', 'jaggery', 'gur', 'date syrup', 'coconut sugar', 'palm sugar', 'malt extract', 'barley malt', 'concentrated fruit juice', 'invert sugar', 'golden syrup', 'brown rice syrup', 'sucrose', 'lactose', 'maltitol', 'sorbitol', 'xylitol', 'erythritol', 'isomalt', 'lactitol'];

const PRESERVATIVE_KEYWORDS = ['sodium benzoate', 'potassium sorbate', 'calcium propionate', 'sodium nitrite', 'sodium nitrate', 'potassium nitrate', 'sulphur dioxide', 'sodium metabisulphite', 'potassium metabisulphite', 'sorbic acid', 'benzoic acid', 'bha', 'bht', 'natamycin', 'nisin'];

const ARTIFICIAL_COLORS = ['tartrazine', 'quinoline yellow', 'sunset yellow', 'ponceau 4r', 'allura red', 'brilliant blue', 'azorubine', 'erythrosine', 'patent blue', 'indigo carmine', 'brown ht', 'brown fk', 'litholrubine bk', 'green s', 'fast green fcf', 'brilliant black bn', 'titanium dioxide'];

const ARTIFICIAL_SWEETENERS = ['aspartame', 'sucralose', 'saccharin', 'acesulfame k', 'neotame', 'cyclamate', 'advantame'];

const TEXTURE_ADDITIVES = ['soy lecithin', 'sunflower lecithin', 'mono- and diglycerides', 'polyglycerol esters', 'sorbitan monostearate', 'polysorbate 60', 'polysorbate 80', 'sodium stearoyl lactylate', 'datem', 'guar gum', 'xanthan gum', 'carrageenan', 'locust bean gum', 'cellulose gum', 'agar', 'pectin', 'gellan gum', 'gelatin', 'modified starch', 'corn starch', 'potato starch', 'tapioca starch', 'rice starch', 'wheat starch', 'alginic acid', 'sodium alginate'];

const FORTIFICATION_NUTRIENTS = ['vitamin a', 'vitamin c', 'vitamin d', 'vitamin e', 'vitamin k', 'vitamin b1', 'vitamin b2', 'vitamin b3', 'vitamin b5', 'vitamin b6', 'vitamin b7', 'vitamin b9', 'vitamin b12', 'thiamin', 'riboflavin', 'niacin', 'pantothenic acid', 'pyridoxine', 'biotin', 'folic acid', 'folate', 'cyanocobalamin', 'calcium carbonate', 'calcium phosphate', 'iron', 'ferric pyrophosphate', 'ferrous sulfate', 'zinc oxide', 'zinc sulfate', 'magnesium oxide', 'potassium iodide', 'potassium sorbate', 'taurine', 'l-carnitine', 'inositol', 'choline', 'copper sulfate', 'manganese sulfate', 'sodium selenite', 'chromium chloride', 'molybdenum'];

const BENEFICIAL_PLANTS = ['apple', 'tomato', 'onion', 'garlic', 'spinach', 'kale', 'carrot', 'broccoli', 'cauliflower', 'cabbage', 'lettuce', 'celery', 'beetroot', 'cucumber', 'zucchini', 'pumpkin', 'mushroom', 'green bean', 'pea', 'lentil', 'chickpea', 'black bean', 'kidney bean', 'quinoa', 'brown rice', 'oats', 'almond', 'walnut', 'cashew', 'pecan', 'pistachio', 'chia seed', 'flaxseed', 'sunflower seed', 'pumpkin seed', 'sesame seed', 'blueberry', 'strawberry', 'raspberry', 'blackberry', 'cranberry', 'orange', 'lemon', 'lime', 'grapefruit', 'banana', 'mango', 'pineapple', 'papaya', 'pomegranate', 'watermelon', 'cantaloupe', 'avocado', 'olive', 'cocoa', 'dark chocolate', 'cinnamon', 'turmeric', 'ginger', 'garlic', 'oregano', 'rosemary', 'thyme', 'basil', 'parsley', 'mint', 'cilantro', 'dill', 'bell pepper', 'sweet potato', 'eggplant', 'okra', 'asparagus', 'artichoke', 'radish', 'turnip', 'parsnip', 'fennel', 'leek', 'scallion', 'watercress', 'arugula', 'endive'];

const FAT_OIL_BENEFICIAL = ['olive oil', 'extra virgin olive oil', 'avocado oil', 'flaxseed oil', 'walnut oil', 'cold-pressed'];
const FAT_OIL_NEUTRAL = ['butter', 'ghee', 'lard', 'sunflower oil', 'rapeseed oil', 'canola oil', 'safflower oil', 'rice bran oil', 'grapeseed oil', 'corn oil', 'vegetable oil'];
const FAT_OIL_CONCERNING = ['palm oil', 'palm kernel oil', 'hydrogenated', 'partially hydrogenated', 'shortening', 'margarine', 'fractionated palm', 'interesterified'];

function getDefaultEnabled() {
  return ALL_ANALYSES.map(a => a.id);
}

async function getAnalysisSettings() {
  const s = await getPref(SETTINGS_KEY, {});
  if (!s.enabled) return getDefaultEnabled();
  return s.enabled;
}

async function saveAnalysisSettings(enabled) {
  await setPref(SETTINGS_KEY, { enabled });
}

function parseIngredients(text) {
  const cleaned = text.replace(/ingredients[:\s]*/i, '').trim();
  const parts = cleaned.split(',').map(s => s.trim()).filter(Boolean);
  return parts;
}

function normalizeIngredientName(name) {
  return name.toLowerCase().replace(/\([^)]*\)/g, '').replace(/\s*\d+[\d.,]*%\s*/g, '').trim().replace(/\s+/g, ' ');
}

function findENumber(name) {
  const match = name.match(/[Ee]\s*(\d+[a-z]?\d*)/);
  if (match) return `E${match[1].toLowerCase()}`;
  const lower = name.toLowerCase();
  for (const a of ADDITIVE_DB) {
    if (lower.includes(a.name) || lower.includes(a.e)) return a.e;
  }
  return null;
}

function getAdditiveInfo(eNumber) {
  if (!eNumber) return null;
  const e = eNumber.toLowerCase().replace(/\s/g, '');
  return ADDITIVE_DB.find(a => a.e.replace(/\s/g, '').toLowerCase() === e || a.e.replace(/\s/g, '').toLowerCase() === e.replace(/^e/, ''));
}

function categorizeIngredientClient(rawName) {
  const name = rawName.toLowerCase().trim();
  const normalized = normalizeIngredientName(name);
  const eNumber = findENumber(name);

  if (FORTIFICATION_NUTRIENTS.some(k => normalized.includes(k))) {
    return { category: 'fortification_nutrient', e_number: eNumber };
  }
  if (ARTIFICIAL_SWEETENERS.some(k => normalized.includes(k))) {
    return { category: 'artificial_sweetener', e_number: eNumber };
  }
  if (ARTIFICIAL_COLORS.some(k => normalized.includes(k))) {
    return { category: 'artificial_color', e_number: eNumber };
  }
  if (PRESERVATIVE_KEYWORDS.some(k => normalized.includes(k))) {
    return { category: 'preservative', e_number: eNumber };
  }
  if (normalized.includes('artificial flavour') || normalized.includes('artificial flavor') || normalized.includes('vanillin')) {
    return { category: 'artificial_flavor', e_number: eNumber };
  }
  if (SWEETENER_KEYWORDS.some(k => normalized.includes(k))) {
    return { category: 'sweetener', e_number: eNumber };
  }
  if (TEXTURE_ADDITIVES.some(k => normalized.includes(k))) {
    const cat = normalized.includes('gum') || normalized.includes('starch') || normalized.includes('cellulose') || normalized.includes('alginate') || normalized.includes('pectin') || normalized.includes('carrageenan') || normalized.includes('agar') || normalized.includes('gelatin') || normalized.includes('gellan') ? 'thickener' : 'emulsifier';
    return { category: cat, e_number: eNumber };
  }
  if (FAT_OIL_CONCERNING.some(k => normalized.includes(k))) {
    return { category: 'fat_oil', e_number: eNumber };
  }
  if (FAT_OIL_NEUTRAL.some(k => normalized.includes(k)) || FAT_OIL_BENEFICIAL.some(k => normalized.includes(k))) {
    return { category: 'fat_oil', e_number: eNumber };
  }
  if (normalized.includes('salt') || normalized.includes('sodium') || normalized.includes('sea salt') || normalized.includes('kala namak')) {
    return { category: 'salt_sodium', e_number: eNumber };
  }
  if (ALLERGEN_KEYWORDS.some(g => g.keywords.some(k => normalized.includes(k)))) {
    // Check if it's a grain/flour (handled better under grain)
    if (normalized.includes('flour') || normalized.includes('atta') || normalized.includes('maida') || normalized.includes('semolina') || normalized.includes('sooji') || normalized.includes('rava') || normalized.includes('bran') || normalized.includes('oats') || normalized.includes('rye') || normalized.includes('barley')) {
      return { category: 'grain', e_number: eNumber };
    }
    if (normalized.includes('milk') || normalized.includes('cream') || normalized.includes('cheese') || normalized.includes('paneer') || normalized.includes('yogurt') || normalized.includes('butter') || normalized.includes('ghee') || normalized.includes('whey') || normalized.includes('casein') || normalized.includes('lactose') || normalized.includes('buttermilk')) {
      return { category: 'dairy', e_number: eNumber };
    }
    if (normalized.includes('egg')) {
      return { category: 'protein', e_number: eNumber };
    }
    return { category: 'allergen', e_number: eNumber };
  }
  if (BENEFICIAL_PLANTS.some(k => normalized.includes(k))) {
    return { category: 'fruit_vegetable', e_number: eNumber };
  }
  if (normalized.includes('flour') || normalized.includes('atta') || normalized.includes('maida') || normalized.includes('semolina') || normalized.includes('sooji') || normalized.includes('rava') || normalized.includes('bran') || normalized.includes('oats') || normalized.includes('rye') || normalized.includes('barley') || normalized.includes('millet') || normalized.includes('quinoa') || normalized.includes('rice') || normalized.includes('wheat') || normalized.includes('corn') || normalized.includes('maize') || normalized.includes('sorghum') || normalized.includes('triticale') || normalized.includes('spelt') || normalized.includes('durum')) {
    return { category: 'grain', e_number: eNumber };
  }
  if (normalized.includes('almond') || normalized.includes('walnut') || normalized.includes('cashew') || normalized.includes('pecan') || normalized.includes('pistachio') || normalized.includes('peanut') || normalized.includes('groundnut') || normalized.includes('nut') || normalized.includes('seed') || normalized.includes('sunflower seed') || normalized.includes('pumpkin seed') || normalized.includes('sesame') || normalized.includes('chia') || normalized.includes('flaxseed') || normalized.includes('coconut')) {
    return { category: 'nut_seed', e_number: eNumber };
  }
  if (normalized.includes('tofu') || normalized.includes('soy protein') || normalized.includes('wheat protein') || normalized.includes('seitan') || normalized.includes('pea protein')) {
    return { category: 'protein', e_number: eNumber };
  }
  if (normalized.includes('water') || normalized.includes('spring water') || normalized.includes('mineral water')) {
    return { category: 'water', e_number: eNumber };
  }
  if (normalized.includes('yeast') || normalized.includes('baking soda') || normalized.includes('baking powder') || normalized.includes('sodium bicarbonate') || normalized.includes('e500') || normalized.includes('e541') || normalized.includes('cream of tartar')) {
    return { category: 'leavening_agent', e_number: eNumber };
  }
  if (normalized.includes('citric acid') || normalized.includes('e330') || normalized.includes('malic acid') || normalized.includes('lactic acid') || normalized.includes('acetic acid') || normalized.includes('tartaric acid') || normalized.includes('phosphoric acid')) {
    return { category: 'acidity_regulator', e_number: eNumber };
  }
  if (normalized.includes('spice') || normalized.includes('turmeric') || normalized.includes('cumin') || normalized.includes('coriander') || normalized.includes('chili') || normalized.includes('pepper') || normalized.includes('cinnamon') || normalized.includes('cardamom') || normalized.includes('clove') || normalized.includes('nutmeg') || normalized.includes('ginger') || normalized.includes('garlic') || normalized.includes('onion') || normalized.includes('herb') || normalized.includes('oregano') || normalized.includes('rosemary') || normalized.includes('thyme') || normalized.includes('basil') || normalized.includes('parsley') || normalized.includes('mint')) {
    return { category: 'spice', e_number: eNumber };
  }
  if (RECOGNIZABLE_INGREDIENTS.has(normalized) || RECOGNIZABLE_INGREDIENTS.has(normalized.replace(/s$/, ''))) {
    return { category: 'whole_food', e_number: eNumber };
  }
  if (eNumber) {
    const info = getAdditiveInfo(eNumber);
    if (info) {
      const typeMap = { color: 'artificial_color', preservative: 'preservative', emulsifier: 'emulsifier', thickener: 'thickener', gelling: 'gelling_agent', sweetener: 'artificial_sweetener', acidity: 'acidity_regulator', antioxidant: 'preservative', flavor: 'other', leavening: 'leavening_agent', stabilizer: 'stabilizer', humectant: 'other', bulking: 'other', mineral: 'other' };
      return { category: typeMap[info.type] || 'other', e_number: eNumber };
    }
  }

  return { category: 'other', e_number: eNumber };
}

function isWholeFood(name, category) {
  if (category === 'fruit_vegetable' || category === 'nut_seed' || category === 'spice' || category === 'water' || category === 'whole_food') return true;
  const n = name.toLowerCase().trim();
  if (RECOGNIZABLE_INGREDIENTS.has(n) || RECOGNIZABLE_INGREDIENTS.has(n.replace(/s$/, ''))) return true;
  return false;
}

function isRecognizable(name) {
  const n = name.toLowerCase().trim();
  const base = normalizeIngredientName(name);
  if (RECOGNIZABLE_INGREDIENTS.has(base) || RECOGNIZABLE_INGREDIENTS.has(base.replace(/s$/, ''))) return true;
  if (n.startsWith('whole') || n.includes('organic') || n.includes('natural')) return true;
  const cat = categorizeIngredientClient(name);
  if (cat.category === 'whole_food' || cat.category === 'fruit_vegetable' || cat.category === 'spice' || cat.category === 'water') return true;
  return false;
}

function isAdditive(category, eNumber) {
  if (eNumber) return true;
  const additiveCategories = ['preservative', 'emulsifier', 'thickener', 'stabilizer', 'gelling_agent', 'artificial_color', 'artificial_flavor', 'artificial_sweetener', 'acidity_regulator', 'leavening_agent'];
  return additiveCategories.includes(category);
}

async function analyzeIngredients(ingredients, text, enabled, nutritionData) {
  const enabledSet = new Set(enabled);
  const results = {};
  const total = ingredients.length;
  const earliestSaltPos = ingredients.findIndex(i => {
    const c = categorizeIngredientClient(i);
    return c.category === 'salt_sodium';
  });
  const saltPosition = earliestSaltPos >= 0 ? earliestSaltPos + 1 : null;

  if (enabledSet.has('sugar')) {
    const sweeteners = ingredients.filter(i => categorizeIngredientClient(i).category === 'sweetener');
    const sugarNames = sweeteners.join(', ');
    const sugarCount = sweeteners.length;
    const sugarRatio = total > 0 ? (sugarCount / total) * 100 : 0;
    const estSugarG = estimatePositionGrams(sweeteners, ingredients);
    results.sugar = {
      label: 'Sugar Analysis',
      score: sugarCount,
      maxScore: total,
      percent: Math.round(sugarRatio),
      grade: sugarRatio > 20 ? 'F' : sugarRatio > 12 ? 'D' : sugarRatio > 6 ? 'C' : sugarRatio > 3 ? 'B' : 'A',
      color: sugarRatio > 12 ? 'var(--color-red, #e74c3c)' : sugarRatio > 6 ? 'var(--color-orange, #e67e22)' : 'var(--color-green, #2ecc71)',
      details: sugarCount > 0
        ? `${sugarCount} sweetener${sugarCount > 1 ? 's' : ''} detected (${Math.round(sugarRatio)}% of ingredients). Estimated sugar: ~${estSugarG}g per 100g. Found: ${sugarNames}.`
        : 'No sweeteners detected in the ingredient list.',
    };
  }

  if (enabledSet.has('additives')) {
    const additives = ingredients.filter(i => {
      const c = categorizeIngredientClient(i);
      return isAdditive(c.category, c.e_number) && c.category !== 'leavening_agent';
    });
    const eNumberCount = additives.filter(i => findENumber(i)).length;
    const riskLevel = eNumberCount > 5 ? 'High' : eNumberCount > 2 ? 'Moderate' : 'Low';
    results.additives = {
      label: 'Additive Count & Warning',
      score: additives.length,
      maxScore: total,
      percent: total > 0 ? Math.round((additives.length / total) * 100) : 0,
      grade: eNumberCount > 5 ? 'F' : eNumberCount > 2 ? 'C' : 'A',
      color: eNumberCount > 5 ? 'var(--color-red, #e74c3c)' : eNumberCount > 2 ? 'var(--color-orange, #e67e22)' : 'var(--color-green, #2ecc71)',
      details: `${additives.length} additive${additives.length !== 1 ? 's' : ''} found (${eNumberCount} with E-numbers). Risk level: ${riskLevel}.`,
    };
  }

  if (enabledSet.has('nova')) {
    const processingCount = countProcessingIndicators(ingredients);
    const ultraCount = countUltraProcessed(ingredients);
    let novaLevel, novaLabel, novaColor;
    if (ultraCount > 0 && (ultraCount / total) > 0.15) {
      novaLevel = 4; novaLabel = 'Ultra-processed'; novaColor = 'var(--color-red, #e74c3c)';
    } else if (processingCount > total * 0.4) {
      novaLevel = 3; novaLabel = 'Processed'; novaColor = 'var(--color-orange, #e67e22)';
    } else if (processingCount > 0) {
      novaLevel = 2; novaLabel = 'Processed culinary'; novaColor = 'var(--color-yellow, #f1c40f)';
    } else {
      novaLevel = 1; novaLabel = 'Unprocessed / Minimally processed'; novaColor = 'var(--color-green, #2ecc71)';
    }
    results.nova = {
      label: 'NOVA Processing Level',
      score: novaLevel,
      maxScore: 4,
      percent: Math.round((novaLevel / 4) * 100),
      grade: `NOVA ${novaLevel}`,
      color: novaColor,
      details: `${novaLabel}. ${processingCount} processed ingredient${processingCount !== 1 ? 's' : ''}, ${ultraCount} ultra-processed indicator${ultraCount !== 1 ? 's' : ''}.`,
    };
  }

  if (enabledSet.has('nutriscore')) {
    const goodPoints = ingredients.filter(i => {
      const c = categorizeIngredientClient(i);
      return c.category === 'fruit_vegetable' || c.category === 'nut_seed' || c.category === 'whole_food' || c.category === 'spice' || c.category === 'water';
    }).length;
    const badPoints = ingredients.filter(i => {
      const c = categorizeIngredientClient(i);
      return c.category === 'sweetener' || c.category === 'sweetener' || c.category === 'salt_sodium' || c.category === 'fat_oil' || c.category === 'preservative';
    }).length;
    const ratio = total > 0 ? goodPoints / Math.max(badPoints, 1) : 0;
    let nutriscore, nsColor;
    if (ratio > 3) { nutriscore = 'A'; nsColor = 'var(--color-green, #2ecc71)'; }
    else if (ratio > 2) { nutriscore = 'B'; nsColor = '#8bc34a'; }
    else if (ratio > 1) { nutriscore = 'C'; nsColor = 'var(--color-yellow, #f1c40f)'; }
    else if (ratio > 0.5) { nutriscore = 'D'; nsColor = 'var(--color-orange, #e67e22)'; }
    else { nutriscore = 'E'; nsColor = 'var(--color-red, #e74c3c)'; }
    results.nutriscore = {
      label: 'Nutritional Score Estimate',
      score: ratio,
      maxScore: 5,
      percent: Math.min(100, Math.round((ratio / 5) * 100)),
      grade: nutriscore,
      color: nsColor,
      details: `Estimated Nutri-Score: ${nutriscore}. Whole food ratio: ${ratio.toFixed(1)}:1 beneficial vs concerning ingredients.`,
    };
  }

  if (enabledSet.has('calorie_density')) {
    const fatCount = ingredients.filter(i => categorizeIngredientClient(i).category === 'fat_oil').length;
    const sugarCount = ingredients.filter(i => categorizeIngredientClient(i).category === 'sweetener').length;
    const grainCount = ingredients.filter(i => categorizeIngredientClient(i).category === 'grain').length;
    const totalDense = fatCount + sugarCount + grainCount;
    const densityRatio = total > 0 ? totalDense / total : 0;
    let estCal, calColor;
    if (densityRatio > 0.5) { estCal = 'High (>350 kcal/100g)'; calColor = 'var(--color-red, #e74c3c)'; }
    else if (densityRatio > 0.3) { estCal = 'Moderate (200-350 kcal/100g)'; calColor = 'var(--color-orange, #e67e22)'; }
    else { estCal = 'Low to Moderate (<200 kcal/100g)'; calColor = 'var(--color-green, #2ecc71)'; }
    results.calorie_density = {
      label: 'Calorie Density Estimate',
      score: Math.round(densityRatio * 100),
      maxScore: 100,
      percent: Math.round(Math.min(100, densityRatio * 100 * 1.5)),
      grade: `${Math.round(densityRatio * 100)}% energy-dense ingredients`,
      color: calColor,
      details: `Estimated calorie density: ${estCal}. ${fatCount} fat/oil source${fatCount !== 1 ? 's' : ''}, ${sugarCount} sweetener${sugarCount !== 1 ? 's' : ''}, ${grainCount} grain.`,
    };
  }

  if (enabledSet.has('allergens')) {
    const foundAllergens = [];
    for (const group of ALLERGEN_KEYWORDS) {
      const matches = ingredients.filter(i => {
        const lower = i.toLowerCase();
        return group.keywords.some(k => {
          const kw = k.toLowerCase();
          return lower.includes(kw) || lower.includes(kw.replace(/\s/g, ''));
        });
      });
      if (matches.length > 0) foundAllergens.push({ name: group.name, ingredients: matches });
    }
    results.allergens = {
      label: 'Allergen Detection',
      score: foundAllergens.length,
      maxScore: ALLERGEN_KEYWORDS.length,
      percent: Math.round((foundAllergens.length / ALLERGEN_KEYWORDS.length) * 100),
      grade: foundAllergens.length > 0 ? `${foundAllergens.length} allergen group${foundAllergens.length !== 1 ? 's' : ''} detected` : 'No common allergens detected',
      color: foundAllergens.length > 0 ? 'var(--color-orange, #e67e22)' : 'var(--color-green, #2ecc71)',
      details: foundAllergens.length > 0
        ? foundAllergens.map(a => `${a.name}: ${a.ingredients.join(', ')}`).join('; ')
        : 'None of the common allergen groups detected in the ingredient list.',
    };
  }

  if (enabledSet.has('recognizability')) {
    const recognizable = ingredients.filter(i => isRecognizable(i)).length;
    const pct = total > 0 ? Math.round((recognizable / total) * 100) : 0;
    results.recognizability = {
      label: 'Ingredient Recognizability',
      score: recognizable,
      maxScore: total,
      percent: pct,
      grade: pct >= 70 ? 'A' : pct >= 40 ? 'B' : pct >= 20 ? 'C' : 'D',
      color: pct >= 70 ? 'var(--color-green, #2ecc71)' : pct >= 40 ? 'var(--color-orange, #e67e22)' : 'var(--color-red, #e74c3c)',
      details: `${recognizable} of ${total} ingredients (${pct}%) are kitchen-recognizable. ${pct >= 70 ? 'Mostly real food.' : pct >= 40 ? 'Moderate recognizability.' : 'Most ingredients are unfamiliar.'}`,
    };
  }

  if (enabledSet.has('fat_quality')) {
    const fats = ingredients.filter(i => categorizeIngredientClient(i).category === 'fat_oil');
    const beneficial = fats.filter(f => FAT_OIL_BENEFICIAL.some(k => f.toLowerCase().includes(k))).length;
    const neutral = fats.filter(f => FAT_OIL_NEUTRAL.some(k => f.toLowerCase().includes(k))).length;
    const concerning = fats.filter(f => FAT_OIL_CONCERNING.some(k => f.toLowerCase().includes(k))).length;
    const totalFats = fats.length || 1;
    const fqScore = Math.round(((beneficial - concerning) / totalFats) * 50 + 50);
    const fqColor = fqScore >= 70 ? 'var(--color-green, #2ecc71)' : fqScore >= 40 ? 'var(--color-orange, #e67e22)' : 'var(--color-red, #e74c3c)';
    results.fat_quality = {
      label: 'Fat Quality Index',
      score: beneficial,
      maxScore: Math.max(beneficial, 1),
      percent: fqScore,
      grade: `Score: ${fqScore}/100`,
      color: fqColor,
      details: `Fats: ${beneficial} beneficial, ${neutral} neutral, ${concerning} concerning. ${fats.length} oil/fat source${fats.length !== 1 ? 's' : ''} total.`,
    };
  }

  if (enabledSet.has('whole_food')) {
    const whole = ingredients.filter(i => {
      const c = categorizeIngredientClient(i);
      return isWholeFood(i, c.category) || c.category === 'whole_food' || c.category === 'fruit_vegetable' || c.category === 'nut_seed';
    }).length;
    const pct = total > 0 ? Math.round((whole / total) * 100) : 0;
    results.whole_food = {
      label: 'Whole Food Density',
      score: whole,
      maxScore: total,
      percent: pct,
      grade: pct >= 60 ? 'A' : pct >= 35 ? 'B' : pct >= 15 ? 'C' : 'D',
      color: pct >= 60 ? 'var(--color-green, #2ecc71)' : pct >= 35 ? 'var(--color-yellow, #f1c40f)' : 'var(--color-red, #e74c3c)',
      details: `${whole} of ${total} ingredients (${pct}%) are whole foods. ${pct >= 60 ? 'Mostly whole foods.' : pct >= 35 ? 'Moderate whole food content.' : 'Mostly processed ingredients.'}`,
    };
  }

  if (enabledSet.has('sodium_risk')) {
    const saltPct = saltPosition !== null ? Math.round(((total - saltPosition + 1) / total) * 100) : 0;
    const risk = saltPosition !== null ? (saltPosition <= 3 ? 'High' : saltPosition <= 6 ? 'Moderate' : 'Low') : 'None detected';
    const riskColor = saltPosition !== null ? (saltPosition <= 3 ? 'var(--color-red, #e74c3c)' : saltPosition <= 6 ? 'var(--color-orange, #e67e22)' : 'var(--color-green, #2ecc71)') : 'var(--color-text-muted)';
    results.sodium_risk = {
      label: 'Sodium Risk Position',
      score: saltPosition !== null ? saltPosition : total,
      maxScore: total,
      percent: saltPct,
      grade: risk,
      color: riskColor,
      details: saltPosition !== null
        ? `Salt/Sodium is ingredient #${saltPosition} of ${total} (listed early = higher quantity). Risk: ${risk}.`
        : 'No salt or sodium compounds detected in the ingredient list.',
    };
  }

  if (enabledSet.has('preservatives')) {
    const chemPres = ingredients.filter(i => {
      const lower = i.toLowerCase();
      return PRESERVATIVE_KEYWORDS.some(k => lower.includes(k));
    });
    results.preservatives = {
      label: 'Preservative Spectrum',
      score: chemPres.length,
      maxScore: Math.max(chemPres.length, 1),
      percent: Math.min(100, chemPres.length * 20),
      grade: chemPres.length > 3 ? 'F' : chemPres.length > 0 ? 'C' : 'A',
      color: chemPres.length > 3 ? 'var(--color-red, #e74c3c)' : chemPres.length > 0 ? 'var(--color-orange, #e67e22)' : 'var(--color-green, #2ecc71)',
      details: chemPres.length > 0
        ? `${chemPres.length} chemical preservative${chemPres.length !== 1 ? 's' : ''}: ${chemPres.join(', ')}`
        : 'No chemical preservatives detected.',
    };
  }

  if (enabledSet.has('list_length')) {
    const adjTotal = total;
    let grade, gradeColor;
    if (adjTotal <= 5) { grade = 'A (Minimal)'; gradeColor = 'var(--color-green, #2ecc71)'; }
    else if (adjTotal <= 10) { grade = 'B (Short)'; gradeColor = '#8bc34a'; }
    else if (adjTotal <= 15) { grade = 'C (Moderate)'; gradeColor = 'var(--color-yellow, #f1c40f)'; }
    else if (adjTotal <= 25) { grade = 'D (Long)'; gradeColor = 'var(--color-orange, #e67e22)'; }
    else { grade = 'F (Very long)'; gradeColor = 'var(--color-red, #e74c3c)'; }
    results.list_length = {
      label: 'Ingredient List Length',
      score: adjTotal,
      maxScore: 25,
      percent: Math.min(100, Math.round((adjTotal / 25) * 100)),
      grade,
      color: gradeColor,
      details: `${adjTotal} ingredient${adjTotal !== 1 ? 's' : ''}. ${grade.split(' ')[0] === 'A' ? 'Minimal processing expected.' : grade.split(' ')[0] === 'B' ? 'Short and simple.' : grade.split(' ')[0] === 'C' ? 'Moderate complexity.' : grade.split(' ')[0] === 'D' ? 'Long list — likely highly processed.' : 'Very long list — ultra-processed food indicator.'}`,
    };
  }

  if (enabledSet.has('plant_score')) {
    const matched = ingredients.filter(i => {
      const lower = i.toLowerCase();
      return BENEFICIAL_PLANTS.some(p => lower.includes(p));
    });
    const score = Math.min(5, matched.length);
    const starColor = score >= 4 ? 'var(--color-green, #2ecc71)' : score >= 2 ? 'var(--color-orange, #e67e22)' : 'var(--color-text-muted)';
    results.plant_score = {
      label: 'Beneficial Plant Food Score',
      score,
      maxScore: 5,
      percent: Math.round((score / 5) * 100),
      grade: '★'.repeat(score) + '☆'.repeat(5 - score),
      color: starColor,
      details: matched.length > 0
        ? `Detected beneficial plant foods: ${matched.join(', ')}.`
        : 'No beneficial plant foods detected.',
    };
  }

  if (enabledSet.has('artificial')) {
    const colors = ingredients.filter(i => ARTIFICIAL_COLORS.some(c => i.toLowerCase().includes(c))).length;
    const flavors = ingredients.filter(i => i.toLowerCase().includes('artificial flavour') || i.toLowerCase().includes('artificial flavor') || i.toLowerCase().includes('vanillin')).length;
    const sweet = ingredients.filter(i => ARTIFICIAL_SWEETENERS.some(s => i.toLowerCase().includes(s))).length;
    const totalArt = colors + flavors + sweet;
    results.artificial = {
      label: 'Artificial Additive Index',
      score: totalArt,
      maxScore: Math.max(totalArt, 1),
      percent: Math.min(100, totalArt * 25),
      grade: totalArt > 0 ? `${totalArt} artificial additive${totalArt !== 1 ? 's' : ''}` : 'None detected',
      color: totalArt > 0 ? 'var(--color-red, #e74c3c)' : 'var(--color-green, #2ecc71)',
      details: totalArt > 0
        ? `Colors: ${colors}, Flavors: ${flavors}, Sweeteners: ${sweet}. Total: ${totalArt} artificial additive${totalArt !== 1 ? 's' : ''}.`
        : 'No artificial colors, flavors, or sweeteners detected.',
    };
  }

  if (enabledSet.has('texture_additives')) {
    const found = ingredients.filter(i => TEXTURE_ADDITIVES.some(t => i.toLowerCase().includes(t)));
    const emulsifiers = found.filter(i => ['lecithin', 'mono-', 'diglyceride', 'polyglycerol', 'sorbitan', 'polysorbate', 'stearoyl', 'datem'].some(k => i.toLowerCase().includes(k)));
    const thickeners = found.filter(i => ['gum', 'starch', 'cellulose', 'alginate', 'pectin', 'carrageenan', 'agar', 'gelatin', 'gellan'].some(k => i.toLowerCase().includes(k)));
    results.texture_additives = {
      label: 'Textural Additive Load',
      score: found.length,
      maxScore: Math.max(found.length, 1),
      percent: Math.min(100, found.length * 20),
      grade: found.length > 3 ? 'High' : found.length > 0 ? 'Moderate' : 'None',
      color: found.length > 3 ? 'var(--color-red, #e74c3c)' : found.length > 0 ? 'var(--color-orange, #e67e22)' : 'var(--color-green, #2ecc71)',
      details: found.length > 0
        ? `${found.length} texture modifier${found.length !== 1 ? 's' : ''}: ${emulsifiers.length} emulsifier${emulsifiers.length !== 1 ? 's' : ''}, ${thickeners.length} thickener/stabilizer${thickeners.length !== 1 ? 's' : ''}.`
        : 'No textural additives (emulsifiers, thickeners, stabilizers) detected.',
    };
  }

  // ── Nutrition data analyses ──
  const hasNutrition = nutritionData && (
    nutritionData.per100g.energy_kcal ||
    Object.keys(nutritionData.per100g).length > 0
  );

  if (enabledSet.has('nutrition_breakdown') && hasNutrition) {
    const p100 = nutritionData.per100g;
    const pSrv = nutritionData.perServing;
    const { servingSize } = nutritionData;
    const cal = pSrv.energy_kcal || (p100.energy_kcal && servingSize ? Math.round(p100.energy_kcal * servingSize / 100) : p100.energy_kcal) || 0;

    // Grade based on calorie density ± macro balance
    const calPer100 = p100.energy_kcal || 0;
    let ngGrade, ngColor;
    if (calPer100 > 400) { ngGrade = 'D (High cal)'; ngColor = 'var(--color-orange, #e67e22)'; }
    else if (calPer100 > 275) { ngGrade = 'C (Moderate cal)'; ngColor = 'var(--color-yellow, #f1c40f)'; }
    else if (calPer100 > 100) { ngGrade = 'B (Low cal)'; ngColor = '#8bc34a'; }
    else { ngGrade = 'A (Very low cal)'; ngColor = 'var(--color-green, #2ecc71)'; }

    // Protein quality check
    const protein = pSrv.protein_g || (p100.protein_g && servingSize ? p100.protein_g * servingSize / 100 : p100.protein_g) || 0;
    const proteinPer100 = p100.protein_g || 0;
    const proteinScore = cal > 0 ? Math.round(proteinPer100 / (calPer100 / 100) * 100) / 100 : 0;

    const details = [
      servingSize ? `Serving: ${servingSize}g` : '',
      `Energy: ${cal} kcal${p100.energy_kcal ? ` (${p100.energy_kcal} kcal/100g)` : ''}`,
      protein ? `Protein: ${protein.toFixed(1)}g` : '',
      pSrv.total_fat_g ? `Fat: ${pSrv.total_fat_g}g` : (p100.total_fat_g ? `Fat: ${p100.total_fat_g}g/100g` : ''),
      pSrv.carbohydrate_g ? `Carbs: ${pSrv.carbohydrate_g}g` : (p100.carbohydrate_g ? `Carbs: ${p100.carbohydrate_g}g/100g` : ''),
      pSrv.sodium_mg ? `Sodium: ${pSrv.sodium_mg}mg` : (p100.sodium_mg ? `Sodium: ${p100.sodium_mg}mg/100g` : ''),
      proteinScore > 0 && calPer100 > 0 ? `Protein density: ${proteinScore.toFixed(2)}g per 100 kcal` : '',
    ].filter(Boolean).join(' · ');

    results.nutrition_breakdown = {
      label: 'Nutrition Breakdown',
      score: calPer100,
      maxScore: 500,
      percent: Math.min(100, Math.round((calPer100 / 500) * 100)),
      grade: ngGrade,
      color: ngColor,
      details,
    };
  }

  if (enabledSet.has('daily_values') && hasNutrition) {
    const p100 = nutritionData.per100g;
    // Estimate %DV per serving based on 2000 kcal diet
    const proteinDV = p100.protein_g ? Math.min(100, Math.round(p100.protein_g / 50 * 100)) : 0;
    const fiberDV = p100.dietary_fiber_g ? Math.min(100, Math.round(p100.dietary_fiber_g / 25 * 100)) : 0;
    const satFatDV = p100.saturated_fat_g ? Math.min(100, Math.round(p100.saturated_fat_g / 20 * 100)) : 0;
    const sodiumDV = p100.sodium_mg ? Math.min(100, Math.round(p100.sodium_mg / 2300 * 100)) : 0;
    const carbDV = p100.carbohydrate_g ? Math.min(100, Math.round(p100.carbohydrate_g / 275 * 100)) : 0;

    const beneficialDV = proteinDV + fiberDV;
    const concerningDV = satFatDV + sodiumDV;
    const completeness = Math.min(100, Math.round((beneficialDV + Math.max(0, 100 - concerningDV)) / 3));

    let dvGrade, dvColor;
    if (completeness >= 70) { dvGrade = 'A (Balanced)'; dvColor = 'var(--color-green, #2ecc71)'; }
    else if (completeness >= 50) { dvGrade = 'B (Decent)'; dvColor = '#8bc34a'; }
    else if (completeness >= 35) { dvGrade = 'C (Moderate)'; dvColor = 'var(--color-yellow, #f1c40f)'; }
    else { dvGrade = 'D (Low)'; dvColor = 'var(--color-orange, #e67e22)'; }

    const dvParts = [];
    if (proteinDV > 0) dvParts.push(`Protein ${proteinDV}%`);
    if (fiberDV > 0) dvParts.push(`Fiber ${fiberDV}%`);
    if (carbDV > 0) dvParts.push(`Carbs ${carbDV}%`);
    if (satFatDV > 0) dvParts.push(`Sat.fat ${satFatDV}%`);
    if (sodiumDV > 0) dvParts.push(`Sodium ${sodiumDV}%`);

    results.daily_values = {
      label: 'Daily Value Completeness',
      score: completeness,
      maxScore: 100,
      percent: completeness,
      grade: dvGrade,
      color: dvColor,
      details: dvParts.length > 0
        ? `Estimated %DV (per 100g, 2000 kcal): ${dvParts.join(' | ')}. Overall: ${completeness}/100.`
        : 'Insufficient nutrition data to estimate daily values.',
    };
  }

  if (enabledSet.has('nutrient_density') && hasNutrition) {
    const p100 = nutritionData.per100g;
    const calPer100 = p100.energy_kcal || 0;
    const protein = p100.protein_g || 0;
    const fiber = p100.dietary_fiber_g || 0;
    const satFat = p100.saturated_fat_g || 0;
    const sugar = p100.sugars_g || 0;
    const sodium = p100.sodium_mg || 0;

    let ndScore = 0;
    let ndMax = 0;

    if (calPer100 > 0) {
      // Positive contributions
      if (protein > 0) { ndScore += Math.min(25, protein / (calPer100 / 100) * 5); ndMax += 25; }
      if (fiber > 0) { ndScore += Math.min(25, fiber / (calPer100 / 100) * 10); ndMax += 25; }
      // Negative contributions (inverted)
      if (satFat > 0) { ndScore += Math.max(0, 25 - satFat / (calPer100 / 100) * 5); ndMax += 25; }
      if (sugar > 0) { ndScore += Math.max(0, 25 - sugar / (calPer100 / 100) * 4); ndMax += 25; }
      if (sodium > 0) { ndScore += Math.max(0, 25 - sodium / (calPer100 / 100) * 2); ndMax += 25; }
    }

    const ndPct = ndMax > 0 ? Math.round(ndScore / ndMax * 100) : 50;
    let ndGrade, ndColor;
    if (ndPct >= 75) { ndGrade = 'A (Nutrient-dense)'; ndColor = 'var(--color-green, #2ecc71)'; }
    else if (ndPct >= 55) { ndGrade = 'B (Good)'; ndColor = '#8bc34a'; }
    else if (ndPct >= 40) { ndGrade = 'C (Average)'; ndColor = 'var(--color-yellow, #f1c40f)'; }
    else { ndGrade = 'D (Low nutrient density)'; ndColor = 'var(--color-orange, #e67e22)'; }

    results.nutrient_density = {
      label: 'Nutrient Density Index',
      score: ndPct,
      maxScore: 100,
      percent: ndPct,
      grade: ndGrade,
      color: ndColor,
      details: calPer100 > 0
        ? `Score: ${ndPct}/100. Protein: ${protein}g, Fiber: ${fiber}g, Sat.fat: ${satFat}g, Sugar: ${sugar}g, Sodium: ${sodium}mg (per 100g).`
        : 'Insufficient nutrition data for density scoring.',
    };
  }

  if (enabledSet.has('fortification')) {
    const foundFort = ingredients.filter(i => FORTIFICATION_NUTRIENTS.some(f => i.toLowerCase().includes(f)));
    results.fortification = {
      label: 'Fortification & Enrichment',
      score: foundFort.length,
      maxScore: Math.max(foundFort.length, 1),
      percent: Math.min(100, foundFort.length * 20),
      grade: foundFort.length > 0 ? `${foundFort.length} added nutrient${foundFort.length !== 1 ? 's' : ''}` : 'None detected',
      color: 'var(--color-text)',
      details: foundFort.length > 0
        ? `Contains added nutrients: ${foundFort.join(', ')}. Note: fortification often indicates a processed base made to appear nutritious.`
        : 'No added vitamins, minerals, or synthetic nutrients detected.',
    };
  }

  return results;
}

function countProcessingIndicators(ingredients) {
  let count = 0;
  for (const ing of ingredients) {
    const c = categorizeIngredientClient(ing);
    if (['preservative', 'emulsifier', 'thickener', 'stabilizer', 'gelling_agent', 'artificial_color', 'artificial_flavor', 'artificial_sweetener', 'leavening_agent', 'acidity_regulator'].includes(c.category)) count++;
    if (c.e_number) count++;
  }
  return count;
}

function countUltraProcessed(ingredients) {
  let count = 0;
  for (const ing of ingredients) {
    const lower = ing.toLowerCase();
    if (lower.includes('hydrogenated') || lower.includes('margarine') || lower.includes('shortening')) count++;
    const c = categorizeIngredientClient(ing);
    if (['artificial_color', 'artificial_flavor', 'artificial_sweetener'].includes(c.category)) count++;
    if (['e471', 'e475', 'e476', 'e481', 'e435', 'e433'].includes(c.e_number)) count++;
  }
  return count;
}

function estimatePositionGrams(items, allItems) {
  if (items.length === 0) return 0;
  const total = allItems.length;
  let totalEst = 0;
  for (const item of items) {
    const pos = allItems.indexOf(item) + 1;
    const est = Math.max(1, Math.round((100 / total) * (1 - (pos - 1) / total) * 0.8));
    totalEst += est;
  }
  return Math.round(totalEst);
}

// ── Image preprocessing for better OCR ──
function preprocessImageForOCR(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.width;
      const h = img.height;
      // Upscale if too small
      const scale = Math.max(1, 1200 / Math.max(w, h));
      const cw = Math.round(w * scale);
      const ch = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, cw, ch);

      const imageData = ctx.getImageData(0, 0, cw, ch);
      const data = imageData.data;

      // Step 1: Grayscale + contrast stretch + sharpen
      const gray = new Float32Array(data.length / 4);
      for (let i = 0; i < data.length; i += 4) {
        gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }

      // Simple unsharp mask (3x3)
      for (let i = 0; i < data.length; i += 4) {
        let idx = i / 4;
        let orig = gray[idx];
        let sum = 0, count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = Math.floor(idx / cw) + dy;
            const nx = (idx % cw) + dx;
            if (ny >= 0 && ny < ch && nx >= 0 && nx < cw) {
              sum += gray[ny * cw + nx];
              count++;
            }
          }
        }
        const blur = sum / count;
        const sharp = orig + (orig - blur) * 0.8;
        const clamped = Math.max(0, Math.min(255, sharp));

        // Otsu-like binarization (simplified: fixed threshold at 128 after contrast stretch)
        const bin = clamped > 128 ? 255 : 0;
        data[i] = bin;
        data[i + 1] = bin;
        data[i + 2] = bin;
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = dataUrl;
  });
}

// ── Nutrition facts parser (Indian FSSAI format) ──
const NUTRIENT_FIELDS = [
  { key: 'energy_kcal', names: ['energy'], unit: 'kcal', multiplier: 1 },
  { key: 'protein_g', names: ['protein'], unit: 'g' },
  { key: 'carbohydrate_g', names: ['carbohydrate', 'carbs', 'total carbohydrate'], unit: 'g' },
  { key: 'sugars_g', names: ['sugars', 'total sugars', 'sugar'], unit: 'g' },
  { key: 'added_sugars_g', names: ['added sugars', 'added sugar'], unit: 'g' },
  { key: 'total_fat_g', names: ['total fat', 'fat'], unit: 'g' },
  { key: 'saturated_fat_g', names: ['saturated fat', 'saturated', 'saturates'], unit: 'g' },
  { key: 'trans_fat_g', names: ['trans fat', 'trans', 'trans fatty acids'], unit: 'g' },
  { key: 'cholesterol_mg', names: ['cholesterol'], unit: 'mg' },
  { key: 'sodium_mg', names: ['sodium'], unit: 'mg' },
  { key: 'dietary_fiber_g', names: ['dietary fiber', 'dietary fibre', 'fiber', 'fibre'], unit: 'g' },
];

function parseNutritionFacts(text) {
  const result = {
    servingSize: null,
    servingsPerPack: null,
    perServing: {},
    per100g: {},
  };

  const ss = text.match(/serving\s*size[:\s]*([0-9.]+)\s*(g|ml)/i);
  if (ss) result.servingSize = parseFloat(ss[1]);
  const sp = text.match(/servings?\s*per\s*(pack|container)[:\s]*([0-9.]+)/i);
  if (sp) result.servingsPerPack = parseFloat(sp[2]);

  const lines = text.split('\n');
  let active = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/nutrition/i.test(line) && !active) { active = true; continue; }
    if (!active) continue;

    // Skip header lines
    if (/per\s*(serving|100)|serving\s*size|servings?\s*per/i.test(line)) continue;

    // Find which nutrient this line matches
    let matched = null;
    for (const f of NUTRIENT_FIELDS) {
      if (f.names.some(n => new RegExp(`\\b${n}\\b`, 'i').test(line))) {
        matched = f;
        break;
      }
    }
    if (!matched) continue;

    // Extract all number-value pairs from the line
    const vals = [...line.matchAll(/([0-9.]+)\s*(kcal|kj|g|mg|mcg|\\u00b5g)/gi)];
    if (vals.length === 0) continue;

    const nums = vals.map(v => parseFloat(v[1]));

    if (matched.unit === 'kcal' && matched.key === 'energy_kcal') {
      // Handle kJ → kcal conversion: if first value has kJ unit, convert
      if (vals[0][2].toLowerCase() === 'kj' && nums.length >= 1) {
        result.per100g.energy_kcal = Math.round(nums[0] / 4.184);
        if (nums.length >= 2) result.perServing.energy_kcal = Math.round(nums[1] / 4.184);
        else if (result.servingSize) {
          result.perServing.energy_kcal = Math.round(nums[0] / 4.184 * result.servingSize / 100);
        }
        continue;
      }
      if (vals[0][2].toLowerCase() === 'kcal') {
        if (nums.length >= 2) {
          result.perServing.energy_kcal = nums[0];
          result.per100g.energy_kcal = nums[1];
        } else {
          result.per100g.energy_kcal = nums[0];
        }
        continue;
      }
    }

    if (nums.length >= 2) {
      // Dual column: first is per serving, second is per 100g
      result.perServing[matched.key] = nums[0];
      result.per100g[matched.key] = nums[1];
    } else {
      // Single column: assume per 100g
      result.per100g[matched.key] = nums[0];
      // Derive per serving if serving size known
      if (result.servingSize) {
        result.perServing[matched.key] = Math.round(nums[0] * result.servingSize / 100 * 10) / 10;
      }
    }
  }

  // If energy not found, try kJ as fallback
  if (!result.per100g.energy_kcal) {
    const kjMatch = text.match(/energy[^0-9]*([0-9.]+)\s*kj/i);
    if (kjMatch) {
      result.per100g.energy_kcal = Math.round(parseFloat(kjMatch[1]) / 4.184);
    }
  }

  return result;
}

export function init(container) {
  let mediaStream = null;
  let tesseractWorker = null;
  let isProcessing = false;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;flex-direction:column;height:100%;padding:1.5rem;gap:1.25rem;overflow-y:auto;';
  container.appendChild(wrapper);

  // ── Header ──
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:0.75rem;flex-wrap:wrap;';

  const title = document.createElement('h2');
  title.textContent = '🔬 Ingredient Scanner';
  title.style.cssText = 'margin:0;font-size:1.15rem;font-weight:700;color:var(--color-text);';

  const headerBtns = document.createElement('div');
  headerBtns.style.cssText = 'display:flex;gap:0.5rem;';

  const cameraBtn = document.createElement('button');
  cameraBtn.innerHTML = '📷&nbsp; Camera';
  cameraBtn.style.cssText = 'padding:0.5rem 1rem;border:none;border-radius:8px;background:var(--color-primary);color:#fff;font-size:0.8rem;font-weight:600;cursor:pointer;transition:opacity 0.15s;display:flex;align-items:center;gap:0.3rem;';

  const uploadBtn = document.createElement('button');
  uploadBtn.innerHTML = '📁&nbsp; Upload';
  uploadBtn.style.cssText = 'padding:0.5rem 1rem;border:1px solid var(--color-border);border-radius:8px;background:var(--color-surface);color:var(--color-text);font-size:0.8rem;font-weight:600;cursor:pointer;transition:opacity 0.15s;display:flex;align-items:center;gap:0.3rem;';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';

  const settingsBtn = document.createElement('button');
  settingsBtn.innerHTML = '⚙';
  settingsBtn.title = 'Analysis Settings';
  settingsBtn.style.cssText = 'width:36px;height:36px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-surface);color:var(--color-text);font-size:1.1rem;cursor:pointer;transition:opacity 0.15s;display:flex;align-items:center;justify-content:center;';

  headerBtns.appendChild(cameraBtn);
  headerBtns.appendChild(uploadBtn);
  headerBtns.appendChild(settingsBtn);
  header.appendChild(title);
  header.appendChild(headerBtns);
  wrapper.appendChild(header);

  // ── Settings Panel ──
  const settingsPanel = document.createElement('div');
  settingsPanel.style.cssText = 'display:none;flex-direction:column;gap:0.4rem;padding:0.75rem;border:1px solid var(--color-border);border-radius:8px;background:var(--color-bg);font-size:0.78rem;';
  settingsPanel.dataset.role = 'settings-panel';

  const settingsTitle = document.createElement('div');
  settingsTitle.textContent = 'Health Analysis Settings';
  settingsTitle.style.cssText = 'font-weight:600;color:var(--color-text);font-size:0.82rem;';
  settingsPanel.appendChild(settingsTitle);

  const settingsHint = document.createElement('div');
  settingsHint.textContent = 'Select which analyses to run:';
  settingsHint.style.cssText = 'font-size:0.72rem;color:var(--color-text-muted);margin-bottom:0.2rem;';
  settingsPanel.appendChild(settingsHint);

  const toggleAllRow = document.createElement('div');
  toggleAllRow.style.cssText = 'display:flex;gap:0.5rem;margin-bottom:0.3rem;';

  const selectAllBtn = document.createElement('button');
  selectAllBtn.textContent = 'Select All';
  selectAllBtn.style.cssText = 'padding:0.2rem 0.5rem;border:1px solid var(--color-border);border-radius:4px;font-size:0.7rem;cursor:pointer;background:none;color:var(--color-text);';
  const deselectAllBtn = document.createElement('button');
  deselectAllBtn.textContent = 'Deselect All';
  deselectAllBtn.style.cssText = 'padding:0.2rem 0.5rem;border:1px solid var(--color-border);border-radius:4px;font-size:0.7rem;cursor:pointer;background:none;color:var(--color-text-muted);';

  toggleAllRow.appendChild(selectAllBtn);
  toggleAllRow.appendChild(deselectAllBtn);
  settingsPanel.appendChild(toggleAllRow);

  const analysisToggles = {};
  for (const a of ALL_ANALYSES) {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:flex-start;gap:0.4rem;cursor:pointer;padding:0.15rem 0;';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.style.cssText = 'accent-color:var(--color-primary);cursor:pointer;margin-top:0.1rem;flex-shrink:0;';
    cb.dataset.analysisId = a.id;

    const labelWrap = document.createElement('div');
    labelWrap.style.cssText = 'display:flex;flex-direction:column;gap:1px;';

    const label = document.createElement('span');
    label.textContent = a.label;
    label.style.cssText = 'color:var(--color-text);font-size:0.75rem;font-weight:500;';

    const desc = document.createElement('span');
    desc.textContent = a.description;
    desc.style.cssText = 'font-size:0.65rem;color:var(--color-text-muted);';

    labelWrap.appendChild(label);
    labelWrap.appendChild(desc);
    row.appendChild(cb);
    row.appendChild(labelWrap);
    settingsPanel.appendChild(row);
    analysisToggles[a.id] = cb;
  }

  async function loadSettings() {
    const enabled = await getAnalysisSettings();
    const enabledSet = new Set(enabled);
    for (const a of ALL_ANALYSES) {
      analysisToggles[a.id].checked = enabledSet.has(a.id);
    }
  }

  async function saveSettings() {
    const enabled = [];
    for (const a of ALL_ANALYSES) {
      if (analysisToggles[a.id].checked) enabled.push(a.id);
    }
    await saveAnalysisSettings(enabled);
  }

  selectAllBtn.addEventListener('click', () => {
    for (const a of ALL_ANALYSES) analysisToggles[a.id].checked = true;
    saveSettings();
  });
  deselectAllBtn.addEventListener('click', () => {
    for (const a of ALL_ANALYSES) analysisToggles[a.id].checked = false;
    saveSettings();
  });
  for (const a of ALL_ANALYSES) {
    analysisToggles[a.id].addEventListener('change', saveSettings);
  }

  settingsBtn.addEventListener('click', () => {
    settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'flex' : 'none';
  });

  loadSettings();
  wrapper.appendChild(settingsPanel);

  // ── Status bar ──
  const status = document.createElement('div');
  status.style.cssText = 'display:flex;align-items:center;gap:0.4rem;font-size:0.82rem;color:var(--color-text-muted);padding:0.5rem 0.75rem;background:var(--color-bg);border-radius:8px;border:1px solid var(--color-border);min-height:1.2em;';
  const statusIcon = document.createElement('span');
  statusIcon.textContent = '💡';
  const statusText = document.createElement('span');
  statusText.textContent = 'Capture or upload a product ingredients label to begin.';
  status.appendChild(statusIcon);
  status.appendChild(statusText);
  wrapper.appendChild(status);

  // ── Video / Image container ──
  const videoContainer = document.createElement('div');
  videoContainer.style.cssText = 'display:none;position:relative;border-radius:8px;overflow:hidden;background:#000;min-height:200px;max-height:320px;';
  wrapper.appendChild(videoContainer);

  const video = document.createElement('video');
  video.style.cssText = 'width:100%;height:100%;object-fit:contain;';
  video.setAttribute('playsinline', '');
  video.setAttribute('autoplay', '');
  video.muted = true;
  videoContainer.appendChild(video);

  const captureBtn = document.createElement('button');
  captureBtn.textContent = '📸 Capture';
  captureBtn.style.cssText = 'position:absolute;bottom:12px;left:50%;transform:translateX(-50%);padding:0.5rem 1.2rem;border:none;border-radius:24px;background:var(--color-primary);color:#fff;font-size:0.85rem;font-weight:600;cursor:pointer;z-index:10;opacity:0.9;transition:opacity 0.15s;display:none;';
  captureBtn.onmouseenter = () => { captureBtn.style.opacity = '1'; };
  captureBtn.onmouseleave = () => { captureBtn.style.opacity = '0.9'; };
  videoContainer.appendChild(captureBtn);

  // ── Preview / Processing Overlay ──
  const previewContainer = document.createElement('div');
  previewContainer.style.cssText = 'display:none;position:relative;border-radius:8px;overflow:hidden;background:var(--color-bg);border:1px solid var(--color-border);min-height:120px;';
  wrapper.appendChild(previewContainer);

  const previewImg = document.createElement('img');
  previewImg.style.cssText = 'width:100%;max-height:260px;object-fit:contain;display:block;';
  previewContainer.appendChild(previewImg);

  const processingOverlay = document.createElement('div');
  processingOverlay.style.cssText = 'display:none;position:absolute;inset:0;background:rgba(0,0,0,0.55);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.75rem;z-index:5;';
  processingOverlay.id = 'processing-overlay';

  const spinner = document.createElement('div');
  spinner.style.cssText = 'width:36px;height:36px;border:3px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite;';
  const spinStyle = document.createElement('style');
  spinStyle.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(spinStyle);

  const procStatus = document.createElement('div');
  procStatus.style.cssText = 'color:#fff;font-size:0.85rem;font-weight:500;text-align:center;padding:0 1rem;';
  procStatus.textContent = 'Processing...';

  processingOverlay.appendChild(spinner);
  processingOverlay.appendChild(procStatus);
  previewContainer.appendChild(processingOverlay);
  processingOverlay.style.display = 'none';

  // ── Manual text input ──
  const manualSection = document.createElement('div');
  manualSection.style.cssText = 'display:flex;flex-direction:column;gap:0.4rem;';

  const manualHeader = document.createElement('div');
  manualHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';

  const manualTitle = document.createElement('div');
  manualTitle.textContent = 'Or enter ingredients manually:';
  manualTitle.style.cssText = 'font-size:0.82rem;font-weight:600;color:var(--color-text);';

  const analyzeBtn = document.createElement('button');
  analyzeBtn.textContent = 'Analyze';
  analyzeBtn.style.cssText = 'padding:0.35rem 0.8rem;border:none;border-radius:6px;background:var(--color-primary);color:#fff;font-size:0.78rem;font-weight:600;cursor:pointer;';

  manualHeader.appendChild(manualTitle);
  manualHeader.appendChild(analyzeBtn);

  const textarea = document.createElement('textarea');
  textarea.placeholder = 'e.g. Sugar, Wheat Flour, Palm Oil, Salt, Emulsifier (E471)...';
  textarea.style.cssText = 'width:100%;min-height:60px;padding:0.5rem;border:1px solid var(--color-border);border-radius:6px;font-size:0.78rem;background:var(--color-surface);color:var(--color-text);resize:vertical;box-sizing:border-box;font-family:inherit;';
  textarea.rows = 2;

  manualSection.appendChild(manualHeader);
  manualSection.appendChild(textarea);
  wrapper.appendChild(manualSection);

  // ── Results section ──
  const resultsSection = document.createElement('div');
  resultsSection.style.cssText = 'display:none;flex-direction:column;gap:1rem;';
  wrapper.appendChild(resultsSection);

  const ingredientTableContainer = document.createElement('div');
  ingredientTableContainer.style.cssText = 'border:1px solid var(--color-border);border-radius:8px;overflow:hidden;';
  resultsSection.appendChild(ingredientTableContainer);

  const analysisCards = document.createElement('div');
  analysisCards.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:0.75rem;';
  resultsSection.appendChild(analysisCards);

  // ── File input ──
  wrapper.appendChild(fileInput);

  // ── Camera logic ──
  cameraBtn.addEventListener('click', async () => {
    if (mediaStream) {
      stopCamera();
      return;
    }
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      video.srcObject = mediaStream;
      videoContainer.style.display = 'block';
      captureBtn.style.display = 'block';
      cameraBtn.textContent = 'Close Camera';
      previewContainer.style.display = 'none';
      resultsSection.style.display = 'none';
      statusText.textContent = 'Camera active. Point at ingredients list and tap Capture.';
    } catch {
      statusText.textContent = 'Camera unavailable. Grant permission or use Upload / manual entry.';
    }
  });

  captureBtn.addEventListener('click', () => {
    if (!mediaStream) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    stopCamera();
    processImage(dataUrl);
  });

  function stopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
    videoContainer.style.display = 'none';
    captureBtn.style.display = 'none';
    cameraBtn.textContent = 'Open Camera';
  }

  // ── Upload logic ──
  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    fileInput.value = '';
    const reader = new FileReader();
    reader.onload = (e) => processImage(e.target.result);
    reader.readAsDataURL(file);
  });

  // ── Process image ──
  async function processImage(dataUrl) {
    if (isProcessing) return;
    isProcessing = true;

    previewImg.src = dataUrl;
    previewContainer.style.display = 'block';
    processingOverlay.style.display = 'flex';
    procStatus.textContent = 'Extracting text from image with OCR...';
    statusText.textContent = 'Running OCR...';
    resultsSection.style.display = 'none';

    try {
      // Preprocess image for better OCR
      const preprocessed = await preprocessImageForOCR(dataUrl);
      previewImg.src = preprocessed;

      if (!tesseractWorker) {
        tesseractWorker = await Tesseract.createWorker('eng');
      }
      const { data } = await tesseractWorker.recognize(preprocessed);
      const extracted = data.text.trim();

      if (!extracted) {
        procStatus.textContent = 'No text detected. Try a clearer image or enter manually.';
        statusText.textContent = 'OCR returned no text.';
        isProcessing = false;
        return;
      }

      procStatus.textContent = 'Analyzing ingredients...';
      statusText.textContent = 'Analyzing extracted ingredients...';
      await runAnalysis(extracted);
    } catch (err) {
      toolLog('ingredient-scanner', 'api_error', { summary: `OCR error: ${err.message}` }).catch(() => {});
      procStatus.textContent = 'OCR failed. Try a clearer image or enter manually.';
      statusText.textContent = 'OCR error.';
    } finally {
      isProcessing = false;
      processingOverlay.style.display = 'none';
    }
  }

  // ── Run analysis ──
  analyzeBtn.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if (!text) {
      statusText.textContent = 'Please enter ingredient text first.';
      return;
    }
    previewContainer.style.display = 'none';
    resultsSection.style.display = 'none';
    statusText.textContent = 'Analyzing ingredients...';
    await runAnalysis(text);
  });

  async function runAnalysis(text) {
    // Try to split ingredients vs nutrition section
    let ingredientsText = text;
    let nutritionText = text;

    // Auto-detect: look for nutrition section and split
    const nutritionIdx = text.search(/nutrition\s*(information|facts|label|values?|data)/i);
    if (nutritionIdx >= 0) {
      // Text before nutrition section = ingredients
      // Text from nutrition section onwards = nutrition data
      ingredientsText = text.substring(0, nutritionIdx).trim();
      nutritionText = text.substring(nutritionIdx).trim();
    }

    const ingredients = parseIngredients(ingredientsText);
    const nutritionData = parseNutritionFacts(nutritionText);

    if (ingredients.length === 0 && !nutritionData.per100g.energy_kcal && Object.keys(nutritionData.per100g).length === 0) {
      statusText.textContent = 'No ingredients or nutrition data parsed. Check the format.';
      return;
    }

    // Try backend AI for enhanced categorization
    let aiIngredients = null;
    let aiUsed = false;
    try {
      const res = await fetch('/api/tools/ingredient-scanner/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const aiData = await res.json();
        aiIngredients = aiData.ingredients;
        aiUsed = true;
      }
    } catch { /* fall back to client-side categorization */ }

    // Build ingredient objects (AI enhanced or client-side)
    const parsed = [];
    if (aiIngredients && aiIngredients.length === ingredients.length) {
      // AI returned structured data — use it
      for (const ai of aiIngredients) {
        parsed.push({
          name: ai.name,
          category: ai.category || 'other',
          function: INGREDIENT_FUNCTIONS[ai.category] || ai.function || 'Unknown',
          is_whole_food: ai.is_whole_food ?? isWholeFood(ai.name, ai.category),
          is_recognizable: ai.is_recognizable ?? isRecognizable(ai.name),
          is_additive: ai.is_additive ?? isAdditive(ai.category, ai.e_number),
          e_number: ai.e_number || null,
        });
      }
    } else {
      // Client-side categorization
      for (const ing of ingredients) {
        const cat = categorizeIngredientClient(ing);
        const eInfo = cat.e_number ? getAdditiveInfo(cat.e_number) : null;
        parsed.push({
          name: ing,
          category: cat.category,
          function: INGREDIENT_FUNCTIONS[cat.category] || 'Other',
          is_whole_food: isWholeFood(ing, cat.category),
          is_recognizable: isRecognizable(ing),
          is_additive: isAdditive(cat.category, cat.e_number),
          e_number: cat.e_number,
          e_risk: eInfo?.risk || null,
        });
      }
    }

    // Run enabled analyses
    const enabled = await getAnalysisSettings();
    const analysisResults = await analyzeIngredients(ingredients, text, enabled, nutritionData);

    toolLog('ingredient-scanner', 'api_response', {
      summary: `Analyzed ${ingredients.length} ingredients, ${Object.keys(analysisResults).length} analysis metrics`,
      aiUsed,
    }).catch(() => {});

    renderResults(parsed, analysisResults, aiUsed, nutritionData);
    const parts = [`${ingredients.length} ingredients`];
    if (nutritionData && nutritionData.per100g.energy_kcal) parts.push('nutrition data parsed');
    parts.push(`${Object.keys(analysisResults).length} health metrics evaluated`);
    statusText.textContent = parts.join(', ') + '.';
  }

  // ── Render results ──
  function renderResults(parsed, analysisResults, aiUsed, nutritionData) {
    ingredientTableContainer.innerHTML = '';
    analysisCards.innerHTML = '';
    const hasNutrition = nutritionData && (
      nutritionData.per100g.energy_kcal ||
      Object.keys(nutritionData.per100g).length > 0
    );

    // ── Ingredient List ──
    const listHeader = document.createElement('div');
    listHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:0.75rem 1rem;background:var(--color-surface);border-bottom:1px solid var(--color-border);border-radius:8px 8px 0 0;';

    const listTitle = document.createElement('span');
    listTitle.style.cssText = 'font-size:0.85rem;font-weight:600;color:var(--color-text);display:flex;align-items:center;gap:0.5rem;';
    listTitle.innerHTML = `<span style="font-size:1rem;">📋</span> Ingredients (${parsed.length})`;

    const listBadge = document.createElement('span');
    listBadge.textContent = aiUsed ? 'AI Enhanced' : 'Client-side';
    listBadge.style.cssText = 'font-size:0.65rem;padding:0.2rem 0.5rem;border-radius:4px;background:var(--color-primary);color:#fff;font-weight:500;white-space:nowrap;';

    listHeader.appendChild(listTitle);
    listHeader.appendChild(listBadge);
    ingredientTableContainer.appendChild(listHeader);

    const listBody = document.createElement('div');
    listBody.style.cssText = 'display:flex;flex-direction:column;';

    for (let i = 0; i < parsed.length; i++) {
      const ing = parsed[i];
      const catColor = CATEGORY_COLORS[ing.category] || 'var(--color-text-muted)';

      let healthDot, healthTitle;
      if (ing.is_whole_food) {
        healthDot = '#2ecc71'; healthTitle = 'Good';
      } else if (ing.is_additive) {
        if (ing.e_risk === 'warning') { healthDot = '#e74c3c'; healthTitle = 'Avoid'; }
        else if (ing.e_risk === 'caution') { healthDot = '#e67e22'; healthTitle = 'Caution'; }
        else { healthDot = '#f39c12'; healthTitle = 'Info'; }
      } else {
        healthDot = 'var(--color-text-muted)'; healthTitle = 'Neutral';
      }

      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:2rem 1fr auto 0.75rem;gap:0.5rem;align-items:center;padding:0.45rem 0.85rem;border-bottom:1px solid var(--color-border);transition:background 0.1s;font-size:0.78rem;';

      const isEven = i % 2 === 0;
      if (isEven) row.style.background = 'var(--color-bg)';
      row.onmouseenter = () => { row.style.background = 'var(--color-surface)'; };
      row.onmouseleave = () => { row.style.background = isEven ? 'var(--color-bg)' : ''; };

      const numEl = document.createElement('span');
      numEl.textContent = i + 1;
      numEl.style.cssText = 'color:var(--color-text-muted);font-size:0.7rem;text-align:center;font-weight:500;';

      const nameEl = document.createElement('div');
      nameEl.style.cssText = 'display:flex;flex-direction:column;gap:1px;min-width:0;';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = ing.name;
      nameSpan.style.cssText = 'color:var(--color-text);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      nameEl.appendChild(nameSpan);
      if (ing.e_number) {
        const metaSpan = document.createElement('span');
        metaSpan.textContent = `E-number: ${ing.e_number}`;
        metaSpan.style.cssText = 'font-size:0.65rem;color:var(--color-text-muted);';
        nameEl.appendChild(metaSpan);
      }

      const catEl = document.createElement('span');
      catEl.textContent = `${CATEGORY_ICONS[ing.category] || ''} ${ing.category.replace(/_/g, ' ')}`;
      catEl.style.cssText = `font-size:0.65rem;padding:0.15rem 0.45rem;border-radius:4px;background:${catColor}18;color:${catColor};font-weight:500;white-space:nowrap;`;

      const healthEl = document.createElement('span');
      healthEl.style.cssText = `width:0.6rem;height:0.6rem;border-radius:50%;background:${healthDot};justify-self:center;flex-shrink:0;`;
      healthEl.title = healthTitle;

      row.appendChild(numEl);
      row.appendChild(nameEl);
      row.appendChild(catEl);
      row.appendChild(healthEl);
      listBody.appendChild(row);
    }

    ingredientTableContainer.appendChild(listBody);

    // ── Nutrition Facts panel ──
    let nutritionPanel = null;
    if (hasNutrition) {
      nutritionPanel = document.createElement('div');
      nutritionPanel.style.cssText = 'border:1px solid var(--color-border);border-radius:8px;overflow:hidden;';

      const nutHeader = document.createElement('div');
      nutHeader.style.cssText = 'display:flex;align-items:center;gap:0.5rem;padding:0.75rem 1rem;background:var(--color-surface);border-bottom:1px solid var(--color-border);font-size:0.85rem;font-weight:600;color:var(--color-text);';
      nutHeader.innerHTML = '<span style="font-size:1rem;">📊</span> Nutrition Facts';
      if (nutritionData.servingSize) {
        const ssBadge = document.createElement('span');
        ssBadge.textContent = `Serving: ${nutritionData.servingSize}g`;
        ssBadge.style.cssText = 'font-size:0.65rem;padding:0.15rem 0.4rem;border-radius:4px;background:var(--color-bg);color:var(--color-text-muted);font-weight:500;margin-left:auto;';
        nutHeader.appendChild(ssBadge);
      }
      nutritionPanel.appendChild(nutHeader);

      const p100 = nutritionData.per100g;
      const pSrv = nutritionData.perServing;

      // Build rows for available nutrients
      const nutRows = [];
      const addRow = (label, key, unit) => {
        const val100 = p100[key];
        const valSrv = pSrv[key];
        if (val100 === undefined && valSrv === undefined) return;
        nutRows.push({ label, valSrv, val100, unit });
      };

      addRow('Energy', 'energy_kcal', 'kcal');
      addRow('Protein', 'protein_g', 'g');
      addRow('Carbohydrate', 'carbohydrate_g', 'g');
      addRow('Sugars', 'sugars_g', 'g');
      addRow('Added Sugars', 'added_sugars_g', 'g');
      addRow('Total Fat', 'total_fat_g', 'g');
      addRow('Saturated Fat', 'saturated_fat_g', 'g');
      addRow('Trans Fat', 'trans_fat_g', 'g');
      addRow('Cholesterol', 'cholesterol_mg', 'mg');
      addRow('Sodium', 'sodium_mg', 'mg');
      addRow('Dietary Fiber', 'dietary_fiber_g', 'g');

      if (nutRows.length > 0) {
        const table = document.createElement('div');
        table.style.cssText = 'display:grid;grid-template-columns:1fr auto auto;font-size:0.75rem;';

        // Header row
        const hdr = document.createElement('div');
        hdr.style.cssText = 'display:contents;font-weight:600;color:var(--color-text-muted);font-size:0.68rem;text-transform:uppercase;letter-spacing:0.3px;';
        hdr.innerHTML = `<div style="padding:0.4rem 0.75rem;border-bottom:1px solid var(--color-border);">Nutrient</div>
          <div style="padding:0.4rem 0.75rem;border-bottom:1px solid var(--color-border);text-align:right;">Per serving</div>
          <div style="padding:0.4rem 0.75rem;border-bottom:1px solid var(--color-border);text-align:right;">Per 100g</div>`;
        table.appendChild(hdr);

        for (const r of nutRows) {
          const rowDiv = document.createElement('div');
          rowDiv.style.cssText = 'display:contents;';
          rowDiv.innerHTML = `<div style="padding:0.35rem 0.75rem;border-bottom:1px solid var(--color-border);color:var(--color-text);">${r.label}</div>
            <div style="padding:0.35rem 0.75rem;border-bottom:1px solid var(--color-border);text-align:right;color:var(--color-text);font-weight:500;">${r.valSrv !== undefined ? `${r.valSrv} ${r.unit}` : '—'}</div>
            <div style="padding:0.35rem 0.75rem;border-bottom:1px solid var(--color-border);text-align:right;color:var(--color-text-muted);">${r.val100 !== undefined ? `${r.val100} ${r.unit}` : '—'}</div>`;
          table.appendChild(rowDiv);
        }
        nutritionPanel.appendChild(table);
      } else {
        const empty = document.createElement('div');
        empty.textContent = 'Nutrition data parsed but no structured values extracted.';
        empty.style.cssText = 'padding:0.75rem;font-size:0.75rem;color:var(--color-text-muted);text-align:center;';
        nutritionPanel.appendChild(empty);
      }

      resultsSection.insertBefore(nutritionPanel, analysisCards);
    }

    // ── Health Analysis cards ──
    const cardCount = Object.keys(analysisResults).length;
    if (cardCount === 0) {
      const empty = document.createElement('div');
      empty.innerHTML = '⚙️ No analyses selected. Open <strong>Settings</strong> to enable analyses.';
      empty.style.cssText = 'font-size:0.82rem;color:var(--color-text-muted);font-style:italic;padding:1rem;text-align:center;';
      analysisCards.appendChild(empty);
    } else {
      for (const [key, result] of Object.entries(analysisResults)) {
        const card = document.createElement('div');
        card.style.cssText = 'border:1px solid var(--color-border);border-radius:10px;padding:0.85rem;background:var(--color-surface);display:flex;flex-direction:column;gap:0.55rem;transition:box-shadow 0.15s;';

        const hdr = document.createElement('div');
        hdr.style.cssText = 'display:flex;align-items:center;gap:0.5rem;';

        const iconEl = document.createElement('span');
        iconEl.textContent = ANALYSIS_ICONS[key] || '📊';
        iconEl.style.cssText = 'font-size:1.15rem;flex-shrink:0;line-height:1;';

        const labelEl = document.createElement('span');
        labelEl.textContent = result.label;
        labelEl.style.cssText = 'font-size:0.82rem;font-weight:600;color:var(--color-text);flex:1;';

        const gradeEl = document.createElement('span');
        gradeEl.textContent = result.grade;
        gradeEl.style.cssText = `font-size:0.7rem;font-weight:700;padding:0.2rem 0.5rem;border-radius:5px;background:${result.color};color:#fff;white-space:nowrap;`;

        hdr.appendChild(iconEl);
        hdr.appendChild(labelEl);
        hdr.appendChild(gradeEl);
        card.appendChild(hdr);

        if (result.maxScore > 0) {
          const barOuter = document.createElement('div');
          barOuter.style.cssText = 'height:6px;border-radius:3px;background:var(--color-bg);overflow:hidden;';
          const barInner = document.createElement('div');
          barInner.style.cssText = `height:100%;width:${Math.min(100, result.percent || 0)}%;background:${result.color};border-radius:3px;transition:width 0.5s ease;`;
          barOuter.appendChild(barInner);
          card.appendChild(barOuter);
        }

        const detEl = document.createElement('div');
        detEl.textContent = result.details;
        detEl.style.cssText = 'font-size:0.7rem;color:var(--color-text-muted);line-height:1.45;';

        card.appendChild(detEl);
        analysisCards.appendChild(card);
      }
    }

    resultsSection.style.display = 'flex';
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Destroy ──
  return () => {
    stopCamera();
    if (tesseractWorker) {
      tesseractWorker.terminate().catch(() => {});
      tesseractWorker = null;
    }
    wrapper.remove();
  };
}

export function destroy(container) {
  container.innerHTML = '';
}
