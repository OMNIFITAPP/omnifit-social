# omnifit-social

The publishing queue for **@omnifit.world**. Public on purpose: Instagram can only
publish an image it can fetch from a public web address, and GitHub Actions minutes
are free on a public repository. Nothing private lives here.

- `queue.json` — what is scheduled. An item publishes only when it is `approved`,
  its `scheduledFor` has passed, and it sits on `main`.
- `assets/<post>/…png` — the artwork, served by GitHub Pages.
- `scripts/publish.mjs` — the publisher. No dependencies, no build step.
- `.github/workflows/publish.yml` — runs every 15 minutes once
  `SOCIAL_ENABLED` is `true`.

Artwork is produced in the private ecosystem repository, reviewed there, and copied
here only after Roei approves it. Merging to `main` is the approval gate.

Setup for the token and the account: `INSTAGRAM-RUNBOOK.md` in the ecosystem repo.
