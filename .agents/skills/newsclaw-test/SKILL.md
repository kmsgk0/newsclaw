---
name: newsclaw-test
description: Add or update NewsClaw tests from approved OpenSpec scenarios, including ownership, source provenance, streaming results and background task behavior. Use when implementing an authorized capability or fixing a verified defect.
---

# NewsClaw tests

Read the repository `AGENTS.md`, the relevant requirement and all its scenarios, and `docs/standards/testing.md`. For interfaces also read `docs/standards/backend.md`; for private resources read `docs/standards/security.md`.

1. Inspect the affected implementation and existing test entry points. Identify the requirement IDs being changed and select the smallest suitable test layer.
2. Derive normal, failure and boundary expectations from the scenarios. Verify output and relevant stored state; for rejected writes, verify the forbidden side effect did not occur.
3. Reuse the project's database isolation and deterministic model, source, tool and clock substitutes. Keep fixtures within the tested account and content scope.
4. For streaming behavior check completion and failure events separately. For background work repeat the same business operation and inspect actual duplicate prevention. For citations check the returned source against the retrieved evidence.
5. Run the affected tests and required checks through real project commands. If the implementation or command does not yet exist, report that limitation and leave the corresponding task unchecked.
6. When regression strength is uncertain, temporarily break the affected decision, confirm the relevant test fails, then restore it and rerun. Avoid implementation-shaped assertions or unrelated coverage expansion.

Report the requirement IDs, observed results and remaining gaps. Mark a task complete only after the behavior and its required checks pass. Do not run paid model calls unless the task authorizes real-service verification.
