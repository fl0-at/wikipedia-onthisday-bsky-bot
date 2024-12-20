import dotenv from 'dotenv';
import fs from 'fs/promises';
import fsSync from 'fs';
import { Article, BlueskyPost, Content } from '../classes/classes';
import { ContentType, LogLevel } from '../utils/enums';
import parse from 'node-html-parser';
import { Link, Articles, Postings } from '../utils/interfaces';
dotenv.config();

const DB_PATH = process.env.DB_PATH || './database';
const ARTICLES_FILENAME = process.env.ARTICLES_FILENAME || 'articles.json';
const POSTINGS_FILENAME = process.env.POSTINGS_FILENAME || 'postings.json';
const LOG_LEVEL = process.env.LOG_LEVEL || LogLevel.INFO;
const LOG_DIR = process.env.LOG_DIR || './logs';
const LOG_NAME = process.env.LOG_NAME || 'wikipedia-otd-bsky-bot';
const LOG_TO_FILE = process.env.LOG_TO_FILE || false;
const wikiURL = process.env.WIKIPEDIA_MAIN_URL || 'https://en.wikipedia.org';
log('LOGGER', 'LogLevel is turned to', LOG_LEVEL);

dotenv.config();

async function initializeDb() {
	try {
		log(LogLevel.DEBUG, 'Initializing DB...');
		await fs.writeFile(
			DB_PATH + '/' + ARTICLES_FILENAME,
			JSON.stringify(JSON.parse('{"articles": []}'), null, 2)
		);
	} catch (error) {
		if (error.code === 'ENOENT') {
			await fs.mkdir(DB_PATH);
			await initializeDb();
		} else {
			log(LogLevel.CRITICAL, 'Failed to initialize DB:', error);
			throw new Error(`Failed to initialize DB: ${error}`);
		}
	}
}

async function loadFromDb() {
	try {
		const fileContent: string = await fs.readFile(DB_PATH + '/' + ARTICLES_FILENAME, 'utf-8');

		// if the file is empty, initialize our DB
		if (fileContent === '') {
			await initializeDb();
		}

		const DB: Articles = JSON.parse(fileContent);
		return DB;
	} catch (error) {
		if (error.code === 'ENOENT') {
			await initializeDb();
			return JSON.parse(await fs.readFile(DB_PATH + '/' + ARTICLES_FILENAME, 'utf-8'));
		} else {
			log(LogLevel.CRITICAL, 'Failed to load DB from local filesystem:', error);
		}
	}

}

async function saveToDb(DB) {
	try {
		await fs.writeFile(DB_PATH + '/' + ARTICLES_FILENAME, JSON.stringify(DB, null, 2), 'utf-8');
	} catch (error) {
		log(LogLevel.CRITICAL, 'Failed to save DB to local filesystem:', error);
	}
}

// save posted articles to local file
async function saveArticleWithoutContents(article: Article) {
	try {
		// need to just write the "bare" article, without contents
		const articleWithoutContent: Article = new Article(article.id, []);
		log(LogLevel.DEBUG, 'Saving barebones article to DB:', articleWithoutContent);

		// load the DB
		const DB: Articles = await loadFromDb();

		log(LogLevel.TRACE, 'Reading DB through FS:', await fs.readFile(DB_PATH + '/' + ARTICLES_FILENAME, 'utf-8'));
		log(LogLevel.TRACE, 'DB.articles:', DB.articles);
		// check if the article ID exists already
		if (DB.articles != undefined && DB.articles.find((art: { id: string }) => art.id === articleWithoutContent.id)) {
			return;
		}
		DB.articles.push(articleWithoutContent);
		await saveToDb(DB);
	} catch (error) {
		if (error.code === 'ENOENT') {
			await initializeDb();
			await saveArticleWithoutContents(article);
		} else {
			log(LogLevel.ERROR, 'Failed to save article:', error);
		}
	}
}

