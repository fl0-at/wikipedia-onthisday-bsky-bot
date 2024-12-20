import dotenv from 'dotenv';
import schedule from 'node-schedule';
import { LogLevel, ContentType } from './utils/enums';
import { loginToBluesky, sanitizeAndPostContent } from './functions/bluesky';
import { fetchOnThisDayArticle } from './functions/wikipedia';
import { checkIfContentAlreadyPostedForArticle, loadArticles, saveArticleWithoutContents, saveArticleContent, log, verifyCronNotation } from './functions/utils';

// load environment variables
dotenv.config();

const DEBUG_MODE = process.env.DEBUG_MODE === 'true' || false;
const POST_ONCE_ONLY = process.env.POST_ONCE_ONLY === 'true' || false;
const EARLIEST_START_HOUR = Number(process.env.EARLIEST_START_HOUR) || 6;
const LATEST_START_HOUR = Number(process.env.LATEST_START_HOUR) || 22;
const CRON_SCHEDULE = (verifyCronNotation(process.env.CRON_SCHEDULE)? process.env.CRON_SCHEDULE : '0 */2 * * *') || '0 */2 * * *';
const DEBUG_CRON_SCHEDULE = (verifyCronNotation(process.env.DEBUG_CRON_SCHEDULE)? process.env.DEBUG_CRON_SCHEDULE : '*/15 * * * * *') || '*/15 * * * * *';

/**
 * Main function that runs the bot
 * @returns {Promise<void>}
 */
async function runBot(): Promise<void> {
	try {
		log(LogLevel.INFO, 'Bot started...');
		log(LogLevel.DEBUG, 'Initializing agent...');
		if (!DEBUG_MODE) await loginToBluesky();

		log(LogLevel.DEBUG, 'Fetching Atom feed...');
		const articleOfToday = await fetchOnThisDayArticle();
		log(LogLevel.DEBUG, 'Loading already posted articles...');
		const postedArticles = await loadArticles();
		log(LogLevel.TRACE, 'Posted articles loaded:', postedArticles);
		// check if the article of the day is already in our DB
		if (!postedArticles || !JSON.stringify(postedArticles).includes(articleOfToday.id)) {
			log(LogLevel.TRACE, 'postedArticles:', JSON.stringify(postedArticles));
			log(LogLevel.TRACE, 'articleOfToday:', articleOfToday.toString());
			log(LogLevel.DEBUG, 'postedArticles.includes(articleOfToday):', JSON.stringify(postedArticles).includes(articleOfToday.id));
			// if not in DB yet, log info that we got a new article
			log(LogLevel.INFO, 'Processing new Article:', articleOfToday.id);

			// save article (without contents) to local file
			// we just need to create a bare entry first
			await saveArticleWithoutContents(articleOfToday);

			// initialize index at 0
			let firstRealContent = 0;
			let firstRealContentFound = false;
			for (const content of articleOfToday.contentList) {
				switch (content.type) {
					case ContentType.todayText:
						// if the content is of type "todayText"
						// save this text to our json file
						await saveArticleContent(articleOfToday, articleOfToday.contentList[firstRealContent]);
						// ...and increment our index value:
						firstRealContent++;
						break;
					default:
						firstRealContentFound = true;
						break;
				}
				// if we already found the first "real" content,
				// break the loop
				if (firstRealContentFound) break;
			}

			// no need to loop through article contents
			// just post the first entry since the article did not exist in our DB
			log(LogLevel.INFO, 'Preparing first postable content for article:', articleOfToday.id);
			log(LogLevel.TRACE, 'Article:', articleOfToday);

			// need to call function to sanitize post content
			// this function also takes care of posting to Bsky
			const postSuccessful = await sanitizeAndPostContent(articleOfToday, articleOfToday.contentList[firstRealContent]);

			// log failed posts to the console
			if (!postSuccessful) log(LogLevel.CRITICAL, 'Failed to post to Bluesky!!!');

		} else {
			// article of today was found in DB - need to check which content we can post		

			// loop through article contents
			let freshContentFound = false;
			for (const content of articleOfToday.contentList) {

				// check if content has been posted already
				const alreadyPosted = await checkIfContentAlreadyPostedForArticle(articleOfToday, content);

				if (!alreadyPosted && content.type != ContentType.todayText) {

					// new content, so post this
					log(LogLevel.INFO, 'Preparing new postable content for article:', articleOfToday.id);
					freshContentFound = true;

					// need to call function to sanitize post content
					// this function also takes care of posting to Bsky
					const postSuccessful = await sanitizeAndPostContent(articleOfToday, content);

					// log failed posts to the console
					if (!postSuccessful) log(LogLevel.CRITICAL, 'Failed to post to Bluesky!!!');

					// break the loop, because we want to post the rest of the content at a later time!
					break;
				}

				if (!alreadyPosted && content.type === ContentType.todayText) await saveArticleContent(articleOfToday, content);
			}

			// if all content of today has been posted, just log an info message			
			if (!freshContentFound) log(LogLevel.INFO, 'All content for article already posted:', articleOfToday.id);
		}
	} catch (error) {
		log(LogLevel.CRITICAL, 'Error running bot:', error);
	}
	log(LogLevel.INFO, 'Bot stopped...');
}

