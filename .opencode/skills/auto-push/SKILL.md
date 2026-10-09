---
name: auto-push
description: Automatically commit and push the Danger Noodle project to GitHub after every successful build, deploy, or completed milestone. Use whenever a build/finish step succeeds, when the user says push/save my progress/commit, or after completing any milestone in the build order.
---

# Auto-push to GitHub

After every successful build or completed milestone, commit the working tree and
push it to GitHub. This is the standing workflow for the Danger Noodle project.

Remote: `origin` -> `https://github.com/hauzzor/danger-noodle.git`, branch `main`.

## When to run

- A milestone from the build order is finished.
- `npm run build` (or `npm run typecheck`) succeeds and the change is complete.
- The user asks to push, commit, save progress, or sync.

Do NOT push when the build is failing, mid-task, or when the user explicitly
says not to.

## Procedure

1. Verify the build is green:
   - `npm.cmd run build` (on Windows PowerShell, call `npm.cmd`, not `npm`).
2. Inspect what changed:
   - `git status`
   - `git diff --stat`
3. Stage intended changes only (never secrets, never `node_modules/` or `dist/`):
   - `git add -A`
4. Commit with a concise message matching the repo style (imperative, e.g.
   `add verlet solver`, `milestone 3: world generator`):
   - `git commit -m "<message>"`
5. Push to `origin` (Git Credential Manager handles auth; a browser prompt may
   appear on first push):
   - `git push origin main`

Every push to `main` triggers the `.github/workflows/deploy.yml` workflow, which
rebuilds and republishes the game at https://hauzzor.github.io/danger-noodle/ .

## Notes

- Windows shell is PowerShell 5.1: call `npm.cmd` / `git` directly; do not rely
  on `&&` (use `;` and `if ($?) { ... }`).
- Never commit `node_modules/`, `dist/`, `.vite/`, or logs (see `.gitignore`).
- If the push is rejected, `git pull --rebase origin main` then push again.
- Report the resulting commit hash and the Pages URL after a successful push.
