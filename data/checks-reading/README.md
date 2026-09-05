# Checks reading

A dated reading of every file under `tools/test/`, classified to one schema by
a fan-out of readers on 2026-09-05: which kind of oracle each test uses
(specified, derived, pseudo, consistency, golden, implicit), its scope, the two
objects it compares, what a failure blocks, and one plausible bug it would not
catch. `2026-09-05-gaps.csv` is the companion: every code file under `lib/`,
`tools/build/` and `scripts/`, with the count of test files naming it.

A reading, not a registry: it records what readers saw on one day and is not
restamped, which is why it lives under `data/` beside the doc-growth payload
rather than under `docs/` beside `tests.csv`. The registry stays the one
authored account of what each test protects; this is the measurement that
informs which columns that registry should grow. The reader prompt and the
same-day reading of the home repository's checks are in home at
`projects/budget-drs/data/design/probes/2026-09-05-checks-reading/`.
