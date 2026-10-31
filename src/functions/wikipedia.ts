import dotenv from 'dotenv';
import RSSParser from 'rss-parser';
import { NodeType, parse } from 'node-html-parser';

import { Article, Content } from '../classes/classes';
import { log } from '../functions/utils';
import { LogLevel, ContentType } from '../utils/enums';
import { OnThisDayArticle, PicturedEvent, Picture } from '../utils/interfaces';
dotenv.config();

const WIKIPEDIA_MAIN_URL = process.env.WIKIPEDIA_MAIN_URL! || 'https://en.wikipedia.org';
const ATOM_FEED_URL = process.env.RSS_FEED_URL! || '/w/api.php?action=featuredfeed&feed=onthisday&feedformat=atom';
const DEBUG_MODE = process.env.DEBUG_MODE === 'true' || false;

function getLocalDateKey(date: Date): string {
	const month = date.getMonth() + 1;
	const day = date.getDate();
	return `${date.getFullYear()}-${month < 10 ? '0' : ''}${month}-${day < 10 ? '0' : ''}${day}`;
}

function getIntroParagraph(onThisDayArticle: OnThisDayArticle) {
	return parse(onThisDayArticle.contents).querySelector('.mw-parser-output > p');
}

function splitIntroParagraph(paragraph: ReturnType<typeof getIntroParagraph>): { dateHTML: string; holidayHTML: string } | null {
	if (!paragraph) return null;

	const separatorIndex = paragraph.childNodes.findIndex(node =>
		node.nodeType === NodeType.TEXT_NODE && node.rawText.includes(':')
	);
	if (separatorIndex === -1) {
		return { dateHTML: paragraph.innerHTML.trim(), holidayHTML: '' };
	}

	const separatorNode = paragraph.childNodes[separatorIndex];
	const colonIndex = separatorNode.rawText.indexOf(':');
	const dateHTML = paragraph.childNodes
		.slice(0, separatorIndex)
		.map(node => node.toString())
		.join('') + separatorNode.rawText.slice(0, colonIndex);
	const holidayHTML = separatorNode.rawText.slice(colonIndex + 1) + paragraph.childNodes
		.slice(separatorIndex + 1)
		.map(node => node.toString())
		.join('');

	return { dateHTML: dateHTML.trim(), holidayHTML: holidayHTML.trim() };
}

