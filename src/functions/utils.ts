import dotenv from 'dotenv';
import fs from 'fs/promises';
import { Article, Content } from '../classes/classes';
import { ContentType, LogLevel } from '../utils/enums';
import parse from 'node-html-parser';
import { LinkCollection } from '../utils/interfaces';
import { RichText } from '@atproto/api/dist/rich-text/rich-text';
dotenv.config();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const DB = require('../../database/posted_articles.json');
const LOG_LEVEL = process.env.LOG_LEVEL || LogLevel.INFO;
const wikiURL = process.env.WIKIPEDIA_MAIN_URL || 'https://en.wikipedia.org';
log('LOGGER', 'LogLevel is turned to', LOG_LEVEL);

dotenv.config();

async function saveToDb(DB) {
	try {
		await fs.writeFile('./database/posted_articles.json', JSON.stringify(DB, null, 2), 'utf-8');	
	} catch (error) {
		log(LogLevel.CRITICAL, 'Failed to save DB to local filesystem:', error);
	}
}

// save posted articles to local file
async function savePostedArticleWithoutContents(article: Article) {
	try {
		// need to just write the "bare" article, without contents
		const articleWithoutContent = new Article(article.id,[]);
		log(LogLevel.DEBUG, 'Saving barebones article to DB:', articleWithoutContent);				
		
		// if the JSON is still empty, populate it
		if (DB.articles == undefined || DB === '{}') await fs.writeFile('./database/posted_articles.json', JSON.stringify(JSON.parse('{"articles": []}'), null, 2));
		log(LogLevel.TRACE, 'Reading DB through FS:', await fs.readFile('./database/posted_articles.json','utf-8'));
		log(LogLevel.TRACE, 'DB.articles:', DB.articles);
		// check if the article ID exists already
		if (DB.articles != undefined && DB.articles.find((art: { id: string }) => art.id === articleWithoutContent.id )) return;
		DB.articles.push(articleWithoutContent);
		await saveToDb(DB);		
	} catch (error) {
		log(LogLevel.ERROR, 'Failed to save posted article:', error);
	}
}

// save posted content of article to local file
async function savePostedArticleContent(article: Article, content: Content) {
	try {
		// need to add content to article
		
		const indexForUpdate = DB.articles.findIndex((art: { id: string }) => art.id === article.id);
		if (indexForUpdate === -1) throw new Error(`Cannot find article with ID ${article.id}`);
		
		const curArt = new Article(article.id, DB.articles[indexForUpdate].contentList);
		// need to check if to be saved content already exists
		let isDuplicateContent = false;
		for (const con of DB.articles[indexForUpdate].contentList) {			
			if (con == content) isDuplicateContent = true;
		}
		// for some reason I get duplicate content entries
		// need to fix!!!
		if (!isDuplicateContent) {
			curArt.contentList.push(content)
		} else {
			log(LogLevel.WARNING, 'Duplicate content detected - will be skipped:', content.value);

		}

		log(LogLevel.DEBUG, 'Saving content for article with ID:', article.id);
		log(LogLevel.TRACE, 'Saving the following content list:', DB.articles[indexForUpdate].contentList);

		DB.articles[indexForUpdate] = curArt;
		log(LogLevel.TRACE, 'Saving the following DB to local FS:', DB);
		await saveToDb(DB);
		
	} catch (error) {
		log(LogLevel.ERROR, 'Failed to save posted article content:', error);
	}
}

// load list of already posted articles from local file
async function loadPostedArticles(): Promise<Article[]> {
	try {
		const data = DB.articles;
		const allArticles: Array<Article> = data;
		return allArticles;
	} catch (error) {
		if (error.code === 'ENOENT') {
			return [];
		} else {
			log(LogLevel.ERROR, 'Failed to load posted articles:', error);			
			return [];
		}
	}
}

// load already posted article from local file
async function loadPostedArticle(id: string): Promise<Article> {
	try {
		const data = DB.articles.find((art: {id: string}) => art.id === id);
		const article: Article = data;
		return article;
	} catch (error) {
		if (error.code === 'ENOENT') {
			return null;
		} else {
			log(LogLevel.ERROR, `Failed to load posted article with id ${id}:`, error);			
			return null;
		}
	}
}

// load list of already posted contents of article from local file
async function loadPostedArticleContent(article: Article): Promise<Content[]> {
	try {
		// need to just read that one article
		const articleFromDB: Article = DB.articles.find((art: {id: string}) => art.id === article.id);

		return articleFromDB.contentList;
	} catch (error) {
		if (error.code === 'ENOENT') {
			return [];
		} else {
			log(LogLevel.ERROR, 'Failed to load posted contents for article:', error);
			return [];
		}
	}
}

