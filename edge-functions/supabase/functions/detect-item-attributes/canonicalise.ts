/**
 * Attribute Canonicalisation Module
 *
 * Provides validation and normalisation of AI-detected garment attributes.
 * This module ensures that raw model outputs are transformed into a consistent
 * set of internal labels before persistence.
 *
 * Key responsibilities:
 * 1. Validate response structure (correct field types)
 * 2. Normalise values to lowercase
 * 3. Map common aliases to canonical labels
 * 4. Filter out unknown/unsupported values (silent drop)
 *
 * Design decisions:
 * - Unknown single-value fields (type, pattern, fabric, fit) → null
 * - Unknown array values (colour, season) → filtered out, may result in empty array
 * - Type mismatches → validation failure, entire response rejected
 * - Empty arrays after filtering are valid (stored as empty array or null based on DB preference)
 *
 * @module detect-item-attributes/canonicalise
 */

// ============================================================================
// Canonical Value Sets
// ============================================================================

/**
 * Canonical garment types.
 *
 * These are the internal labels stored in the database `type` column.
 * More granular than the UI-facing ItemType enum to preserve AI precision.
 */
export const CANONICAL_TYPES = new Set([
  // Tops
  't-shirt',
  'shirt',
  'blouse',
  'polo',
  'tank-top',
  'sweater',
  'hoodie',
  'cardigan',
  'vest',
  // Bottoms
  'jeans',
  'trousers',
  'shorts',
  'skirt',
  'leggings',
  // Full body
  'dress',
  'jumpsuit',
  'romper',
  // Outerwear
  'jacket',
  'coat',
  'blazer',
  'parka',
  'windbreaker',
  // Footwear
  'sneakers',
  'boots',
  'heels',
  'sandals',
  'loafers',
  'flats',
  'trainers',
  // Accessories
  'bag',
  'belt',
  'scarf',
  'hat',
  'jewellery',
  'watch',
  'tie',
  'sunglasses',
  'gloves',
  // Catch-all
  'other',
]);

/**
 * Alias mappings for garment types.
 *
 * Maps common variations, spelling differences, and synonyms to canonical types.
 * Keys are lowercase for case-insensitive matching.
 */
export const TYPE_ALIASES: Record<string, string> = {
  // T-shirt variations
  'tshirt': 't-shirt',
  'tee': 't-shirt',
  'teeshirt': 't-shirt',
  't shirt': 't-shirt',
  // Tank top variations
  'tanktop': 'tank-top',
  'tank': 'tank-top',
  'singlet': 'tank-top',
  'vest top': 'tank-top',
  // Pants/trousers
  'pants': 'trousers',
  'slacks': 'trousers',
  'chinos': 'trousers',
  'khakis': 'trousers',
  // Sweater variations
  'jumper': 'sweater',
  'pullover': 'sweater',
  'knit': 'sweater',
  'knitwear': 'sweater',
  // Hoodie variations
  'hoody': 'hoodie',
  'sweatshirt': 'hoodie',
  // Jacket variations
  'bomber': 'jacket',
  'denim jacket': 'jacket',
  'leather jacket': 'jacket',
  // Coat variations
  'overcoat': 'coat',
  'trench': 'coat',
  'trench coat': 'coat',
  // Footwear
  'shoes': 'sneakers',
  'athletic shoes': 'sneakers',
  'running shoes': 'sneakers',
  'high heels': 'heels',
  'pumps': 'heels',
  'flip flops': 'sandals',
  'flip-flops': 'sandals',
  'oxford': 'loafers',
  'oxfords': 'loafers',
  'ballet flats': 'flats',
  // Accessories
  'handbag': 'bag',
  'purse': 'bag',
  'backpack': 'bag',
  'tote': 'bag',
  'necklace': 'jewellery',
  'bracelet': 'jewellery',
  'earrings': 'jewellery',
  'ring': 'jewellery',
  'jewelry': 'jewellery',
  'cap': 'hat',
  'beanie': 'hat',
  // UK/US spelling
  'trousers': 'trousers',
  'trainers': 'trainers',
};

/**
 * Canonical colours.
 *
 * Matches WARDROBE_COLOUR_PALETTE in mobile/src/features/onboarding/types/itemMetadata.ts
 */
export const CANONICAL_COLOURS = new Set([
  'black',
  'white',
  'grey',
  'beige',
  'brown',
  'red',
  'blue',
  'green',
  'yellow',
  'orange',
  'purple',
  'pink',
  'navy',
  'burgundy',
  'olive',
  'cream',
  // Additional common colours
  'gold',
  'silver',
  'coral',
  'teal',
  'turquoise',
  'lavender',
  'maroon',
  'tan',
  'mint',
  'peach',
]);

/**
 * Alias mappings for colours.
 */
