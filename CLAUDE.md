# Working on this repository

- Develop on the `main` branch and push to `main` (`git push -u origin main`). Do not create feature branches unless asked.
- Before committing: `npx tsc --noEmit -p .` and `npx eslint src --quiet` must pass; run the related tests (`node tests/run.mjs <filter>` after `npm run build`, see README → Automated tests).
- Never commit `.env*` files or secrets (AUTH_SECRET).
