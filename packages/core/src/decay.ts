/**
 * Memory importance decay module.
 *
 * Computes effective confidence for observations at read time.
 * This is a pure function — no database handle, no side effects.
 *
 * DECAY-01: Observation importance decays based on age and reinforcement.
 * DECAY-02: Computation is pure / read-time only — no write-back to DB.
 */

/** Decay constant: confidence halves after ~23 days (ln(2)/0.03 ≈ 23.1). */
const LAMBDA = 0.03;

/** Each reinforcement adds this much to effective confidence. */
const REINFORCEMENT_WEIGHT = 0.1;

/** Effective confidence never drops below this floor. */
const FLOOR = 0.1;

/** Default age in days when lastAccessedAt is null. */
const DEFAULT_DAYS_NOT_ACCESSED = 30;

/**
 * Entity types whose observations never decay.
 * These represent long-lived user preferences and architectural decisions.
 */
export const DECAY_EXEMPT_TYPES = new Set<string>([
  'preference',
  'constraint',
  'decision',
  'architecture',
]);

export interface ComputeEffectiveConfidenceParams {
  /** Base confidence stored in the database (0.0 – 1.0). */
  confidence: number;
  /** True if the observation is exempt from decay (type in DECAY_EXEMPT_TYPES). */
  decayExempt: boolean;
  /** ISO 8601 timestamp of last access, or null if never accessed. */
  lastAccessedAt: string | null;
  /** Number of times this observation has been reinforced. */
  reinforcementCount: number;
  /** Inject a custom "now" for deterministic testing. Defaults to new Date(). */
  now?: Date;
}

/**
 * Compute the effective confidence for an observation, accounting for
 * exponential time decay and reinforcement boost.
 *
 * Algorithm:
 *   1. If decayExempt, return base confidence unchanged.
 *   2. daysSinceAccess = days since lastAccessedAt (or DEFAULT_DAYS_NOT_ACCESSED if null).
 *   3. decayed = confidence * exp(-LAMBDA * daysSinceAccess)
 *   4. boost = reinforcementCount * REINFORCEMENT_WEIGHT
 *   5. effective = min(confidence, decayed + boost)  — boost cannot exceed base
 *   6. return max(FLOOR, effective)
 */
export function computeEffectiveConfidence(
  params: ComputeEffectiveConfidenceParams,
): number {
  const { confidence, decayExempt, lastAccessedAt, reinforcementCount, now } = params;

  if (decayExempt) {
    return confidence;
  }

  const currentTime = now ?? new Date();

  let daysSinceAccess: number;
  if (lastAccessedAt === null) {
    daysSinceAccess = DEFAULT_DAYS_NOT_ACCESSED;
  } else {
    const lastTime = new Date(lastAccessedAt).getTime();
    const msElapsed = currentTime.getTime() - lastTime;
    daysSinceAccess = msElapsed / (1000 * 60 * 60 * 24);
  }

  const decayed = confidence * Math.exp(-LAMBDA * daysSinceAccess);
  const boost = reinforcementCount * REINFORCEMENT_WEIGHT;
  const effective = Math.min(confidence, decayed + boost);

  return Math.max(FLOOR, effective);
}