export const COLOUR_ALIASES: Record<string, string> = {
  // US spelling
  'gray': 'grey',
  // Common aliases
  'tan': 'beige',
  'khaki': 'olive',
  'ivory': 'cream',
  'off-white': 'cream',
  'offwhite': 'cream',
  'charcoal': 'grey',
  'wine': 'burgundy',
  'dark red': 'burgundy',
  'forest green': 'green',
  'dark green': 'olive',
  'light green': 'mint',
  'dark blue': 'navy',
  'light blue': 'blue',
  'sky blue': 'blue',
  'royal blue': 'blue',
  'aqua': 'teal',
  'cyan': 'teal',
  'magenta': 'pink',
  'hot pink': 'pink',
  'light pink': 'pink',
  'rose': 'pink',
  'blush': 'pink',
  'nude': 'beige',
  'camel': 'beige',
  'champagne': 'cream',
  'ecru': 'cream',
  'rust': 'orange',
  'burnt orange': 'orange',
  'mustard': 'yellow',
  'golden': 'gold',
  'bronze': 'gold',
  'copper': 'gold',
  'metallic': 'silver',
};

/**
 * Canonical seasons.
 */
export const CANONICAL_SEASONS = new Set([
  'spring',
  'summer',
  'autumn',
  'winter',
  'all-season',
]);

/**
 * Alias mappings for seasons.
 */
export const SEASON_ALIASES: Record<string, string> = {
  'fall': 'autumn',
  'year-round': 'all-season',
  'all season': 'all-season',
  'all seasons': 'all-season',
  'any': 'all-season',
  'all': 'all-season',
  'transitional': 'all-season',
};

/**
 * Canonical patterns.
 */
export const CANONICAL_PATTERNS = new Set([
  'solid',
  'striped',
  'checked',
  'plaid',
  'floral',
  'geometric',
  'abstract',
  'animal-print',
  'polka-dot',
  'camo',
  'paisley',
  'houndstooth',
  'herringbone',
  'tie-dye',
  'ombre',
  'graphic',
  'logo',
  'embroidered',
]);

/**
 * Alias mappings for patterns.
 */
export const PATTERN_ALIASES: Record<string, string> = {
  'plain': 'solid',
  'stripes': 'striped',
  'stripe': 'striped',
  'checkered': 'checked',
  'check': 'checked',
  'gingham': 'checked',
  'tartan': 'plaid',
  'scottish': 'plaid',
  'flowers': 'floral',
  'flower': 'floral',
  'botanical': 'floral',
  'leopard': 'animal-print',
  'leopard print': 'animal-print',
  'zebra': 'animal-print',
  'zebra print': 'animal-print',
  'snake': 'animal-print',
  'snakeskin': 'animal-print',
  'tiger': 'animal-print',
  'cheetah': 'animal-print',
  'animal': 'animal-print',
  'camouflage': 'camo',
  'military': 'camo',
  'dots': 'polka-dot',
  'polka dots': 'polka-dot',
  'polkadot': 'polka-dot',
  'spotted': 'polka-dot',
  'tie dye': 'tie-dye',
  'tiedye': 'tie-dye',
  'gradient': 'ombre',
  'printed': 'graphic',
  'print': 'graphic',
  'text': 'graphic',
  'slogan': 'graphic',
};

/**
 * Canonical fabrics.
 */
export const CANONICAL_FABRICS = new Set([
  'cotton',
  'denim',
  'wool',
  'polyester',
  'silk',
  'linen',
  'leather',
  'knit',
  'fleece',
  'velvet',
  'suede',
  'nylon',
  'cashmere',
  'rayon',
  'spandex',
  'tweed',
  'corduroy',
  'chiffon',
  'satin',
  'lace',
  'mesh',
  'canvas',
  'synthetic',
]);

/**
 * Alias mappings for fabrics.
 */
export const FABRIC_ALIASES: Record<string, string> = {
  'jersey': 'knit',
  'knitted': 'knit',
  'knitwear': 'knit',
  'satin': 'silk',
  'sateen': 'silk',
  'faux leather': 'leather',
  'faux-leather': 'leather',
  'vegan leather': 'leather',
  'pleather': 'leather',
  'faux suede': 'suede',
  'faux-suede': 'suede',
  'merino': 'wool',
  'lambswool': 'wool',
  'gabardine': 'wool',
  'elastane': 'spandex',
  'lycra': 'spandex',
  'stretch': 'spandex',
  'viscose': 'rayon',
  'modal': 'rayon',
  'tencel': 'rayon',
  'lyocell': 'rayon',
  'acrylic': 'synthetic',
  'polyamide': 'nylon',
  'microfiber': 'synthetic',
  'microfibre': 'synthetic',
  'terrycloth': 'cotton',
  'terry': 'cotton',
  'chambray': 'cotton',
  'oxford': 'cotton',
  'poplin': 'cotton',
  'twill': 'cotton',
  'organza': 'chiffon',
  'tulle': 'mesh',
  'net': 'mesh',
  'crochet': 'lace',
};

