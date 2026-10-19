# MLBB Showcase — OpenCode Prompt System

This package converts the approved MLBB Showcase specification into small, focused implementation prompts that can be used across separate AI sessions.

## Quick start

1. Extract this folder into the root of your website repository (or copy its files into the repository).
2. Open the repository in OpenCode.
3. Give OpenCode `MASTER_PROMPT.md` and ask it to initialize the project operating files. Do not ask it to implement every phase at once.
4. Start with `prompts/01-01-project-audit-and-bootstrap.md`.
5. After each task, review the code and test results, then commit when appropriate.
6. For any other AI session, provide `MASTER_PROMPT.md`, the chosen task prompt, and the current `PROJECT_STATE.md` (or ask the agent to read them from the repository if it has repository access).

## Files

- `MASTER_PROMPT.md` — persistent operating protocol for every AI agent.
- `PROJECT_STATE.md` — shared progress ledger; update it after every task.
- `ARCHITECTURE_DECISIONS.md` — approved decisions and change-control rules.
- `prompts/` — short, individually callable implementation prompts.
- `PROMPT_INDEX.md` — task list, phase grouping, and dependencies.

## Important behavior

Prompts are independently understandable, not permission to ignore dependencies. An agent may inspect or implement a task in a separate session, but must stop and report blockers when required foundations are missing. Never mark a task complete merely because files were written; record tests and evidence.

The tracker is committed to the repository, so state survives separate chats and machines. Chat memory is not the source of truth.