function getFeaturedPicture(root: ReturnType<typeof parse>): Picture|null {
	const pictureNode = root.querySelector('.mw-parser-output > #mp-otd-img > div > span > a > img');
	const src = pictureNode?.getAttribute('src');
	const width = Number(pictureNode?.getAttribute('width'));
	const height = Number(pictureNode?.getAttribute('height'));
	if (!src || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;

	try {
		return {
			uri: new URL(src, WIKIPEDIA_MAIN_URL).toString(),
			alt: pictureNode.getAttribute('alt') || '',
			height,
			width
		};
	} catch (error) {
		log(LogLevel.WARNING, 'Featured event image has an invalid URL:', src, error);
		return null;
	}
}

/**
 * Fetches the Wikipedia On This Day article for today
 * @returns {Promise<Article|null>} a Promise that resolves with an Article object or null
 */
async function fetchOnThisDayArticle(): Promise<Article|null> {
	if (DEBUG_MODE) log(LogLevel.DEBUG, 'fetchOnThisDayArticles called');
	const parser = new RSSParser();

	try {
		log(LogLevel.DEBUG, 'Fetching feed from:', WIKIPEDIA_MAIN_URL + ATOM_FEED_URL);
		const feed = await parser.parseURL(WIKIPEDIA_MAIN_URL + ATOM_FEED_URL);

		const currentDate = new Date();
		const currentDateKey = getLocalDateKey(currentDate);

		const filteredArticles = feed.items.filter(item => {
			const articleISODate = new Date(item.isoDate);
			if (Number.isNaN(articleISODate.getTime())) {
				log(LogLevel.WARNING, 'Invalid date format in isoDate field:', item.isoDate);
				return false;
			}

			return articleISODate.toISOString().slice(0, 10) === currentDateKey;
		});

		const articles = filteredArticles.map(item => {
			const id = item.isoDate;
			const title = item.title || 'No title';
			const contents = item.content || item.contentSnippet || item.summary || '';
			const link = item.link || item.id || '';
			return { id, title, contents, link };
		});

		log(LogLevel.TRACE, 'Found articles:', articles);

		log(LogLevel.DEBUG, 'Number of matching articles:', articles.length);
		if (articles.length === 0) {
			log(LogLevel.WARNING, `No On This Day article found for local date ${currentDateKey}.`);
			return null;
		}
		if (articles.length > 1) log(LogLevel.WARNING, 'Found more than one article - returning only the first one!');				

		if (!articles[0].contents || !getIntroParagraph(articles[0])) {
			log(LogLevel.WARNING, `On This Day article for ${currentDateKey} has no introductory paragraph.`);
			return null;
		}
		
		// for the one article we want to return, we need to build the article object
		const contentList = new Array<Content>;

		// push today text into our new content list
		contentList.push(new Content(ContentType.todayText, await getOnThisDayTodayText(articles[0]),null,true));

		// push holiday entries into our new content list
		for(const holiday of await getOnThisDayHolidays(articles[0])) {
			contentList.push(new Content(ContentType.holiday, holiday));
		}

		// push featured event entries into our new content list
		for(const featuredEvent of await getOnThisDayFeaturedEvents(articles[0])) {
			contentList.push(new Content(ContentType.featuredEvent, featuredEvent.event, featuredEvent.img));
		}

		// push event entries into our new content list
		for(const event of await getOnThisDayEvents(articles[0])) {
			contentList.push(new Content(ContentType.event, event));
		}

		// push anniversary entries into our new content list
		for(const anniversary of await getOnThisDayAnniversaries(articles[0])) {
			contentList.push(new Content(ContentType.anniversary, anniversary));
		}

		log(LogLevel.DEBUG, 'Article ID:', articles[0].id);
		log(LogLevel.TRACE, 'Content List for this article:', contentList);
		
		const article = new Article(articles[0].id, articles[0].link, contentList);

		log(LogLevel.TRACE, 'Returning article object:', article);
		return article;
	} catch (error) {
		log(LogLevel.ERROR, 'Failed to fetch Atom feed:', error);
		return null;
	}
}

/**
 * Extracts the text of the "On This Day" article for today
 * @param {OnThisDayArticle} onThisDayArticle 
 * @returns {Promise<string>} a Promise that resolves with the text of the "On This Day" article
 */
async function getOnThisDayTodayText(onThisDayArticle: OnThisDayArticle): Promise<string> {
	const intro = splitIntroParagraph(getIntroParagraph(onThisDayArticle));
	if (!intro) {
		log(LogLevel.WARNING, 'On This Day article has no introductory paragraph.');
		return '';
	}

	const todayText = `<p>${intro.dateHTML}</p>`;
	log(LogLevel.TRACE, 'TodayText:', todayText);
	return todayText;
}

/**
 * Extracts the holidays from the "On This Day" article for today
 * @param {OnThisDayArticle} onThisDayArticle 
 * @returns {Promise<string[]>} a Promise that resolves with an array of holiday strings
 */
async function getOnThisDayHolidays(onThisDayArticle: OnThisDayArticle): Promise<string[]> {
	const intro = splitIntroParagraph(getIntroParagraph(onThisDayArticle));
	if (!intro || !intro.holidayHTML) {
		log(LogLevel.DEBUG, 'For today, there is no holiday info available.');
		return [];
	}

	const holidayText = `<p>${intro.holidayHTML}</p>`;
	log(LogLevel.TRACE, 'HolidayText:', holidayText);
	// split the holidays into an array
	// bugfix for issue #3:
	// split by '; ' instead of ', '
	// https://github.com/fl0-at/wikipedia-onthisday-bsky-bot/issues/3
	const holidays = holidayText.split('; ');
	const holidayList: Array<string> = [];
	log(LogLevel.DEBUG, `Found ${holidays.length} holidays, parsing...`);
	for (const holiday of holidays) {
		log(LogLevel.DEBUG, 'Holiday found:', holiday.toString());
		holidayList.push(holiday.toString());
	}
	return holidayList;
}


async function getOnThisDayFeaturedEvents(onThisDayArticle: OnThisDayArticle): Promise<PicturedEvent[]> {
	const root = parse(onThisDayArticle.contents);
	const eventNodes = root.querySelectorAll('.mw-parser-output > ul > li');
	// need to iterate over the event nodes to find the "featured" events
	// they include the word "pictured" in the text
	const featuredEventList: string[] = [];
	for (const event of eventNodes) {
		// in the future, we might want to skip the "pictured" events
		// because they are considered a "featured event"
		// and might be posted separately, including a picture
		// for now, we just log that they are "pictured" events
		if (!/\bpictured\b/i.test(event.innerText)) {
			// skip the non-"pictured" events
			log(LogLevel.DEBUG, 'Skipping "regular" event:', event.toString());
			continue;
		}
		log(LogLevel.DEBUG, 'Featured event found:', event.toString());
		featuredEventList.push(event.toString());
	}
	if (featuredEventList.length == 0) {
		log(LogLevel.DEBUG, 'For today, there is no featured event info available:', featuredEventList.toString().replace('\n',''))
		return [];
	}
	log(LogLevel.DEBUG, `Found ${featuredEventList.length} featured events, parsing...`);
	const img = getFeaturedPicture(root);
	if (!img) {
		log(LogLevel.WARNING, 'Featured event found, but its image is missing or invalid; it will be included as a regular event.');
		return [];
	}

	const featuredEvents: PicturedEvent[] = [];
	for (const featuredEvent of featuredEventList) {
		log(LogLevel.TRACE, 'FeaturedEvent:', featuredEvent.toString());
		log(LogLevel.DEBUG, 'Picture found:', img.uri);
		featuredEvents.push({ event: featuredEvent, img });
	}
	return featuredEvents;
}

/**
 * Extracts the events from the "On This Day" article for today
 * @param {OnThisDayArticle} onThisDayArticle 
 * @returns {Promise<string[]>} a Promise that resolves with an array of event strings
 */
async function getOnThisDayEvents(onThisDayArticle: OnThisDayArticle): Promise<string[]> {
	const root = parse(onThisDayArticle.contents);
	const eventNodes = root.querySelectorAll('.mw-parser-output > ul > li');
	log(LogLevel.TRACE, 'eventNodes:', eventNodes.toString());
	if (eventNodes.length == 0) {
		log(LogLevel.DEBUG, 'For today, there is no event info available:', eventNodes.toString().replace('\n',''))
		return [];
	}
	log(LogLevel.DEBUG, `Found ${eventNodes.length} events, parsing...`);
	const hasFeaturedImage = eventNodes.some(event => /\bpictured\b/i.test(event.innerText)) &&
		getFeaturedPicture(root) !== null;
	const eventList = [];
	for (const event of eventNodes) {
		if (/\bpictured\b/i.test(event.innerText) && hasFeaturedImage) {
			// skip the "pictured" events
			log(LogLevel.DEBUG, 'Skipping "pictured" event:', event.toString());
			continue;
		}
		log(LogLevel.DEBUG, 'Event found:', event.toString());
		eventList.push(event.toString());
	}
	return eventList;
}

/**
 * Extracts the anniversaries from the "On This Day" article for today
 * @param {OnThisDayArticle} onThisDayArticle 
 * @returns {Promise<string[]>} a Promise that resolves with an array of anniversary strings
 */
async function getOnThisDayAnniversaries(onThisDayArticle: OnThisDayArticle): Promise<string[]> {
	const anniversaryNodes = parse(onThisDayArticle.contents).querySelectorAll('div.mw-parser-output > div.hlist:not(.otd-footer):not(.inline) > ul > li');
	log(LogLevel.TRACE, 'anniversaryNodes:', anniversaryNodes.toString());
	if (anniversaryNodes.length == 0) {
		log(LogLevel.DEBUG, 'For today, there is no anniversary info available:', anniversaryNodes.toString().replace('\n',''))
		return [];
	}
	log(LogLevel.DEBUG, `Found ${anniversaryNodes.length} anniversaries, parsing...`);
	const anniversaryList = [];
	for (const anniversary of anniversaryNodes) {
		log(LogLevel.DEBUG, 'Anniversary found:', anniversary.toString());
		anniversaryList.push(anniversary.toString());
	}
	return anniversaryList;
}

export { fetchOnThisDayArticle, getOnThisDayAnniversaries, getOnThisDayEvents, getOnThisDayHolidays, getOnThisDayTodayText };