// check if we already posted any content for this article
async function checkIfContentAlreadyPostedForArticle(article: Article, content: Content) {
	try {
		// need to just read that one article
		const postedArticle: Article = DB.articles.find((art: {id: string}) => art.id === article.id);
		const postedContent = postedArticle.contentList.find((posCon: {value: string, type: ContentType}) => posCon.type === content.type && posCon.value === content.value);
		if (!postedContent) return false;
		return true;
	} catch (error) {
		if (error.code === 'ENOENT') {
			return false;
		} else {
			log(LogLevel.ERROR, 'Failed to load posted contents for article:', error);
			return false;
		}
	}
}

// strip all HTML elements of the content
async function stripHTMLElements(content: string) {
	let contentRaw = content;
	
	// first, create a link collection object so we
	// don't lose the context of the links
	const linkCollection = new Array<LinkCollection>;
	const aHrefNodes = parse(contentRaw).querySelectorAll('a');

	// push those links into a link collection
	// and then replace HTML links with text only
	for (const aHref of aHrefNodes) {
		linkCollection.push({
			text: aHref.innerText,
			url: wikiURL + aHref.getAttribute('href')
		});
		// strip the HTML tags and replace with just the text
		contentRaw = contentRaw.replace(aHref.toString(), aHref.innerText);
		log(LogLevel.DEBUG, 'linkText:', aHref.innerText, 'wikiURL:', wikiURL+aHref.getAttribute('href'));
	}

	// strip weird characters

	// \n
	contentRaw = contentRaw.replace('\n', '');

	// &#160;
	contentRaw = contentRaw.replace('&#160;', '');

	// now strip all remaining HTML tags

	// <p>
	const pHTML = parse(contentRaw).querySelectorAll('p');
	for (const p of pHTML) {
		contentRaw = contentRaw.replace(p.toString(), p.innerHTML);
	}
	
	// <li>
	const listHTMLNodes = parse(contentRaw).querySelectorAll('li');
	for (const li of listHTMLNodes) {
		contentRaw = contentRaw.replace(li.toString(), li.innerHTML);
		contentRaw = contentRaw.replace('(', '');
		contentRaw = contentRaw.replace(')', '');
	}

	// <b>
	const boldHTMLNodes = parse(contentRaw).querySelectorAll('b');
	for (const boldNode of boldHTMLNodes) {
		contentRaw = contentRaw.replace(boldNode.toString(), boldNode.innerHTML);
	}

	// <abbr>
	const abbrHTMLNodes = parse(contentRaw).querySelectorAll('abbr');
	for (const abbrNode of abbrHTMLNodes) {
		if(abbrNode.innerHTML.includes('b.')) {
			contentRaw = contentRaw.replace(abbrNode.toString(), abbrNode.innerHTML).replace('b.', 'is born <<BORN>> in ')
		} else if (abbrNode.innerHTML.includes('d.')) {
			contentRaw = contentRaw.replace(abbrNode.toString(), abbrNode.innerHTML).replace('d.', 'dies <<DIED>> in ')
		}
	}

	// need to strip <i> completely - usually the 
	// feed tells us that for this post there is
	// a picture that goes with this
	const iHTMLNodes = parse(contentRaw).querySelectorAll('i');
	for (const i of iHTMLNodes) {
		contentRaw = contentRaw.replace(i.toString(), '');
	}

	// to clean up, let's replace all "double spaces"
	// with single ones
	contentRaw = contentRaw.replace('  ', ' ');

	/*
		maybe in the future we could 
		parse the picture and attach it 
		to the post somehow?
	*/
	
	// decorate our text with a nice calendar emoji
	// the decorator function might be enhanced
	// in the future, with additional emojis
	contentRaw = await decorateText('<<CALENDAR>> ' + contentRaw);

	/**********************************************\
	| we will return stripped, decorated text and  |
	| our freshly created link collection object   |
	| in the reponse of this function		   	   |
	\**********************************************/
	return { contentRaw, linkCollection };
}

