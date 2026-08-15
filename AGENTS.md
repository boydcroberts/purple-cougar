# Purple Cougar Agent Guidance

Read `CLAUDE.md` completely before changing this project. It is the detailed,
authoritative project instruction file; this file adds the durable deployment
facts most likely to be missed by a new agent.

## Production hosting

- Live URL: `https://boydcroberts.github.io/purple-cougar/`.
- GitHub Pages is the active host; Vercel is retired because the account reached
  its usage limit.
- Pushes to `main` deploy through `.github/workflows/deploy-pages.yml` after
  typechecking and tests pass.
- The Pages build command is `npm run build -- --mode github-pages`, which sets
  the required `/purple-cougar/` base path.
- Cloudflare Pages is the preferred future fallback. Netlify is compatible but
  less predictable for this asset-heavy game because its free plan is
  credit-metered.
- Do not claim local, uncommitted work is live. Verify the GitHub Actions run and
  the deployed HTML and primary asset responses after deployment changes.

Historical plans under `docs/superpowers/` may mention GitHub to Vercel. Those
records describe an earlier plan and do not override this current decision.
