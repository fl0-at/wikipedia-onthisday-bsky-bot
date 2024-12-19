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
  - defaults to `https://en.wikipedia.org/w/api.php?action=featuredfeed&feed=onthisday&feedformat=atom` if not set
- `WIKIPEDIA_MAIN_URL`
  - The wikipedia URL used for prefixing `/wiki/SomeArticle` URIs
  - defaults to `https://en.wikipedia.org` if not explicitly set
- `DB_PATH`
  - The path where you want to locally save the extracted HTML from the Atom feed as well as the content posted to Bluesky
  - defaults to `./database` if not explicitly set
- `ARTICLES_FILENAME`
  - The name of the file where the extracted articles from the Atom feed are stored
  - defaults to `articles.json` if not explicitly set
- `POSTINGS_FILENAME`
  - The name of the file where the content posted to Bluesky will be stored
  - defaults to `postings.json` if not explicitly set
- `POST_ONCE_ONLY`
  - if enabled, the bot will only run once and try to post to Bluesky
  - defaults to `false` if not explicitly set
  - _**NOTE:** if `DEBUG_MODE` is set to `true`, the debug mode overrides this setting!_
- `DEBUG_MODE`
  - if enabled, the app will not try logging in to Bluesky and just output the potential posts to the console
  - defaults to `false` if not explicitly set
- `LOG_LEVEL`
  - which logs to write to the console
  - Supported values: `TRACE`, `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`
  - defaults to `INFO` if not explicitly set