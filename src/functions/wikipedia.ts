import dotenv from 'dotenv';
import RSSParser from 'rss-parser';
import { parse } from 'node-html-parser';

import { Article, Content } from '../classes/classes';
import { log } from '../functions/utils';
import { LogLevel, ContentType } from '../utils/enums';
import { OnThisDayArticle } from '../utils/interfaces';
dotenv.config();

const WIKIPEDIA_MAIN_URL = process.env.WIKIPEDIA_MAIN_URL! || 'https://en.wikipedia.org';
const ATOM_FEED_URL = process.env.RSS_FEED_URL! || '/w/api.php?action=featuredfeed&feed=onthisday&feedformat=atom';
const DEBUG_MODE = process.env.DEBUG_MODE === 'true' || false;

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
		const formattedDate = new Date(Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), currentDate.getUTCDate(), 0, 0, 0, 0)).toISOString();

		const filteredArticles = feed.items.filter(item => {
			try {
				const articleISODate = new Date(item.isoDate);
				const articleISOString = articleISODate.toISOString();

				return articleISOString === formattedDate;
			} catch (error) {
				log(LogLevel.ERROR, 'Invalid date format in isoDate field:', item.isoDate, error)
				return false;
			}
		});

		const articles = filteredArticles.map(item => {
			const id = item.guid || item.link || item.id || item.title || '';
			const title = item.title || 'No title';
			const contents = item.content || item.contentSnippet || item.summary || 'No content';
			const link = item.link || item.id || '';
			return { id, title, contents, link };
		});

		log(LogLevel.TRACE, 'Found articles:', articles);

		log(LogLevel.DEBUG, 'Number of matching articles:', articles.length);
		if (articles.length > 1) log(LogLevel.WARNING, 'Found more than one article - returning only the first one!');				
		
		// for the one article we want to return, we need to build the article object
		const contentList = new Array<Content>;

		// push today text into our new content list
		contentList.push(new Content(ContentType.todayText, await getOnThisDayTodayText(articles[0])));

		// push holiday entries into our new content list
		for(const holiday of await getOnThisDayHolidays(articles[0])) {
			contentList.push(new Content(ContentType.holiday, holiday));
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
		
		const article = new Article(articles[0].id, contentList);

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
	const todayNode = parse(onThisDayArticle.contents).querySelector('.mw-parser-output > p');
	log(LogLevel.TRACE, 'todayNode:', todayNode.toString());
	// check if there's more than today's date

	let todayText: string|null;
	if (todayNode.toString().includes(':')) {
		const combinedText = todayNode.toString().split(': ');
		// because we are effectively splitting the
		// <p> node, we need to close the tag again
		todayText = combinedText[0].replace('\n','') + '</p>';
	} else {		
		return todayNode.toString();
	}	
	log(LogLevel.DEBUG, 'TodayText:', todayText.toString());	
	return todayText;
}

/**
 * Extracts the holidays from the "On This Day" article for today
 * @param {OnThisDayArticle} onThisDayArticle 
 * @returns {Promise<string[]>} a Promise that resolves with an array of holiday strings
 */
async function getOnThisDayHolidays(onThisDayArticle: OnThisDayArticle): Promise<string[]> {
	const holidayNode = parse(onThisDayArticle.contents).querySelector('.mw-parser-output > p');
	log(LogLevel.TRACE, 'holidayNode:', holidayNode.toString());
	// check if there's more than today's date

	let holidayText: string|null;
	if (holidayNode.toString().includes(':')) {
		const combinedText = holidayNode.toString().split(': ');		
		// because we are effectively splitting the
		// <p> node, we need to add the opening tag
		holidayText = '<p>' + combinedText[1].replace('\n','');
	} else {		
		log(LogLevel.DEBUG, 'For today, there is no holiday info available:', holidayNode.toString().replace('\n',''))
		return [];
	}		
	log(LogLevel.TRACE, 'HolidayText:', holidayText.toString());
	const holidays = holidayText.split(', ');
	const holidayList: Array<string> = [];
	log(LogLevel.DEBUG, `Found ${holidays.length} holidays, parsing...`);
	for (const holiday of holidays) {
		log(LogLevel.DEBUG, 'Holiday found:', holiday.toString());
		holidayList.push(holiday.toString());
	}
	return holidayList;
}

/**
 * Extracts the events from the "On This Day" article for today
 * @param {OnThisDayArticle} onThisDayArticle 
 * @returns {Promise<string[]>} a Promise that resolves with an array of event strings
 */
async function getOnThisDayEvents(onThisDayArticle: OnThisDayArticle): Promise<string[]> {
	const eventNodes = parse(onThisDayArticle.contents).querySelectorAll('.mw-parser-output > ul > li');
	log(LogLevel.TRACE, 'eventNodes:', eventNodes.toString());
	if (eventNodes.length == 0) {
		log(LogLevel.DEBUG, 'For today, there is no event info available:', eventNodes.toString().replace('\n',''))
		return [];
	}
	log(LogLevel.DEBUG, `Found ${eventNodes.length} events, parsing...`);
	const eventList = [];
	for (const event of eventNodes) {
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