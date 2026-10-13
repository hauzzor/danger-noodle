# AGENTS.md

## Command batching (fewer approval prompts)

The user runs opencode through a console that asks permission for each shell
command. Minimise the number of separate shell invocations:

- **Batch independent commands into one call.** Chain with `;` (and
  `cmd1; if ($?) { cmd2 }` when order matters). One invocation per logical step,
  not one per command.
- **Combine build + verify + commit + push** into a single invocation when they
  are the final step, e.g.
  `npm.cmd run build; if ($?) { git add -A; git commit -m "..."; git push origin main }`.
- **Prefer one scratch script over many probes.** When a task needs several
  checks, write one script and run it once instead of issuing many one-off
  commands.
- **Use non-shell tools first** (`read`/`glob`/`grep`/`edit`) to gather context
  and make edits, so shell calls are reserved for things only the shell can do.
- **Plan ahead** so the whole build can be executed in as few calls as possible.

## Environment notes (Windows / PowerShell 5.1)

- `npm.ps1` is blocked by execution policy: call `npm.cmd` directly, e.g.
  `& "C:\Program Files\nodejs\npm.cmd" run build`.
- No `&&` in PowerShell 5.1; use `;` / `if ($?) { ... }`.
- Some tools surface native stderr output as a PowerShell error block even on
  success (e.g. `git push`); check the actual exit/result, not the red text.

## Project

- Build/typecheck: `npm.cmd run build` (runs `tsc && vite build`); typecheck only:
  `npm.cmd run typecheck`.
- There is no test framework; verify behaviour with a small headless script
  bundled via `node_modules\.bin\rolldown.cmd <file.ts> -o <out.cjs> -f cjs
  --platform node` then run with `node`, and delete the scratch files afterwards.
- Follow the `auto-push` skill: after a green build, commit and push to `origin
  main` (Pages redeploys at https://hauzzor.github.io/danger-noodle/).
