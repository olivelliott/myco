---
phase: 21-memory-importance-decay
plan: 01
subsystem: database
tags: [decay, confidence, memory, pure-function, vitest]

requires:
  - phase: 18-schema-foundation
    provides: Observation type with decay_exempt, reinforcement_count, last_accessed_at fields
provides:
  - computeEffectiveConfidence pure function (LAMBDA=0.03, FLOOR=0.1, reinforcement boost)
  - DECAY_EXEMPT_TYPES Set (preference, constraint, decision, architecture)
  - Exported from @myco/core for use in Plans 02+
affects: [22-auto-entity-extraction, recall integration in mcp-server]

tech-stack:
  added: []
  patterns:
    - "Pure function pattern: decay computed at read time, no DB writes"
    - "Injectable now parameter for deterministic time-based test assertions"

key-files:
  created:
    - packages/core/src/decay.ts
    - packages/mcp-server/tests/decay.test.ts
  modified:
    - packages/core/src/index.ts

key-decisions:
  - "computeEffectiveConfidence is pure (no DB handle) — confirmed DECAY-02 design"
  - "LAMBDA=0.03 means half-life ~23 days (ln2/0.03); floor=0.1 prevents complete decay"
  - "Reinforcement boost capped at base confidence via Math.min(confidence, decayed + boost)"
  - "null lastAccessedAt defaults to 30 days — conservative decay for never-accessed observations"

patterns-established:
  - "Decay constants (LAMBDA, FLOOR, REINFORCEMENT_WEIGHT) named at module top, not inline magic numbers"
  - "Injectable now?: Date param pattern for deterministic test assertions on time-dependent functions"

requirements-completed: [DECAY-01, DECAY-02]

duration: 2min
completed: 2026-03-27
---

# Phase 21 Plan 01: Memory Importance Decay Summary

**Pure `computeEffectiveConfidence` function with exponential decay (LAMBDA=0.03, FLOOR=0.1), reinforcement boost, and 10-test suite — exported from @myco/core**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-27T22:54:31Z
- **Completed:** 2026-03-27T22:56:13Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created `packages/core/src/decay.ts` with pure `computeEffectiveConfidence` function and `DECAY_EXEMPT_TYPES` Set
- 10 Vitest tests covering: exempt bypass, exponential decay, reinforcement boost and cap, floor enforcement, null lastAccessedAt, injectable now parameter, DECAY_EXEMPT_TYPES membership
- Exported both symbols from `@myco/core` for downstream use in Plan 02 (recall integration)

## Task Commits

Each task was committed atomically:

1. **Task 1+2: Create decay.ts pure function, tests, and re-export from @myco/core** - `42456d2` (feat)

_Note: Tasks 1 and 2 were committed together since Task 2 (re-export) was required to make the GREEN tests pass — they form a single logical atomic unit._

## Files Created/Modified
- `packages/core/src/decay.ts` - Pure computeEffectiveConfidence function with DECAY_EXEMPT_TYPES constant
- `packages/mcp-server/tests/decay.test.ts` - 10 unit tests with injectable now parameter
- `packages/core/src/index.ts` - Added re-export of computeEffectiveConfidence and DECAY_EXEMPT_TYPES from ./decay.js

## Decisions Made
- Confirmed DECAY-02: pure function, no DB handle, no write-back — computation happens at read time only
- LAMBDA=0.03 gives half-life ~23.1 days, floor=0.1 ensures observations never fully disappear
- Reinforcement boost cap enforced via `Math.min(confidence, decayed + boost)` so boost cannot inflate above base confidence

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `computeEffectiveConfidence` is ready for Plan 02 integration into recall/query result scoring
- `DECAY_EXEMPT_TYPES` available for use when `remember` stores observations — entity type can set decay_exempt flag
- No blockers for Plan 02

## Self-Check: PASSED

All created files verified present on disk. Task commit `42456d2` confirmed in git log.

---
*Phase: 21-memory-importance-decay*
*Completed: 2026-03-27*
