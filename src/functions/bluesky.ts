import dotenv from "dotenv";
import { AtpAgent } from '@atproto/api';
import { LogLevel } from "../utils/enums";
import { log, prefixText, savePostedArticleContent, stripHTMLElements, savePostToJSON } from '../functions/utils';
import { RichText } from '@atproto/api';
import { LinkCollection } from "../utils/interfaces";
import { Article, Content } from "../classes/classes";

dotenv.configDotenv();

const BLUESKY_HANDLE = process.env.BLUESKY_HANDLE!;
const BLUESKY_PASSWORD = process.env.BLUESKY_PASSWORD!;
const DEBUG_MODE = process.env.DEBUG_MODE === 'true' || false; // check if debug mode is on
const pds_url = process.env.PDS_URL || 'https://bsky.social';
const agent = DEBUG_MODE ? null : new AtpAgent({ service: pds_url }); // only initialize when not in debug mode

/**
 * A function that logs your bot in to Bluesky.
 * Requires a global agent object to be set
 * 
 * Read more about this in the atproto API Docs:
 * https://www.npmjs.com/package/@atproto/api
 * @returns Promise<void>
 */
async function loginToBluesky() {
	if (DEBUG_MODE) {
		log(LogLevel.DEBUG, 'Skipping BlueSky login in debug mode...');
		return;
	}

	try {
		if (!agent) throw new Error('Agent is not initialized.');
		await agent.login({
			identifier: BLUESKY_HANDLE,
			password: BLUESKY_PASSWORD,
		});
		log(LogLevel.TRACE, 'Using the following credentials to log into BlueSky:', 'BLUESKY_HANDLE =>', BLUESKY_HANDLE, 'BLUESKY_PASSWORD =>', BLUESKY_PASSWORD);
		log(LogLevel.INFO, 'Successfully logged in to Bluesky!');
	} catch (error) {
		log(LogLevel.ERROR, 'Failed to log in to BlueSky:', error);

	}
}

/**
 * Function to post a postable Bluesky post object to Bluesky
 * @param bskyPostObj: {$type: string, text: RichText["text"], facets: RichText["facets"], createdAt: string} 
 * @returns Promise<void>
 */
async function postToBluesky(bskyPostObj: {$type: string, text: RichText["text"], facets: RichText["facets"], createdAt: string}) {
	// post to Bluesky (or just print debug info if DEBUG_MODE is turned on)
	if (DEBUG_MODE) {
		// log what should be posted and skip the actual posting process
		log(LogLevel.TRACE, 'Received post object:', JSON.stringify(bskyPostObj, null, 2));
		log(LogLevel.INFO, 'This could have been a Bluesky post:', 'text: "'+bskyPostObj.text+'",', 'createdAt: "'+bskyPostObj.createdAt+'"');
		await savePostToJSON(bskyPostObj);
		return;
	}
	try {
		if (!agent) throw new Error('Agent is not initialized.');
		log(LogLevel.DEBUG, 'Attempting to post to Bluesky...');
		const res = await agent.post(bskyPostObj);
		await savePostToJSON(bskyPostObj);
		log(LogLevel.INFO, 'Post successfully created:', res.uri);
	} catch (error) {
		log(LogLevel.WARNING, 'Error posting to BlueSky:', error);
	}
}

/**
 * Prepare the post by auto-detecting facets and also adding custom facets, based on a rawText string and a linkCollection array that implements the LinkCollection interface.
 * @param rawText Raw text in unicode
 * @param linkCollection Array of LinkCollection objects that point to specific indices in the raw text
 * 
 * @returns a postable Bluesky Post Object
 */
async function preparePost(rawText: string, linkCollection: Array<LinkCollection>) {
	try {
		log(LogLevel.DEBUG, 'Received raw text:', rawText);
		log(LogLevel.INFO, 'Creating rich text object...');
		// creating richtext
		const rt = new RichText({
			text: rawText
		})
		log(LogLevel.TRACE, 'Created rich text object:', rt);


		// if the agent is not initialized, skip automatic facet detection
		if (agent && agent != null) {
			// automatically detects mentions and links
			await rt.detectFacets(agent);
			log(LogLevel.DEBUG, 'Detecting facets...');
		} else {
			log(LogLevel.DEBUG, 'Skipping automatic facet detection...');
		}

		// after automatic facet detection, insert our custom facets
		// this is necessary because the automatic detector cannot know
		// which "raw text" should actually be a link
		// example: 1796 -> https://en.wikipedia.org/wiki/1796

		// loop through the link collection
		for (const link of linkCollection) {
			// find start and end index of the link text
			const start = rt.text.indexOf(link.text);
			const end = start + link.text.length;

			// let's construct our custom facet:
			const customFacet = {
				"index": {
					"byteStart": start,
					"byteEnd": end
				},
				"features": [
					{
						"$type": "app.bsky.richtext.facet#link",
						"uri": link.url
					}
				]
			}

			log(LogLevel.TRACE, 'Custom facet object created:', JSON.stringify(customFacet, null, 2));

			// finally append the custom facet
			// to the facet list of our
			// rich text object
			if (rt.facets == null && rt.facets == undefined) {
				// if facets does not exist or is undefined,
				// create facets
				rt.facets = [
					customFacet
				];
			} else {
				// otherwise just append to existing facets
				rt.facets.push(customFacet);
			}

		}

		const postRecord = {
			$type: 'app.bsky.feed.post',
			text: rt.text,
			facets: rt.facets,
			createdAt: new Date().toISOString(),
		}
		log(LogLevel.TRACE, 'Determined facets:', postRecord.facets == undefined ? 'undefined' : JSON.stringify(postRecord.facets, null , 2));
		log(LogLevel.TRACE, 'Prepared post, post record:', JSON.stringify(postRecord, null, 2));
		return postRecord;
	} catch (error) {
		log(LogLevel.WARNING, 'Could not prepare post:', error);
		throw error;
	}
}

/**
 * 
 * @param article 
 * @param content 
 * @returns true or false, based on whether the post was successful
 */
async function sanitizeAndPostContent(article: Article, content: Content) {
	try {
		const textToPost = await prefixText(article, content);
		
		// clean up the text
		log(LogLevel.TRACE, 'Text to be cleaned:', textToPost);
		const stripped = await stripHTMLElements(textToPost);
		const rawText = stripped["contentRaw"];
		const links = stripped["linkCollection"];
		log(LogLevel.TRACE, 'Stripped text:', rawText);

		// prepare for posting
		const postRecord = await preparePost(rawText, links);
		log(LogLevel.TRACE, 'Prepared post received:', JSON.stringify(postRecord, null, 2));
		
		// post the to Bluesky			
		await postToBluesky(postRecord);
		log(LogLevel.TRACE, 'Content posted:', JSON.stringify(postRecord, null, 2));

		// save posted content to article
		await savePostedArticleContent(article, content);	
	} catch (error) {
		log(LogLevel.ERROR, 'Failed to sanitize post content:', error);
		return false;		
	}
	
	return true;
}

export { loginToBluesky, preparePost, sanitizeAndPostContent, postToBluesky };