log(LogLevel.INFO, 'DEBUG_MODE is', DEBUG_MODE);
log(LogLevel.INFO, 'Bot is configured to run only from', (EARLIEST_START_HOUR<10?'0'+EARLIEST_START_HOUR:EARLIEST_START_HOUR)+':00', 'to', LATEST_START_HOUR+':00')
log(LogLevel.DEBUG, 'POST_ONCE_ONLY is', POST_ONCE_ONLY);
// schedule a job
if (DEBUG_MODE === true) {
	// schedule bot to run once per minute in debug mode
	log(LogLevel.INFO, 'Scheduling bot to run using the following DEBUG cron schedule:', DEBUG_CRON_SCHEDULE);
	schedule.scheduleJob(DEBUG_CRON_SCHEDULE, () => {
		log(LogLevel.DEBUG, 'Current time:', new Date().toLocaleString());
		log(LogLevel.DEBUG, 'Current hour:', new Date().getHours());
		log(LogLevel.DEBUG, 'EARLIEST_START_HOUR:', EARLIEST_START_HOUR);
		log(LogLevel.DEBUG, 'LATEST_START_HOUR:', LATEST_START_HOUR);
		log(LogLevel.DEBUG, 'Is too early?', new Date().getHours()<EARLIEST_START_HOUR);
		log(LogLevel.DEBUG, 'Is too late?', new Date().getHours()>LATEST_START_HOUR);
		if (new Date().getHours() < EARLIEST_START_HOUR || new Date().getHours() > LATEST_START_HOUR) {
			log(LogLevel.INFO, 'Current time is outside of the allowed range - Bot will not run...');
			return;
		}
		log(LogLevel.DEBUG, 'Job has been triggered...');
		runBot();
		log(LogLevel.DEBUG, 'Job completed...');
	});
} else {
	// otherwise schedule bot to run every other hour
	if (!POST_ONCE_ONLY) {
		log(LogLevel.INFO, 'Scheduling bot using the following cron schedule:', CRON_SCHEDULE);
		schedule.scheduleJob(CRON_SCHEDULE, () => {
			if (new Date().getHours() < EARLIEST_START_HOUR || new Date().getHours() > LATEST_START_HOUR) {
				log(LogLevel.INFO, 'Current time is outside of the allowed range - Bot will not run...');
				return;
			}
			log(LogLevel.DEBUG, 'Job has been triggered...');
			runBot();
			log(LogLevel.DEBUG, 'Job completed...');
		});
	} else {
		log(LogLevel.INFO, 'Running bot once only...');
		runBot();
	}
}