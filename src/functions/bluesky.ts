import dotenv from "dotenv";
import { AtpAgent } from '@atproto/api';
import { LogLevel } from "../utils/enums";
import { log, stripHTMLElements } from '../functions/utils';
import { RichText } from '@atproto/api';
import { LinkCollection } from "../utils/interfaces";


dotenv.configDotenv();
const BLUESKY_HANDLE = process.env.BLUESKY_HANDLE!;
const BLUESKY_PASSWORD = process.env.BLUESKY_PASSWORD!;
const DEBUG_MODE = process.env.DEBUG_MODE === 'true' || false; // check if debug mode is on
const pds_url = process.env.PDS_URL || 'https://bsky.social';
const agent = DEBUG_MODE ? null : new AtpAgent({ service: pds_url }); // only initialize when not in debug mode

// log in to Bluesky
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

// post to Bluesky (or just print debug info if DEBUG_MODE is turned on)
async function postToBluesky(content: string) {
	if (DEBUG_MODE) {
		// log what should be posted and skip the actual posting process
		log(LogLevel.TRACE, 'Received the following content:', content);
		const stripped = await stripHTMLElements(content);
		const rawText = stripped["contentRaw"];
		const links = stripped["linkCollection"];
		log(LogLevel.TRACE, 'Stripped text:', rawText);
		const postRecord = await preparePost(rawText, links);
		log(LogLevel.TRACE, 'Prepared post received:', postRecord);
		log(LogLevel.INFO, 'Content that would have been posted:', postRecord.text);
		return;
	}

	try {
		if (!agent) throw new Error('Agent is not initialized.');
		log(LogLevel.TRACE, 'Received the following content:', content);
		const stripped = await stripHTMLElements(content);
		const rawText = stripped["contentRaw"];
		const links = stripped["linkCollection"];
		log(LogLevel.TRACE, 'Stripped text:', rawText);
		const postRecord = await preparePost(rawText, links);
		log(LogLevel.TRACE, 'Prepared post received:', postRecord);
		log(LogLevel.DEBUG, 'Attempting to post to Bluesky...');
		const res = await agent.post(postRecord);
		log(LogLevel.INFO, 'Post successfully created:', res.uri);
	} catch (error) {
		log(LogLevel.WARNING, 'Error posting to BlueSky:', error);
	}
}

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

		/*
			Example facet:

			{
				"index": {
					"byteStart": 74,
					"byteEnd": 108
				},
				"features": [
					{
						"$type": "app.bsky.richtext.facet#link",
						"uri": "https://en.wikipedia.org/wiki/CBOR"
					}
				]
			}
			
		*/

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
		log(LogLevel.DEBUG, 'Prepared post, post record:', JSON.stringify(postRecord, null, 2));
		return postRecord;
	} catch (error) {
		log(LogLevel.WARNING, 'Could not prepare post:', error);
		throw error;
	}
}

export { loginToBluesky, postToBluesky };