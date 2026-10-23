# GitHub issue progress bars

The project roadmap [#41](https://github.com/pdomoney/team-manager/issues/41) and its P00–P10 phase issues (#42–#52) each display a progress bar, **% complete**, and **% remaining** at the top.

## What the percentages mean

Progress counts explicitly registered deliverable checkpoints and three phase acceptance gates:
1. One checkpoint per **planned PR listed in** `config/issue-progress.json` (complete when the PR is merged).
2. Manual Safari/mobile representative user-journey acceptance checkbox checked in the phase issue.
3. Product-owner explicit phase acceptance checkbox checked in the phase issue.
4. Phase issue closed as **completed** (never as `not_planned`).

For example, P06 tracks PR69–PR76 plus those three gates: eight merged PR checkpoints out of eleven = **73% complete, 27% remaining**. This number is **not a time estimate, code coverage value or independent credential/access guarantee**. An unplanned phase displays 0% until scoped. When an issue closes as completed it reads 100%. Roadmap #41 percentage counts formally accepted, closed phases (currently 6/11).

## How updates work

The `Issue Progress` GitHub Actions workflow uses a limited repository token (`issues:write`, `pull-requests:read`), always checks out `main`, and runs after a **merged PR** or when a phase issue is closed/reopened. `workflow_dispatch` can also refresh it manually after updating acceptance checkboxes. It uses no credentials to access team data, runs no external service and never checks out code from a PR head.

The updater only modifies content within its named markers:

- `team-manager-phase-progress` in the phase issues.
- `team-manager-roadmap-progress` in #41.

Everything outside these blocks—including the human-maintained acceptance checklist, evidence log and phase index—must be preserved. Re-runs without changes do not write to GitHub, to avoid workflow loops and audit noise.

## Registering future work

Before P07/P08/P09/P10 implementation begins, define the scoped PR checkpoints for the phase and add the expected PR numbers to `config/issue-progress.json` through a reviewed commit/PR. Add/remove milestones only when the product owner approves scope changes. **Do not treat the number of unplanned PRs as the denominator**; doing so creates misleading percentages.

When accepted, manually record Safari/user-journey and phase-owner approval in the phase's required checklist; then close the issue as completed and check its box in #41. The progress updater will reflect closure automatically.

For existing/current platform boundaries, the P00–P10 tracker never represents production backend tenancy, individual login or Supabase migration. Those remain separate post-P10 decisions.
