# wikipedia-onthisday-bsky-bot
A Bluesky bot that posts the "on this day" articles from Wikipedia on Bluesky

## Environment variables
`BLUESKY_HANDLE` => The handle of your Bluesky Bot  
`BLUESKY_PASSWORD` => The password of your Bluesky Bot  
`RSS_FEED_URL` => The feed URL of the Atom/RSS Feed you want to parse  
`DEBUG_MODE` => if enabled, the app will not try logging in to Bluesky and just output the potential posts to the console  
`LOG_LEVEL` => which logs to write to the console - Supported values: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`  
