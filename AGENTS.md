# Project guidance

## Architecture

- The application entry point is `src/app.ts`; it schedules work and coordinates fetching, persistence, and posting.
- `src/functions/wikipedia.ts` parses the Wikipedia On This Day feed. `src/functions/bluesky.ts` prepares and publishes posts. `src/functions/utils.ts` handles JSON persistence and logging.
- Shared models, interfaces, and enums live in `src/classes/` and `src/utils/`.

## Development

- Keep application code in TypeScript under `src/` and follow the existing module and formatting conventions.
- Use `npm run build` to type-check and compile, and `npm run lint` to lint `src/`.
- There is no automated test suite configured; `npm test` is a placeholder that exits with an error.
- Update `README.md` when changing setup, environment variables, scheduling, or runtime behavior.
- Do not commit credentials or runtime data. Keep secrets in the ignored `.env` file and preserve the existing JSON data formats.
