export {
  DEFAULT_THRESHOLDS,
  hardVariant,
  IMAGE_LED,
  PHASH_MAX_DISTANCE,
  vetoReason,
  WEIGHTS,
  type Comparable,
  type MatchThresholds,
  type MatchWeights,
} from './rules.js';
export {
  attributeAgreement,
  decideMatch,
  exactKey,
  hammingDistance,
  score,
  titleSimilarity,
  titleTokens,
  type Candidate,
  type ExactKey,
  type MatchDecision,
  type MatchItem,
} from './decide.js';
export { newProduct, slugify, type NewProduct, type ProductSeed } from './canonical.js';