// save posted content of article to local file
async function saveArticleContent(article: Article, content: Content) {
	try {

		// load the DB
		const DB: Articles = await loadFromDb();

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
async function loadArticles(): Promise<Article[]> {
	try {

		// load the DB
		const DB: Articles = await loadFromDb();
		const allArticles: Array<Article> = DB.articles;
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
async function loadArticle(id: string): Promise<Article> {
	try {

		// load the DB
		const DB: Articles = await loadFromDb();
		const article: Article | null = DB.articles.find((art: { id: string }) => art.id === id);
		if (article === undefined || article === null) return null;
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
async function loadArticleContent(article: Article): Promise<Content[]> {
	try {
		// need to just read that one article
		//const articleFromDB: Article = DB.articles.find((art: { id: string }) => art.id === article.id);
		const articleFromDB: Article | null = await loadArticle(article.id);
		if (articleFromDB === null) return [];
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
		//const postedArticle: Article = DB.articles.find((art: { id: string }) => art.id === article.id);
		const postedArticle: Article | null = await loadArticle(article.id);
		if (postedArticle === null || postedArticle === undefined) return false;
		const postedArticleContentList: Array<Content> = await loadArticleContent(postedArticle);
		const postedContent: Content = postedArticleContentList.find((posCon: { value: string, type: ContentType }) => posCon.type === content.type && posCon.value === content.value);
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

// strip all HTML elements of the content and decorate the text
async function stripHTMLElementsAndDecorateText(content: string) {
	let contentRaw = content;

	// first, create a link collection object so we
	// don't lose the context of the links
	const linkCollection = new Array<Link>;
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
		log(LogLevel.DEBUG, 'linkText:', aHref.innerText, 'wikiURL:', wikiURL + aHref.getAttribute('href'));
	}

	// strip weird characters

	// \n
	contentRaw = contentRaw.replace('\n', '');

	// &#160;
	contentRaw = contentRaw.replace('&#160;', ' ');

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
		//contentRaw = contentRaw.replace(')', '');
	}

	// <b>
	const boldHTMLNodes = parse(contentRaw).querySelectorAll('b');
	for (const boldNode of boldHTMLNodes) {
		contentRaw = contentRaw.replace(boldNode.toString(), boldNode.innerHTML);
	}

	// <abbr>
	const abbrHTMLNodes = parse(contentRaw).querySelectorAll('abbr');
	for (const abbrNode of abbrHTMLNodes) {
		if (abbrNode.innerHTML.includes('b.')) {
			contentRaw = contentRaw.replace(abbrNode.toString(), abbrNode.innerHTML).replace('b.', `was born <<YEARSAGO>> (`)
		} else if (abbrNode.innerHTML.includes('d.')) {
			contentRaw = contentRaw.replace(abbrNode.toString(), abbrNode.innerHTML).replace('d.', `died <<YEARSAGO>> (`)
		}
	}

	// need to strip <i> completely - usually the 
	// feed tells us that for this post there is
	// a picture that goes with this
	// future improvement - make a separate type of post
	// for the "featured" event of the day with the picture
	const iHTMLNodes = parse(contentRaw).querySelectorAll('i');
	for (const i of iHTMLNodes) {
		contentRaw = contentRaw.replace(' '+i.toString(), '');
	}

	// to clean up, let's replace all "double spaces"
	// with single ones and make sure there are no
	// spaces before or after parentheses
	contentRaw = contentRaw.replace('  ', ' ');
	contentRaw = contentRaw.replace('( ', '(');
	contentRaw = contentRaw.replace(' )', ')');

	// if the content includes either <<YEARSAGO>>
	// we want to replace <<YEARSAGO>> with the number of years
	if (contentRaw.includes('<<YEARSAGO>>')) {
		const yearString: string = contentRaw.match(/\((\d+)\)/)[0].toString().replace('(', '').replace(')', '');
		log(LogLevel.TRACE, 'Year of anniversary as string:', yearString);
		const year: number = Number(yearString);
		log(LogLevel.TRACE, 'Year of anniversary:', year);
		const yearsAgo: number = new Date().getUTCFullYear() - year;
		log(LogLevel.DEBUG, 'Difference in years to today:', yearsAgo);
		contentRaw = contentRaw.replace('<<YEARSAGO>>', yearsAgo.toString() + ' years ago');
	}

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
	const articleContents = await loadArticleContent(article);
	log(LogLevel.TRACE, 'Loaded article contents:', JSON.stringify(articleContents, null, 2));
	const todayContent: Content = JSON.parse(JSON.stringify(articleContents)).find((cont: { type: ContentType, value: string }) => cont.type === ContentType.todayText);
	log(LogLevel.TRACE, 'Fetched todayContent:', JSON.stringify(todayContent, null, 2));
	const todayText = todayContent.value;
	log(LogLevel.TRACE, 'todayText:', todayText);
	log(LogLevel.DEBUG, 'Trying to prefix content...');

	// depending on the content, we will build our posts differently
	let prefixedText = '';
	let prefixedContent = content.value;

	switch (content.type) {
		case ContentType.anniversary:
			// we want to prefix the line with an emoji, depending on whether the person died or was born
			if(content.value.includes('<abbr title=\"born\">')) {
				prefixedContent = '<<BORN>> ' + prefixedContent;
			} else if(content.value.includes('<abbr title=\"died\">')) {
				prefixedContent = '<<DIED>> ' + prefixedContent;
			}
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

async function savePostToJSON(newPost: BlueskyPost) {
	try {
		// load the saved postings file if it exists
		const pFromFile: Postings = JSON.parse((await fs.readFile(DB_PATH + '/' + POSTINGS_FILENAME)).toString());
		const pArr: Array<BlueskyPost> = [];
		if (pFromFile.postings.length > 0) {
			const postings: Array<BlueskyPost> = pFromFile.postings;
			for (const posting of postings) {
				pArr.push(posting);
			}
		}
		pArr.push(newPost);
		const postings: Array<BlueskyPost> = pArr;
		const pJSON = {
			postings
		}
		await fs.writeFile(DB_PATH + '/' + POSTINGS_FILENAME, JSON.stringify(pJSON, null, 2));

	} catch (error) {
		if (error.code === 'ENOENT') {
			// this means the postings file does not exist yet
			// we need to create it
			log(LogLevel.DEBUG, 'Creating new postings file...');
			await fs.writeFile(DB_PATH + '/' + POSTINGS_FILENAME, JSON.stringify(JSON.parse('{"postings": []}'), null, 2));
			await savePostToJSON(newPost);
		} else {
			log(LogLevel.ERROR, 'Failed to save post to JSON:', error);
		}
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function log(level: LogLevel | string, message: string, ...optionalParams: any[]) {
	try {
		const now = new Date().toISOString();
		const today = now.split('T')[0];
		const logMsgPrefix = `[${now}][${level}]\t\t:`;
		if (LOG_TO_FILE) {
			if (!fsSync.existsSync(LOG_DIR)) {
				await fs.mkdir(LOG_DIR);
			}
		}
		let additionalInfo = '';
		if (optionalParams.length > 0) {
			additionalInfo = optionalParams.join(' ');
		}
		switch (level) {
			case LogLevel.CRITICAL:
				console.error(logMsgPrefix + ` ${message}`, ...optionalParams);
				if (LOG_TO_FILE) await fs.appendFile(`${LOG_DIR}/${LOG_NAME}-${today}.log`, `${logMsgPrefix} ${message} ${additionalInfo}\n`, 'utf-8');
				break;
			case LogLevel.ERROR:
				if (LOG_LEVEL != LogLevel.CRITICAL) { 
					console.error(logMsgPrefix + ` ${message}`, ...optionalParams); 
					await fs.appendFile(`${LOG_DIR}/${LOG_NAME}-${today}.log`, `${logMsgPrefix} ${message} ${additionalInfo}\n`, 'utf-8');
				}
				break;
			case LogLevel.WARNING:
				if (LOG_LEVEL != LogLevel.CRITICAL && LOG_LEVEL != LogLevel.ERROR) {
					console.warn(logMsgPrefix + ` ${message}`, ...optionalParams);
					await fs.appendFile(`${LOG_DIR}/${LOG_NAME}-${today}.log`, `${logMsgPrefix} ${message} ${additionalInfo}\n`, 'utf-8');}
				break;
			case LogLevel.INFO:
				if (LOG_LEVEL != LogLevel.CRITICAL && LOG_LEVEL != LogLevel.ERROR && LOG_LEVEL != LogLevel.WARNING) {
					console.info(logMsgPrefix + ` ${message}`, ...optionalParams);
					await fs.appendFile(`${LOG_DIR}/${LOG_NAME}-${today}.log`, `${logMsgPrefix} ${message} ${additionalInfo}\n`, 'utf-8');
				}
				break;
			case LogLevel.DEBUG:
				if (LOG_LEVEL === LogLevel.DEBUG || LOG_LEVEL === LogLevel.TRACE) {
					console.debug(logMsgPrefix + ` ${message}`, ...optionalParams);
					await fs.appendFile(`${LOG_DIR}/${LOG_NAME}-${today}.log`, `${logMsgPrefix} ${message} ${additionalInfo}\n`, 'utf-8');
				}
				break;
			case LogLevel.TRACE:
				if (LOG_LEVEL === LogLevel.TRACE) {
					console.debug(logMsgPrefix + ` ${message}`, ...optionalParams);
					await fs.appendFile(`${LOG_DIR}/${LOG_NAME}-${today}.log`, `${logMsgPrefix} ${message} ${additionalInfo}\n`, 'utf-8');
				}
				break;
			default:
				console.log(logMsgPrefix + ` ${message}`, ...optionalParams);
				if (LOG_TO_FILE) await fs.appendFile(`${LOG_DIR}/${LOG_NAME}-${today}.log`, `${logMsgPrefix} ${message} ${additionalInfo}\n`, 'utf-8');
				break;
		}
	} catch (error) {
		throw new Error(`Unable to log either to console or to file: [${new Date().toISOString()}] ${error}`);
	}
	return true;
}

export {
	saveArticleWithoutContents,
	saveArticleContent,
	loadArticle,
	loadArticles,
	loadArticleContent,
	checkIfContentAlreadyPostedForArticle,
	prefixText,
	stripHTMLElementsAndDecorateText,
	savePostToJSON,
	log
};