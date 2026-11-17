# Rhythm v2.6.5-release-fix-1
Base: PR #25 approved v2.7.0-audio-result-test-1; integrated main 64c698333226319bb42c39d725fd5dd6149f7626 (PR #27). Target universe/rhythm only.

- UI version v2.6.5; server gameVersion rhythm-v2.6.5+universe-v0.3.1. Backend validates format and session/submission equality.
- Official NEW RECORD is driven by accepted server board.improved for exact song/difficulty, not local history. Pending/rejected/queued results do not congratulate. Fallback records use a new song/difficulty local key; legacy ambiguous keys are retained but not reused. Late results from an older round/player cannot change current record presentation.
- Refresh player and best score after official initialization; clear stale identity card on reset.
- build_prototype.py now applies exact reviewed release overlay; fail closed on changed upstream anchors.
- No changes to approved art, audio, gameplay scoring, shared SDK, test page, or backend.
- Previous candidate b57c5f9f9f0e536eab36f19aa682ad7f8cab210a: 78/78 Node tests and official/fallback Chromium E2E passed in run 44149978395. New candidate requires fresh verification, generator comparison and targeted record cases. Live MV, real phone, full note-by-note play and live server are not covered by that controlled-score test.
- Draft; no merge/deployment until review.