/**
 * Canonical fits.
 */
export const CANONICAL_FITS = new Set([
  'slim',
  'regular',
  'relaxed',
  'oversized',
  'fitted',
  'loose',
  'tailored',
  'cropped',
  'longline',
  'petite',
  'plus-size',
]);

/**
 * Alias mappings for fits.
 */
export const FIT_ALIASES: Record<string, string> = {
  'skinny': 'slim',
  'tight': 'fitted',
  'form-fitting': 'fitted',
  'form fitting': 'fitted',
  'bodycon': 'fitted',
  'body-con': 'fitted',
  'baggy': 'loose',
  'boxy': 'relaxed',
  'standard': 'regular',
  'normal': 'regular',
  'classic': 'regular',
  'straight': 'regular',
  'athletic': 'fitted',
  'muscle': 'fitted',
  'oversize': 'oversized',
  'extra large': 'oversized',
  'xl': 'oversized',
  'drop shoulder': 'relaxed',
  'drop-shoulder': 'relaxed',
  'boyfriend': 'relaxed',
  'girlfriend': 'relaxed',
  'mid-length': 'regular',
  'short': 'cropped',
  'crop': 'cropped',
  'long': 'longline',
  'maxi': 'longline',
  'midi': 'regular',
};

// ============================================================================
// Types
// ============================================================================

/**
 * Raw attributes as received from the AI model.
 * All fields are unknown until validated.
 */
export interface RawAttributes {
  type?: unknown;
  colour?: unknown;
  pattern?: unknown;
  fabric?: unknown;
  season?: unknown;
  fit?: unknown;
  [key: string]: unknown;
}

/**
 * Validated and canonicalised attributes ready for persistence.
 * All fields have been type-checked and normalised.
 */
export interface CanonicalisedAttributes {
  type: string | null;
  colour: string[];
  pattern: string | null;
  fabric: string | null;
  season: string[];
  fit: string | null;
}

/**
 * Result of the canonicalisation process.
 */
export interface CanonicalisationResult {
  /** Whether the input was valid and canonicalisation succeeded */
  valid: boolean;
  /** Canonicalised attributes (only present if valid) */
  attributes?: CanonicalisedAttributes;
  /** Error message (only present if invalid) */
  error?: string;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Checks if a value is a string.
 */
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Checks if a value is an array of strings.
 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Validates the structure of raw attributes from AI model response.
 *
 * Enforces the required schema:
 * - type: string (optional)
 * - colour: string[] (optional)
 * - pattern: string (optional)
 * - fabric: string (optional)
 * - season: string[] (optional)
 * - fit: string (optional)
 *
 * @param raw - Raw object from JSON parsing
 * @returns Error message if invalid, null if valid
 */
export function validateAttributeStructure(raw: RawAttributes): string | null {
  // type: must be string or undefined/null
  if (raw.type !== undefined && raw.type !== null && !isString(raw.type)) {
    return `Invalid 'type' field: expected string, got ${typeof raw.type}`;
  }

  // colour: must be string array or undefined/null
  if (raw.colour !== undefined && raw.colour !== null) {
    if (!isStringArray(raw.colour)) {
      // Allow single string and convert to array
      if (isString(raw.colour)) {
        // This will be handled in canonicalisation
      } else {
        return `Invalid 'colour' field: expected string[], got ${typeof raw.colour}`;
      }
    }
  }

  // pattern: must be string or undefined/null
  if (raw.pattern !== undefined && raw.pattern !== null && !isString(raw.pattern)) {
    return `Invalid 'pattern' field: expected string, got ${typeof raw.pattern}`;
  }

  // fabric: must be string or undefined/null
  if (raw.fabric !== undefined && raw.fabric !== null && !isString(raw.fabric)) {
    return `Invalid 'fabric' field: expected string, got ${typeof raw.fabric}`;
  }

  // season: must be string array or undefined/null
  if (raw.season !== undefined && raw.season !== null) {
    if (!isStringArray(raw.season)) {
      // Allow single string and convert to array
      if (isString(raw.season)) {
        // This will be handled in canonicalisation
      } else {
        return `Invalid 'season' field: expected string[], got ${typeof raw.season}`;
      }
    }
  }

  // fit: must be string or undefined/null
  if (raw.fit !== undefined && raw.fit !== null && !isString(raw.fit)) {
    return `Invalid 'fit' field: expected string, got ${typeof raw.fit}`;
  }

  return null;
}

// ============================================================================
// Canonicalisation Functions
// ============================================================================

/**
 * Normalises a single string value against a canonical set with alias support.
 *
 * @param value - Raw value to normalise
 * @param canonicalSet - Set of valid canonical values
 * @param aliases - Mapping of aliases to canonical values
 * @returns Canonical value or null if not recognised
 */
function canonicaliseSingleValue(
  value: string | null | undefined,
  canonicalSet: Set<string>,
  aliases: Record<string, string>
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalised = value.toLowerCase().trim();

  if (normalised === '') {
    return null;
  }

  // Check canonical set first
  if (canonicalSet.has(normalised)) {
    return normalised;
  }

  // Check aliases
  const aliased = aliases[normalised];
  if (aliased && canonicalSet.has(aliased)) {
    return aliased;
  }

  // Try removing common suffixes/variations
  const withoutSpaces = normalised.replace(/\s+/g, '-');
  if (canonicalSet.has(withoutSpaces)) {
    return withoutSpaces;
  }

  const withSpaces = normalised.replace(/-/g, ' ');
  const aliasedWithSpaces = aliases[withSpaces];
  if (aliasedWithSpaces && canonicalSet.has(aliasedWithSpaces)) {
    return aliasedWithSpaces;
  }

  // Not recognised - return null (silent drop)
  return null;
}

/**
 * Normalises an array of string values against a canonical set with alias support.
 *
 * @param values - Raw values to normalise (can be string or string[])
 * @param canonicalSet - Set of valid canonical values
 * @param aliases - Mapping of aliases to canonical values
 * @returns Array of canonical values (unknown values filtered out)
 */
function canonicaliseArrayValue(
  values: unknown,
  canonicalSet: Set<string>,
  aliases: Record<string, string>
): string[] {
  if (values === null || values === undefined) {
    return [];
  }

  // Convert single string to array
  const valueArray = isString(values) ? [values] : (values as string[]);

  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of valueArray) {
    const canonical = canonicaliseSingleValue(value, canonicalSet, aliases);
    if (canonical !== null && !seen.has(canonical)) {
      result.push(canonical);
      seen.add(canonical);
    }
  }

