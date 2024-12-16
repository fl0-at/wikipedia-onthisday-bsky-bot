# wikipedia-onthisday-bsky-bot
A Bluesky bot that posts the "on this day" articles from Wikipedia on Bluesky

## Environment variables
- `BLUESKY_HANDLE`
  - The handle of your Bluesky Bot
- `BLUESKY_PASSWORD`
  - The password of your Bluesky Bot
- `PDS_URL`
  - The PDS your bot resides on
  - defaults to `https://bsky.social` if not explicitly set
- `RSS_FEED_URL`
  - The feed URL of the Atom/RSS Feed you want to parse
- `WIKIPEDIA_MAIN_URL`
  - The wikipedia URL used for prefixing `/wiki/SomeArticle` URIs
  - defaults to `https://en.wikipedia.org` if not explicitly set
- `DEBUG_MODE`
  - if enabled, the app will not try logging in to Bluesky and just output the potential posts to the console
  - defaults to `false` if not explicitly set
- `LOG_LEVEL`
  - which logs to write to the console
  - Supported values: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`
  - defaults to `INFO` if not explicitly set