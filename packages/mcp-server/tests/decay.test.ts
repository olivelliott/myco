import { describe, it, expect } from 'vitest';
import { computeEffectiveConfidence, DECAY_EXEMPT_TYPES } from '@myco/core';

describe('computeEffectiveConfidence', () => {
  // Fixed "now" for deterministic assertions: 2026-01-31T00:00:00Z
  const NOW = new Date('2026-01-31T00:00:00Z');

  // Helper: ISO string N days before NOW
  function daysAgo(n: number): string {
    const d = new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
    return d.toISOString();
  }

  it('Test 1: decay-exempt entity returns base confidence unchanged', () => {
    const result = computeEffectiveConfidence({
      confidence: 0.9,
      decayExempt: true,
      lastAccessedAt: daysAgo(60),
      reinforcementCount: 0,
      now: NOW,
    });
    expect(result).toBe(0.9);
  });

  it('Test 2: recently accessed non-exempt entity (0 days ago) returns approximately base confidence', () => {
    const result = computeEffectiveConfidence({
      confidence: 0.8,
      decayExempt: false,
      lastAccessedAt: daysAgo(0),
      reinforcementCount: 0,
      now: NOW,
    });
    // exp(-0.03 * 0) = 1.0, so effective = 0.8
    expect(result).toBeCloseTo(0.8, 4);
  });

  it('Test 3: observation not accessed in 23 days decays to roughly half (lambda=0.03)', () => {
    // exp(-0.03 * 23) = exp(-0.69) ≈ 0.5016
    // effective = 1.0 * 0.5016 ≈ 0.5016
    const result = computeEffectiveConfidence({
      confidence: 1.0,
      decayExempt: false,
      lastAccessedAt: daysAgo(23),
      reinforcementCount: 0,
      now: NOW,
    });
    expect(result).toBeCloseTo(1.0 * Math.exp(-0.03 * 23), 4);
  });

  it('Test 4: observation not accessed in 30 days decays significantly (confidence=1.0 -> ~0.407)', () => {
    // exp(-0.03 * 30) = exp(-0.9) ≈ 0.4066
    const result = computeEffectiveConfidence({
      confidence: 1.0,
      decayExempt: false,
      lastAccessedAt: daysAgo(30),
      reinforcementCount: 0,
      now: NOW,
    });
    expect(result).toBeCloseTo(Math.exp(-0.03 * 30), 4);
  });

  it('Test 5: reinforcement_count=5 boosts effective confidence but capped at base confidence', () => {
    // confidence=0.5, 30 days: decayed = 0.5 * exp(-0.9) ≈ 0.2033
    // boost = 5 * 0.1 = 0.5
    // effective = min(0.5, 0.2033 + 0.5) = min(0.5, 0.7033) = 0.5
    const result = computeEffectiveConfidence({
      confidence: 0.5,
      decayExempt: false,
      lastAccessedAt: daysAgo(30),
      reinforcementCount: 5,
      now: NOW,
    });
    expect(result).toBe(0.5); // capped at base confidence
  });

  it('Test 6: floor of 0.1 is enforced even after extreme decay', () => {
    // confidence=0.2, 365 days: decayed = 0.2 * exp(-0.03 * 365) ≈ 0.2 * exp(-10.95) ≈ negligible
    const result = computeEffectiveConfidence({
      confidence: 0.2,
      decayExempt: false,
      lastAccessedAt: daysAgo(365),
      reinforcementCount: 0,
      now: NOW,
    });
    expect(result).toBe(0.1); // floor
  });

  it('Test 7: null lastAccessedAt treated as 30 days old', () => {
    const resultNull = computeEffectiveConfidence({
      confidence: 1.0,
      decayExempt: false,
      lastAccessedAt: null,
      reinforcementCount: 0,
      now: NOW,
    });
    const resultExplicit30 = computeEffectiveConfidence({
      confidence: 1.0,
      decayExempt: false,
      lastAccessedAt: daysAgo(30),
      reinforcementCount: 0,
      now: NOW,
    });
    expect(resultNull).toBeCloseTo(resultExplicit30, 10);
  });

  it('Test 8: injectable now parameter works correctly for deterministic testing', () => {
    const customNow = new Date('2026-06-15T12:00:00Z');
    const lastAccessed = new Date('2026-06-01T12:00:00Z').toISOString(); // 14 days before customNow
    const result = computeEffectiveConfidence({
      confidence: 1.0,
      decayExempt: false,
      lastAccessedAt: lastAccessed,
      reinforcementCount: 0,
      now: customNow,
    });
    expect(result).toBeCloseTo(Math.exp(-0.03 * 14), 4);
  });

  it('Test 9: DECAY_EXEMPT_TYPES contains exactly preference, constraint, decision, architecture', () => {
    expect(DECAY_EXEMPT_TYPES).toBeInstanceOf(Set);
    expect(DECAY_EXEMPT_TYPES.has('preference')).toBe(true);
    expect(DECAY_EXEMPT_TYPES.has('constraint')).toBe(true);
    expect(DECAY_EXEMPT_TYPES.has('decision')).toBe(true);
    expect(DECAY_EXEMPT_TYPES.has('architecture')).toBe(true);
    expect(DECAY_EXEMPT_TYPES.size).toBe(4);
  });

  it('Test 10: reinforcement with partial boost stays below base confidence cap', () => {
    // confidence=0.8, 10 days: decayed = 0.8 * exp(-0.3) ≈ 0.5924
    // boost = 1 * 0.1 = 0.1
    // effective = min(0.8, 0.5924 + 0.1) = min(0.8, 0.6924) = 0.6924
    const result = computeEffectiveConfidence({
      confidence: 0.8,
      decayExempt: false,
      lastAccessedAt: daysAgo(10),
      reinforcementCount: 1,
      now: NOW,
    });
    const decayed = 0.8 * Math.exp(-0.03 * 10);
    const boost = 1 * 0.1;
    const expected = Math.min(0.8, decayed + boost);
    expect(result).toBeCloseTo(expected, 4);
  });
});
