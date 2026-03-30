---
phase: 19-temporal-versioning-dedup-resolution
plan: "02"
subsystem: mcp-server
tags: [dedup, temporal, classification, sqlite-vec, integration-tests, entity-merge]

dependency_graph:
  requires:
    - phase: 19-01
      provides: [classifyObservation, retireObservation, selectObservationsByEntityForDedup, insertObservationTemporal, setEntityMergedInto, selectEntitiesByName]
  provides:
    - rememberEntity with dedup classification gating (NOOP skips write, UPDATE retires old observation)
    - recallKnowledge with as_of temporal parameter (point-in-time queries)
    - mergeEntities function with soft-delete via merged_into column
    - Integration tests for all three paths (NOOP, UPDATE, ADD, as_of, entity merge)
  affects: [api-server (entity merge endpoint), dashboard (merge UI)]

tech-stack:
  added: []
  patterns:
    - "Live Ollama affects dedup behavior in tests — mock embedText to disable semantic classification when testing non-dedup behavior"
    - "Pre-existing tests that store multiple observations of the same entity must mock embedText(null) to avoid Ollama classifying them as near-duplicates"

key-files:
  created: []
  modified:
    - packages/mcp-server/tests/server.test.ts

key-decisions:
  - "Pre-dedup tests that store multiple distinct observations need embedText mocked to null — live Ollama (nomic-embed-text) was classifying 'First observation'/'Second observation' as semantic near-duplicates (NOOP), preventing the second insert"
  - "tools.ts and statements.ts were already complete from Plan 01 — Plan 02 work was: verify integration, fix test regressions, confirm all dedup+temporal+merge tests pass"

patterns-established:
  - "Any test that stores >1 observation per entity and expects all to be present must mock embedText unless it explicitly tests dedup behavior"

requirements-completed: [TEMP-02, DEDUP-03]

duration: 4min
completed: 2026-03-27
---

# Phase 19 Plan 02: Dedup Integration, Temporal Recall, Entity Merge Summary

**rememberEntity gated by dedup classification, recallKnowledge with as_of point-in-time filtering, and mergeEntities soft-delete — all wired and tested with 76 passing tests**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-27T21:42:00Z
- **Completed:** 2026-03-27T21:46:00Z
- **Tasks:** 2 (Task 1 already complete in Plan 01; Task 2 tests already written, fixed regressions)
- **Files modified:** 1

## Accomplishments

- Confirmed `rememberEntity` dedup gating already wired: NOOP skips write, UPDATE retires old observation, ADD inserts with `valid_from`
- Confirmed `recallKnowledge` temporal `as_of` parameter wired: point-in-time filtering uses `valid_from`/`valid_until`, default recall excludes retired observations
- Confirmed `mergeEntities` soft-delete wired: moves observations/relationships, sets `merged_into`, does NOT delete source entity
- Fixed 2 pre-dedup test regressions caused by live Ollama classifying similar-content observations as NOOP
- All 76 mcp-server tests pass with zero regressions

## Task Commits

1. **Task 1 + Task 2: Wire dedup, temporal recall, entity merge (from Plan 01)** - already committed
2. **Fix: Mock embedText in pre-dedup tests** - `75ac376` (fix)

## Files Created/Modified

- `packages/mcp-server/tests/server.test.ts` — Added 6 new integration test describe blocks (dedup NOOP/UPDATE/ADD, temporal as_of, entity merge), fixed 2 pre-existing tests that assumed no Ollama classification

## Decisions Made

- Pre-existing tests that store multiple distinct observations for the same entity must mock `embedText` to `null` when they are NOT testing dedup — live Ollama with `nomic-embed-text` running locally was classifying "First observation" and "Second observation" as semantic near-duplicates, causing NOOP and preventing the second insert
- `tools.ts` (`rememberEntity`, `recallKnowledge`, `mergeEntities`) and `statements.ts` (`setEntityMergedInto`, `selectEntitiesByName`) were already complete from Plan 01's broader scope — Plan 02 scope was exclusively test verification and regression fixing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed 2 pre-dedup tests broken by live Ollama semantic classification**

- **Found during:** Task 2 (running integration tests)
- **Issue:** "reuses existing entity" and "forgets single observation by ID" tests each stored two observations with similar content ("First observation" / "Second observation"). With live Ollama running (`nomic-embed-text`), dedup classified these as NOOP — second observation was skipped, causing both tests to fail with "expected 2 but got 1"
- **Fix:** Added `vi.spyOn(embedClient, 'embedText').mockResolvedValue(null)` to both tests, falling back to exact string match (which correctly returns ADD for different strings)
- **Files modified:** `packages/mcp-server/tests/server.test.ts`
- **Verification:** All 76 tests pass including both fixed tests and all 6 new dedup/temporal/merge tests
- **Committed in:** `75ac376`

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Necessary correctness fix. Dedup now works with live Ollama; tests that don't care about dedup are isolated from it.

## Issues Encountered

- Plan 01 had already implemented all of Plan 02's `tools.ts` and `statements.ts` changes — the integration was already wired. Plan 02 scope collapsed to: run tests, identify regressions, fix them.

## Known Stubs

None.

## Next Phase Readiness

- Phase 19 complete: temporal versioning, dedup classification, entity merge all wired and tested
- The dedup system is live — any agent calling `remember` now gets semantic dedup against existing observations
- Temporal `recall` with `as_of` enables point-in-time knowledge queries

---
*Phase: 19-temporal-versioning-dedup-resolution*
*Completed: 2026-03-27*