  return result;
}

/**
 * Canonicalises raw AI model output into validated, normalised attributes.
 *
 * This function:
 * 1. Validates the structure of the raw input
 * 2. Normalises all values to lowercase
 * 3. Maps aliases to canonical values
 * 4. Silently drops unrecognised values
 *
 * @param raw - Raw attributes from AI model response
 * @returns Canonicalisation result with validated attributes or error
 */
export function canonicaliseAttributes(raw: unknown): CanonicalisationResult {
  // Handle null/undefined input
  if (raw === null || raw === undefined) {
    return {
      valid: false,
      error: 'Attributes object is null or undefined',
    };
  }

  // Handle non-object input
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      valid: false,
      error: `Attributes must be an object, got ${Array.isArray(raw) ? 'array' : typeof raw}`,
    };
  }

  const rawAttrs = raw as RawAttributes;

  // Validate structure
  const validationError = validateAttributeStructure(rawAttrs);
  if (validationError) {
    return {
      valid: false,
      error: validationError,
    };
  }

  // Canonicalise each field
  const attributes: CanonicalisedAttributes = {
    type: canonicaliseSingleValue(
      rawAttrs.type as string | null | undefined,
      CANONICAL_TYPES,
      TYPE_ALIASES
    ),
    colour: canonicaliseArrayValue(rawAttrs.colour, CANONICAL_COLOURS, COLOUR_ALIASES),
    pattern: canonicaliseSingleValue(
      rawAttrs.pattern as string | null | undefined,
      CANONICAL_PATTERNS,
      PATTERN_ALIASES
    ),
    fabric: canonicaliseSingleValue(
      rawAttrs.fabric as string | null | undefined,
      CANONICAL_FABRICS,
      FABRIC_ALIASES
    ),
    season: canonicaliseArrayValue(rawAttrs.season, CANONICAL_SEASONS, SEASON_ALIASES),
    fit: canonicaliseSingleValue(
      rawAttrs.fit as string | null | undefined,
      CANONICAL_FITS,
      FIT_ALIASES
    ),
  };

  return {
    valid: true,
    attributes,
  };
}

/**
 * Checks if canonicalised attributes contain any useful data.
 *
 * Returns true if at least one field has a non-null/non-empty value.
 * Useful for deciding whether to update the database.
 *
 * @param attributes - Canonicalised attributes to check
 * @returns true if any field has data
 */
export function hasAnyAttributes(attributes: CanonicalisedAttributes): boolean {
  return (
    attributes.type !== null ||
    attributes.colour.length > 0 ||
    attributes.pattern !== null ||
    attributes.fabric !== null ||
    attributes.season.length > 0 ||
    attributes.fit !== null
  );
}
