import dotenv from 'dotenv';
import schedule from 'node-schedule';
import { LogLevel } from './utils/enums';
import { loginToBluesky, postToBluesky } from './functions/bluesky';
import { fetchOnThisDayArticle } from './functions/wikipedia';
import { checkIfContentAlreadyPostedForArticle, loadPostedArticles, savePostedArticleWithoutContents, savePostedArticleContent, log } from './functions/utils';

// load environment variables
dotenv.config();

const DEBUG_MODE = process.env.DEBUG_MODE === 'true' || false;

// main functionality
async function runBot() {
	try {
		log(LogLevel.INFO, 'Bot started...');
		if( !DEBUG_MODE ) await loginToBluesky();

		log(LogLevel.DEBUG, 'Fetching Atom feed...');
		const articleOfToday = await fetchOnThisDayArticle();
		log(LogLevel.DEBUG, 'Loading already posted articles...');
		const postedArticles = await loadPostedArticles();
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
			await savePostedArticleWithoutContents(articleOfToday);

			/********************************************************\
			** TO DO: 												**
			** ---------------------------------------------------- **
			** check if first content is of ContentType "todayText"	**
			** => if yes, skip it and fetch next content			**
			** ==> we want to avoid posting content with the "just" ** 
			** ==> todayText and potentially "condense" all the 	**
			** ==> anniversaries into one posting, prefixed by the	**
			** ==> "todayText", i.e. like this:						**
			** ==> "On this day, December 15th, ..."				**
			** ---------------------------------------------------- **
			\********************************************************/

			// no need to loop through article contents
			// just post the first entry since the article did not exist in our DB
			log(LogLevel.INFO, 'Posting first content for article:', articleOfToday.id);
			log(LogLevel.TRACE, 'Article:', articleOfToday);
			
			// post the article contents to Bluesky			
			log(LogLevel.TRACE, 'Content List:', articleOfToday.contentList);
			log(LogLevel.DEBUG, 'Content to be posted:', articleOfToday.contentList[0].value);
			await postToBluesky(articleOfToday.contentList[0].value);
			log(LogLevel.TRACE, 'Content posted:', articleOfToday.contentList[0].value);

			// save posted content to article
			await savePostedArticleContent(articleOfToday, articleOfToday.contentList[0]);

		} else {
			// article of today was found in DB - need to check which content we can post		
			
			// loop through article contents
			let freshContentFound = false;
			for (const content of articleOfToday.contentList) {
				
				// check if content has been posted already
				const alreadyPosted = await checkIfContentAlreadyPostedForArticle(articleOfToday, content);
								
				if (!alreadyPosted) {
					
					// new content, so post this
					log(LogLevel.INFO, 'Posting new content for article:', articleOfToday.id);
					freshContentFound = true;
					
					// post the article contents to Bluesky
					log(LogLevel.DEBUG, 'Content to be posted:', content.value);
					await postToBluesky(content.value);
					log(LogLevel.TRACE, 'Content posted:', content.value);

					// save posted content to article
					await savePostedArticleContent(articleOfToday, content);

					// break the loop, because we want to post the rest of the content at a later time!
					break;
				}
			}
			
			// if all content of today has been posted, just log an info message			
			if(!freshContentFound) log(LogLevel.INFO, 'All content for article already posted:', articleOfToday.id);
		}		
	} catch (error) {		
		log(LogLevel.CRITICAL, 'Error running bot:', error);
	}
	log(LogLevel.INFO, 'Bot stopped...');
}

// schedule a job
if (DEBUG_MODE === true) {
	// schedule bot to run once per minute in debug mode
	log(LogLevel.DEBUG, 'DEBUG_MODE is', DEBUG_MODE);
	log(LogLevel.INFO, 'Scheduling bot to run once per minute...');
	schedule.scheduleJob('*/1 * * * *', () => {
		log(LogLevel.INFO, 'Job has been triggered...');
		runBot();
	});
} else {
	// otherwise schedule bot to run every other hour
	log(LogLevel.DEBUG, 'DEBUG_MODE is', DEBUG_MODE);
	log(LogLevel.INFO, 'Scheduling bot to run once every other hour...');
	schedule.scheduleJob('0 */2 * * *', () => {
		log(LogLevel.INFO, 'Job has been triggered...');
		runBot();
	});
}