import dotenv from "dotenv";
import { AtpAgent, Facet } from '@atproto/api';
import { LogLevel } from "../utils/enums";
import { log, prefixText, saveArticleContent, savePostToJSON, stripHTMLElementsAndDecorateText } from '../functions/utils';
import { RichText } from '@atproto/api';
import { UnicodeString } from "@atproto/api";
import { Link } from "../utils/interfaces";
import { Article, BlueskyPost, Content } from "../classes/classes";

dotenv.configDotenv();

const BLUESKY_HANDLE = process.env.BLUESKY_HANDLE!;
const BLUESKY_PASSWORD = process.env.BLUESKY_PASSWORD!;
// check if debug mode is on
const DEBUG_MODE = process.env.DEBUG_MODE === 'true' || false; 
const PDS_URL = process.env.PDS_URL || 'https://bsky.social';
// only initialize an agent when not in debug mode
const agent = DEBUG_MODE ? null : new AtpAgent({ service: PDS_URL });

/**
 * A function that logs your bot in to Bluesky.
 * Requires a global agent object to be set
 *  
 * @returns {Promise<void>} a void Promise that resolves when the login is successful
 * 
 * Read more about this in the atproto API Docs:
 * @see https://www.npmjs.com/package/@atproto/api
 * @see https://docs.bsky.app/docs/advanced-guides/atproto
 * @see https://atproto.com/
 */
async function loginToBluesky(): Promise<void> {
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
 * @param {BlueskyPost} post - The postable Bluesky post object 
 * @returns {Promise<void>}
 */
async function postToBluesky(post: BlueskyPost): Promise<void> {
	// post to Bluesky (or just print debug info if DEBUG_MODE is turned on)
	if (DEBUG_MODE) {
		// log what should be posted and skip the actual posting process
		log(LogLevel.TRACE, 'Received post object:', JSON.stringify(post, null, 2));
		log(LogLevel.INFO, 'This could have been a Bluesky post:', '\n' + post.text);
		await savePostToJSON(post);
		return;
	}
	try {
		if (!agent) throw new Error('Agent is not initialized.');
		log(LogLevel.DEBUG, 'Attempting to post to Bluesky...');
		const bskyPostObj = JSON.parse(JSON.stringify(post, null, 2));
		const res = await agent.post(bskyPostObj);
		await savePostToJSON(post);
		log(LogLevel.INFO, 'Post successfully created:', res.uri);
	} catch (error) {
		log(LogLevel.WARNING, 'Error posting to BlueSky:', error);
	}
}

/**
 * Prepare the post by auto-detecting facets and also adding custom facets, based on a rawText string and a linkCollection array that implements the LinkCollection interface.
 * @param {string} rawText Raw text in unicode
 * @param {Array<Link>} linkCollection Array of Link objects that point to specific indices in the raw text
 * 
 * @returns {Promise<BlueskyPost>} a postable Bluesky Post Object
 */
async function preparePost(rawText: string, linkCollection: Array<Link>): Promise<BlueskyPost> {
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
			log(LogLevel.INFO, 'Detecting facets...');
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
			/**
			 * According to the Bluesky docs, we need to convert this string from a UTF-16 string to a UTF-8 string
			 * 
			 * @type {UnicodeString} unicodeFullText - The entire posts text in UTF-8
			 * 
			 * @see https://docs.bsky.app/docs/advanced-guides/post-richtext#text-encoding-and-indexing			
			 * 
			 */
			const unicodeFullText: UnicodeString = new UnicodeString(rt.text);
			/**
			 * According to the Bluesky docs, we need to convert this string from a UTF-16 string to a UTF-8 string
			 * 
			 * @type {UnicodeString} unicodeLinkText - The link text in UTF-8
			 * 
			 * @see https://docs.bsky.app/docs/advanced-guides/post-richtext#text-encoding-and-indexing			
			 */
			const unicodeLinkText: UnicodeString = new UnicodeString(link.text);
			/**
			 * We are making use of the utf16IndexToUtf8Index method to convert the UTF-16 index to a UTF-8 index
			 * 
			 * @type {number} start - The start index of the link text
			 * 
			 * @see https://github.com/bluesky-social/atproto/blob/main/packages/api/src/rich-text/unicode.ts
			 * 
			 */
			const start: number = unicodeFullText.utf16IndexToUtf8Index(rt.text.indexOf(link.text));
			const end: number = start + unicodeLinkText.length;
			

			/**
			 * This is the custom facet object that we will append to the facet list of our rich text object
			 * 
			 * @type {Facet} customFacet - The custom facet object
			 * 
			 * @see https://docs.bsky.app/docs/advanced-guides/post-richtext#rich-text-facets
			 * @see https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/richtext/facet.json
			 */
			const customFacet: Facet = {
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

		// create the post record
		const postRecord = new BlueskyPost(rt.text, rt.facets, new Date().toISOString());
		log(LogLevel.TRACE, 'Determined facets:', postRecord.facets == undefined ? 'undefined' : JSON.stringify(postRecord.facets, null , 2));
		log(LogLevel.TRACE, 'Prepared post, post record:', JSON.stringify(postRecord, null, 2));
		return postRecord;
	} catch (error) {
		log(LogLevel.WARNING, 'Could not prepare post:', error);
		throw error;
	}
}

/**
 * A function to sanitize and post content to Bluesky
 * @param {Article} article - The article object
 * @param {Content} content - The content object
 * @returns {Promise<boolean>} - True or false, based on whether the post was successful
 */
async function sanitizeAndPostContent(article: Article, content: Content): Promise<boolean> {
	try {
		const textToPost = await prefixText(article, content);
		
		// clean up the text
		log(LogLevel.TRACE, 'Text to be cleaned:', textToPost);
		const stripped = await stripHTMLElementsAndDecorateText(textToPost);
		const rawText = stripped["contentRaw"];
		const links = stripped["linkCollection"];
		log(LogLevel.TRACE, 'Stripped text:', rawText);

		// prepare for posting
		const postRecord = await preparePost(rawText, links);
		log(LogLevel.TRACE, 'Prepared post received:', JSON.stringify(postRecord, null, 2));
		
		// post to Bluesky			
		await postToBluesky(postRecord);
		log(LogLevel.TRACE, 'Content posted:', JSON.stringify(postRecord, null, 2));

		// need to rework this part
		// the article content does not need to be saved
		// it just needs to be updated to indicate that it has been posted

		// save posted content to article
		//await saveArticleContent(article, content);	
	} catch (error) {
		log(LogLevel.ERROR, 'Failed to sanitize post content:', error);
		return false;		
	}
	
	return true;
}

export { loginToBluesky, preparePost, sanitizeAndPostContent, postToBluesky };