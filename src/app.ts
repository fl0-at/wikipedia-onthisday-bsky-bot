import dotenv from 'dotenv';
import schedule from 'node-schedule';
import { LogLevel, ContentType } from './utils/enums';
import { loginToBluesky, sanitizeAndPostContent } from './functions/bluesky';
import { fetchOnThisDayArticle } from './functions/wikipedia';
import { checkIfContentAlreadyPostedForArticle, loadArticles, saveArticleWithoutContents, saveArticleContent, log } from './functions/utils';

// load environment variables
dotenv.config();

const DEBUG_MODE = process.env.DEBUG_MODE === 'true' || false;
const POST_ONCE_ONLY = process.env.POST_ONCE_ONLY === 'true' || false;

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
			log(LogLevel.INFO, 'Posting first content for article:', articleOfToday.id);
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
					log(LogLevel.INFO, 'Posting new content for article:', articleOfToday.id);
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

log(LogLevel.DEBUG, 'DEBUG_MODE is', DEBUG_MODE);

// schedule a job
if (DEBUG_MODE === true) {
	// schedule bot to run once per minute in debug mode
	
	log(LogLevel.INFO, 'Scheduling bot to run every 15 seconds...');
	schedule.scheduleJob('*/15 * * * * *', () => {
		log(LogLevel.INFO, 'Job has been triggered...');
		runBot();
	});
} else {
	// otherwise schedule bot to run every other hour
	if (!POST_ONCE_ONLY) {
		log(LogLevel.INFO, 'Scheduling bot to run every other hour...');
		schedule.scheduleJob('0 */2 * * *', () => {
			log(LogLevel.INFO, 'Job has been triggered...');
			runBot();
		});
	} else {
		log(LogLevel.INFO, 'Running bot once only...');
		runBot();
	}
}