// prefix the potential post with todayText
async function prefixText(article: Article, content: Content) {
	/********************************************************\
	** POST PREFIXER 												**
	** ---------------------------------------------------- **
	** ==> need to prefix all posts with the by the			**
	** ==> "todayText", i.e. like this:						**
	** ==> "On this day, December 15th, ..."				**
	** ---------------------------------------------------- **
	\********************************************************/
	log(LogLevel.DEBUG, 'prefixText called...');
	const articleContents = await loadPostedArticleContent(article);
	log(LogLevel.DEBUG, 'Loaded article contents:', JSON.stringify(articleContents, null, 2));
	const todayContent: Content = JSON.parse(JSON.stringify(articleContents)).find((cont: { type: ContentType, value: string  }) => cont.type === ContentType.todayText);
	log(LogLevel.DEBUG, 'Fetched todayContent:', JSON.stringify(todayContent, null, 2));
	const todayText = todayContent.value;
	log(LogLevel.DEBUG, 'todayText:', todayText);
	log(LogLevel.DEBUG, 'Trying to prefix content...');
	
	// depending on the content, we will build our posts differently
	let prefixedText = '';
	let prefixedContent = content.value;
	/*
	
		TO DO: MAKE SURE THERE ARE 2 NEWLINE CHARACTERS AFTER THE PREFIX

	*/
	switch (content.type) {
		case ContentType.anniversary:			
			prefixedText = '#Anniversary - #OnThisDay, ' + todayText + ':\n\n' + prefixedContent;
			break;
		case ContentType.event:
			prefixedContent = prefixedContent.replace('</a> – ', '</a>:\n\n');
			prefixedText = '#OnThisDay, ' + todayText + ' in ' + prefixedContent;
			break;
		case ContentType.holiday:
			prefixedContent = 'the following holiday is observed:\n\n' + prefixedContent;
			prefixedText = '#OnThisDay, ' + todayText + ', ' + prefixedContent;
			break;
		default:
			prefixedText = '#OnThisDay, ' + todayText + ' ' + content.value;
			break;
	}

	
	log(LogLevel.DEBUG, 'prefixedText:', prefixedText);
	return prefixedText;
}

/**
 * Decorates the text with lots of unicode emojis
 * 
 * NOT YET IMPLEMENTED, WILL SIMPLY RETURN INPUT WITHOUT CHANGES
 *  
 * @param text the text you want to decorate
 */
async function decorateText(text: string) {
	//---------------------------------------------//
	// TO DO: 	Create a decorator function to put //
	// 			some nice emojis into our text	   //
	//			-> that should be easy, i.e		   //
	//			-> inserting some emojis after	   //
	//			-> certain keywords like "France"  //
	//			--------------> French flag emoji  //
	//			-> maybe also the calendar emoji   //
	//			-> with the current date selected? //
	//---------------------------------------------//
	let decoratedText = text.replace('<<CALENDAR>> ', '📅 ');
	decoratedText = decoratedText.replace('<<BORN>>', '🚼');
	decoratedText = decoratedText.replace('<<DIED>>', '✝');

	return decoratedText;
}

async function savePostToJSON(bskyPostObj: {$type: string, text: RichText["text"], facets: RichText["facets"], createdAt: string}) {
	const pFromFile = (await fs.readFile('database/postings.json')).toString();
	const pArr = [];	
	if (pFromFile != "") {
		for (const posting of JSON.parse(pFromFile).postings) {
			pArr.push(posting);
		}
	}
	pArr.push(JSON.parse(JSON.stringify(bskyPostObj, null, 2)));
	const postings = JSON.parse(JSON.stringify(pArr, null, 2));
	const pJSON = {
		postings
	}
	await fs.writeFile('database/postings.json', JSON.stringify(pJSON, null, 2));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function log(level: LogLevel|string, message: string, ...optionalParams: any[] ) {
	try {
		switch (level) {
			case LogLevel.CRITICAL:
				console.error(`[${new Date().toISOString()}][${level}] ${message}`, ...optionalParams);
				break;
			case LogLevel.ERROR:
				if (LOG_LEVEL != LogLevel.CRITICAL) console.error(`[${new Date().toISOString()}][${level}] ${message}`, ...optionalParams);
				break;
			case LogLevel.WARNING:
				if (LOG_LEVEL != LogLevel.CRITICAL && LOG_LEVEL != LogLevel.ERROR) console.warn(`[${new Date().toISOString()}][${level}] ${message}`, ...optionalParams);
				break;
			case LogLevel.INFO:
				if (LOG_LEVEL != LogLevel.CRITICAL && LOG_LEVEL != LogLevel.ERROR && LOG_LEVEL != LogLevel.WARNING) console.info(`[${new Date().toISOString()}][${level}] ${message}`, ...optionalParams);
				break;
			case LogLevel.DEBUG:
				if (LOG_LEVEL === LogLevel.DEBUG || LOG_LEVEL === LogLevel.TRACE) console.debug(`[${new Date().toISOString()}][${level}] ${message}`, ...optionalParams);
				break;
			case LogLevel.TRACE:
				if (LOG_LEVEL === LogLevel.TRACE) console.debug(`[${new Date().toISOString()}][${level}] ${message}`, ...optionalParams);
				break;
			default:
				console.log(`[${new Date().toISOString()}][${level}] ${message}`, ...optionalParams);
				break;
		}		
	} catch (error) {
		throw new Error(`Unable to log to console: [${new Date().toISOString()}] ${error}`);			
	}
	return true;
}

export { 
	savePostedArticleWithoutContents,
	savePostedArticleContent,
	loadPostedArticle,
	loadPostedArticles,
	loadPostedArticleContent,
	checkIfContentAlreadyPostedForArticle,
	prefixText,
	stripHTMLElements,
	savePostToJSON,
	log
};