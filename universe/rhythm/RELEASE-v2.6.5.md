# Rhythm v2.6.5 — release candidate

Base: ad97eea582366ecc23ac714af56710781a71b471 (PR #25 merged). UI source: `test/rhythm-v2.7/`, user mobile-tested v2.7.0-audio-result-test-1. Target: `universe/rhythm/` only. Test source and shared SDK untouched.

Preserves production session, official feature switch, score submission, rewards, collection, player storage, and fallback behavior. No test guard/chooser/storage namespace is copied. Original server-facing gameVersion intentionally unchanged pending backend compatibility review; UI shows v2.6.5. Assets reuse exact existing Git objects. New scripts/CSS use versioned URLs. Countdown cancellation is the only changed gameplay function; integrity test reverses only explicit approved edits before applying unchanged historical hashes.

**Draft / not ready to merge:** static source comparisons only. Full Node integrity suite, mocked official and fallback browser flows, mobile QA, and backend game-version compatibility review must pass before merge. The old build_prototype.py is a historical generator; do not regenerate the release page without reapplying this migration. MV synchronization and tutorial not included.
