import dotenv from "dotenv";
import { AtpAgent } from '@atproto/api';
import { parse } from 'node-html-parser';


dotenv.configDotenv();
const BLUESKY_HANDLE = process.env.BLUESKY_HANDLE!;
const BLUESKY_PASSWORD = process.env.BLUESKY_PASSWORD!;
const DEBUG_MODE = process.env.DEBUG_MODE === 'true' || false; // check if debug mode is on
const LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';
const agent = DEBUG_MODE ? null : new AtpAgent({ service: 'https://bsky.social' }); // only initialize when not in debug mode

// log in to Bluesky
async function loginToBluesky() {
	if (DEBUG_MODE) {
		if (LOG_LEVEL === 'DEBUG') console.debug(`[${new Date().toISOString()}][DEBUG] Skipping BlueSky login in debug mode.`);
		return;
	}

	try {
		if (!agent) throw new Error('Agent is not initialized.');
		await agent.login({
			identifier: BLUESKY_HANDLE,
			password: BLUESKY_PASSWORD,
		});
		if (LOG_LEVEL != 'WARNING' && LOG_LEVEL != 'ERROR' && LOG_LEVEL != 'CRITICAL') console.log(`[${new Date().toISOString()}][INFO] Successfully logged in to BlueSky`);
	} catch (error) {
		console.error(`[${new Date().toISOString()}][ERROR] Failed to log in to BlueSky:`, error);
	}
}

// post to Bluesky (or just print debug info if DEBUG_MODE is turned on)
async function postToBluesky(content: string) {
	if (DEBUG_MODE) {
		//if (LOG_LEVEL === 'DEBUG') console.debug(`[${new Date().toISOString()}][DEBUG] Post content:`, content);
		const parsedList = parse(content).querySelector('.mw-parser-output ul');
		const parsedListItems = parsedList.querySelectorAll('li');
		//if (LOG_LEVEL === 'DEBUG') console.debug(`[${new Date().toISOString()}][DEBUG] Post ul content:`, parsedList.querySelector('.mw-parser-output ul').toString() );
		for (const listItem of parsedListItems) {
			if (LOG_LEVEL === 'DEBUG') console.debug(`[${new Date().toISOString()}][DEBUG] Post li content:`, listItem.toString());
		}

		return;
	}

	try {
		if (!agent) throw new Error('Agent is not initialized.');

		const postRecord = {
			$type: 'app.bsky.feed.post',
			text: content,
			createdAt: new Date().toISOString(),
		};

		const response = await agent.com.atproto.repo.createRecord({
			repo: agent.session?.did,
			collection: 'app.bsky.feed.post',
			record: postRecord,
		});

		if (LOG_LEVEL != 'WARNING' && LOG_LEVEL != 'ERROR' && LOG_LEVEL != 'CRITICAL') console.log(`[${new Date().toISOString()}][INFO] Post successfully created:`, response.data.uri);
	} catch (error) {
		console.error(`[${new Date().toISOString()}][ERROR] Error posting to BlueSky:`, error);
	}
}

export { loginToBluesky, postToBluesky };