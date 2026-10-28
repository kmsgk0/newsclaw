---
name: newsclaw-release
description: Execute an authorized NewsClaw release or recovery using its documented build, migration, health and backup procedures. Use for an actual deployment, rollback or restore task.
---

# NewsClaw release

Read repository `AGENTS.md`, `docs/standards/operations.md`, and the current README deployment instructions. Inspect the exact target environment, release version and migration before mutation. A request for a plan only authorizes planning.

1. Confirm the target version and working tree, required checks, runtime configuration and persistent data locations. Never print secret values.
2. Build the documented artifact with its version identifier. Retain the previous runnable artifact and the backup required by the migration.
3. Apply the documented migration, start the target release, inspect health and verify the affected user path. Do not invent commands when the runtime has not been implemented.
4. On failure, inspect the error and migration state. Restore only the affected resources within the authorized recovery scope; destructive data restoration requires explicit authorization. Do not repeatedly deploy while the cause is unknown.
5. Verify recovered service behavior and data consistency, then report version, checks, actual duration and any incomplete work. A stored backup alone does not prove recoverability.

Keep credentials, private logs and temporary captures out of Git. Record only project-relevant release results in the project's documented destination when that write is authorized.
