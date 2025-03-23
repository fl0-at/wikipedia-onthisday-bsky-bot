import dotenv from 'dotenv';
import fs from 'fs/promises';
import fsSync from 'fs';
import parse from 'node-html-parser';
import { Article, BlueskyPost, Content } from '../classes/classes';
import { ContentType, LogLevel } from '../utils/enums';
import { Link, Articles, Posts } from '../utils/interfaces';
dotenv.config();

const DB_PATH = process.env.DB_PATH || './database';
const ARTICLES_FILENAME = process.env.ARTICLES_FILENAME || 'articles.json';
const POSTS_FILENAME = process.env.POSTS_FILENAME || 'posts.json';
const LOG_LEVEL = process.env.LOG_LEVEL || LogLevel.INFO;
const LOG_DIR = process.env.LOG_DIR || './logs';
const LOG_NAME = process.env.LOG_NAME || 'wikipedia-otd-bsky-bot';
const LOG_TO_FILE = process.env.LOG_TO_FILE || false;
const WIKI_URL = process.env.WIKIPEDIA_MAIN_URL || 'https://en.wikipedia.org';

log("INIT", 'Initializing', JSON.parse(fsSync.readFileSync('package.json', 'utf-8')).name + ' v' + JSON.parse(fsSync.readFileSync('package.json', 'utf-8')).version);
log('LOGGER', 'LogLevel is turned to', LOG_LEVEL);

dotenv.config();

/**
 * @typedef {import('../classes/classes').Article} Article
 * @typedef {import('../classes/classes').Content} Content
 * @typedef {import('../classes/classes').BlueskyPost} BlueskyPost
 * @typedef {import('../utils/interfaces').Link} Link
 * @typedef {import('../utils/interfaces').Articles} Articles
 * @typedef {import('../utils/interfaces').Posts} Posts
 * @typedef {import('../utils/enums').LogLevel} LogLevel
 * @typedef {import('../utils/enums').ContentType} ContentType
 */

/**
 * Initialize the JSON file
 * @returns {Promise<void>}
 */
async function initializeJSON(filename: string): Promise<void> {
	try {
		log(LogLevel.DEBUG, 'Determining file type...');
		switch (filename) {
			case ARTICLES_FILENAME:
				log(LogLevel.DEBUG, `Initializing ${filename}...`);
				await fs.writeFile(
					DB_PATH + '/' + filename,
					JSON.stringify(JSON.parse('{"articles": []}'), null, 2)
				);
				break;
			case POSTS_FILENAME:
				log(LogLevel.DEBUG, `Initializing ${filename}...`);
				await fs.writeFile(
					DB_PATH + '/' + filename,
					JSON.stringify(JSON.parse('{"posts": []}'), null, 2)
				);
				break;
			default:
				log(LogLevel.ERROR, 'Invalid filename:', filename);
				throw new Error(`Invalid filename: ${filename}`);
				break;
		}
	} catch (error) {
		if (error.code === 'ENOENT') {
			await fs.mkdir(DB_PATH);
			await initializeJSON(filename);
		} else {
			log(LogLevel.CRITICAL, `Failed to initialize ${filename}:`, error);
			throw new Error(`Failed to initialize ${filename}: ${error}`);
		}
	}
}

/**
 * Load the JSON file
 * @returns {Promise<Articles|Posts|void>}
 */
async function loadFromJSON(filename: string): Promise<Articles|Posts|void> {
	try {
		const fileContent: string = await fs.readFile(DB_PATH + '/' + filename, 'utf-8');

		// if the file is empty, initialize the JSON file
		if (fileContent === '') {
			await initializeJSON(filename);
		}
		
		switch (filename) {
			case ARTICLES_FILENAME:
				return JSON.parse(fileContent) as Articles;
			case POSTS_FILENAME:				
				return JSON.parse(fileContent) as Posts;
			default:
				throw new Error(`Invalid filename: ${filename}`);
		}
	} catch (error) {
		if (error.code === 'ENOENT') {
			await initializeJSON(filename);
			return JSON.parse(await fs.readFile(DB_PATH + '/' + filename, 'utf-8'));
		} else {
			log(LogLevel.CRITICAL, `Failed to load ${filename} from local filesystem:`, error);
			return;
		}
	}

}

/**
 * Saves articles to JSON
 * @param {Articles} obj - The articles to be saved to JSON
 */
async function saveToJSON(obj: Articles): Promise<void>;
/**
 * Saves posts to JSON
 * @param {Posts} obj - The posts to be saved to JSON
 */
async function saveToJSON(obj: Posts): Promise<void>;
/**
 * Save the object to the database
 * @param {Articles|Posts} obj - The object to be saved
 * @returns {Promise<void>}
 */
async function saveToJSON(obj: Articles|Posts): Promise<void> {
	try {
		let filename: string = undefined;
		if (isArticles(obj)) {
			log(LogLevel.DEBUG, 'Determined file type:', 'Articles');
			filename = ARTICLES_FILENAME;
		} else if (isPosts(obj)) {
			log(LogLevel.DEBUG, 'Determined file type:', 'Posts');
			filename = POSTS_FILENAME;
		} else {
			log(LogLevel.ERROR, 'Failed to determine file type!');
			throw new Error('Invalid object type');
		}
		// write the file
		if(!filename || filename === undefined) {
			log(LogLevel.ERROR, 'Invalid file name:', filename);
			throw new Error(`Invalid file name: ${filename}`);
		}		
		log(LogLevel.DEBUG, 'Trying to write file:', DB_PATH + '/' + filename);
		await fs.writeFile(DB_PATH + '/' + filename, JSON.stringify(obj, null, 2), 'utf-8');
	} catch (error) {
		log(LogLevel.CRITICAL, `Failed to save ${typeof obj} ${JSON.stringify(obj,null,2)} to local filesystem:`, error);
	}
}

function isArticles(obj: Articles|Posts): obj is Articles {
	return (obj as Articles).articles !== undefined;
}

function isPosts(obj: Articles|Posts): obj is Posts {
	return (obj as Posts).posts !== undefined;
}

async function markArticleContentAsPosted(article: Article, content: Content): Promise<void> {
	try {
		// load articles
		let loadedArticles = await loadArticles();
		
		// find the article we need to update
		const articleToUpdate: Article = loadedArticles.find((art: { id: string }) => art.id === article.id);

		// find the content we need to update
		const contentToUpdate: Content = articleToUpdate.contentList.find((con: Content) => con.value === content.value);

		// update the content to posted: true
		contentToUpdate.alreadyPosted = true;

		// update the article's content list
		articleToUpdate.contentList = articleToUpdate.contentList.map(c => c.value !== contentToUpdate.value ? c : contentToUpdate);

		// update the article array
		loadedArticles = loadedArticles.map(a => a.id !== articleToUpdate.id ? a : articleToUpdate );

		// create new articles JSON obj
		const articles: Articles = { articles: loadedArticles };

		// save the articles again
		await saveToJSON(articles);
		
	} catch (error) {
		log(LogLevel.ERROR, `Failed to mark content inside article as "posted":`, error);
		throw new Error(`Failed to mark content inside article as "posted": ${error}`);
	}
	return;
}

/**
 * A helper function to get a blob from an image URI
 * @param {string} imgUri - The URI of the image you want to receive a blob for
 * @returns {Promise<Blob>}
 */
async function getBlobFromImgUri(imgUri: string): Promise<Blob> {
	log(LogLevel.DEBUG, 'Received img URI:', imgUri);
	const blob: Promise<Blob> = (await fetch(imgUri)).blob();
	log(LogLevel.DEBUG, 'Fetched blob:', await blob);
	return blob;
}

/**
 * Save the article to a JSON file
 * @param {Article} article 
 * @returns {Promise<void>}
 */
async function saveArticleToJSON(article: Article): Promise<void> {
	try {
		// we will save the entire article to a JSON file
		const newArticle: Article = new Article(article.id, article.url, article.contentList);
		log(LogLevel.DEBUG, 'Saving article to JSON:', newArticle);

		// load the JSON file
		const articleJSON: Articles = await loadFromJSON(ARTICLES_FILENAME) as Articles;

		log(LogLevel.TRACE, 'Reading JSON through FS:', await fs.readFile(DB_PATH + '/' + ARTICLES_FILENAME, 'utf-8'));
		log(LogLevel.TRACE, 'articleJSON.articles:', articleJSON.articles);
		// check if the article ID exists already
		if (articleJSON.articles != undefined && articleJSON.articles.find((art: { id: string }) => art.id === newArticle.id)) {
			return;
		}
		articleJSON.articles.push(newArticle);
		await saveToJSON(articleJSON);
	} catch (error) {
		if (error.code === 'ENOENT') {
			await initializeJSON(ARTICLES_FILENAME);
			await saveArticleToJSON(article);
		} else {
			log(LogLevel.ERROR, 'Failed to save article:', error);
		}
	}
}

/**
 * Save the article without contents to the database
 * @param {Article} article 
 * @returns {Promise<void>}
 */
async function saveArticleWithoutContents(article: Article): Promise<void> {
	try {
		// need to just write the "bare" article, without contents
		const articleWithoutContent: Article = new Article(article.id, article.url, []);
		log(LogLevel.DEBUG, 'Saving barebones article to JSON:', articleWithoutContent);

		// load the JSON file
		const json: Articles = await loadFromJSON(ARTICLES_FILENAME) as Articles;

		log(LogLevel.TRACE, 'Reading DB through FS:', await fs.readFile(DB_PATH + '/' + ARTICLES_FILENAME, 'utf-8'));
		log(LogLevel.TRACE, 'DB.articles:', json.articles);
		// check if the article ID exists already
		if (json.articles != undefined && json.articles.find((art: { id: string }) => art.id === articleWithoutContent.id)) {
			return;
		}
		json.articles.push(articleWithoutContent);
		await saveToJSON(json);
	} catch (error) {
		if (error.code === 'ENOENT') {
			await initializeJSON(ARTICLES_FILENAME);
			await saveArticleWithoutContents(article);
		} else {
			log(LogLevel.ERROR, 'Failed to save article:', error);
		}
	}
}

/**
 * Save the article content to the database
 * @param {Article} article 
 * @param {Content} content 
 * @returns {Promise<void>}
 */
async function saveArticleContent(article: Article, content: Content): Promise<void> {
	try {

		// load the JSON file
		const json: Articles = await loadFromJSON(ARTICLES_FILENAME) as Articles;

		// need to add content to article
		const indexForUpdate = json.articles.findIndex((art: { id: string }) => art.id === article.id);
		if (indexForUpdate === -1) throw new Error(`Cannot find article with ID ${article.id}`);

		const curArt = new Article(article.id, article.url, json.articles[indexForUpdate].contentList);
		// need to check if to be saved content already exists
		let isDuplicateContent = false;
		for (const con of json.articles[indexForUpdate].contentList) {
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
		log(LogLevel.TRACE, 'Saving the following content list:', json.articles[indexForUpdate].contentList);

		json.articles[indexForUpdate] = curArt;
		log(LogLevel.TRACE, 'Saving the following JSON to local FS:', json);
		await saveToJSON(json);

	} catch (error) {
		log(LogLevel.ERROR, 'Failed to save posted article content:', error);
	}
}

/**
 * Load all articles
 * @returns {Promise<Article[]>}
 */
async function loadArticles(): Promise<Article[]> {
	try {

		// load the JSON file
		const json: Articles = await loadFromJSON(ARTICLES_FILENAME) as Articles;
		const allArticles: Array<Article> = json.articles;
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

/**
 * Load a single article from the database
 * @param {string} id 
 * @returns {Promise<Article>}
 */
async function loadArticle(id: string): Promise<Article> {
	try {

		// load the JSON file
		const json: Articles = await loadFromJSON(ARTICLES_FILENAME) as Articles;
		const article: Article | null = json.articles.find((art: { id: string }) => art.id === id);
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

/**
 * Load the article content from the database
 * @param {Article} article 
 * @returns {Promise<Content[]>}
 */
async function loadArticleContent(article: Article): Promise<Content[]> {
	try {
		// need to just read that one article
		const loadedArticle: Article | null = await loadArticle(article.id);
		if (loadedArticle === null) return [];
		return loadedArticle.contentList;
	} catch (error) {
		if (error.code === 'ENOENT') {
			return [];
		} else {
			log(LogLevel.ERROR, 'Failed to load posted contents for article:', error);
			return [];
		}
	}
}

/**
 * Check if the content has already been posted for the article
 * @param {Article} article 
 * @param {Content} content 
 * @returns {Promise<boolean>}
 * @deprecated This function has been deprecated as of 1.1.0
 */
async function checkIfContentAlreadyPostedForArticle(article: Article, content: Content): Promise<boolean> {
	try {
		// need to just read that one article
		const postedArticle: Article | null = await loadArticle(article.id);
		if (postedArticle === null || postedArticle === undefined) return false;
		const postedArticleContentList: Array<Content> = await loadArticleContent(postedArticle);
		const postedContent: Content = postedArticleContentList.find((posCon: { value: string, type: ContentType }) => posCon.type === content.type && posCon.value === content.value);
		if (!postedContent.alreadyPosted) return false;
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

/**
 * Strip the HTML elements from content and decorate text
 * @param {string} content 
 * @returns {Promise<{contentRaw: string, linkCollection: Link[]}>}
 */
async function stripHTMLElementsAndDecorateText(content: string): Promise<{ contentRaw: string; linkCollection: Link[]; }> {
	let contentRaw = content;

	// strip weird characters

	// \n
	contentRaw = contentRaw.replace('\n', '');

	// &#160;
	contentRaw = contentRaw.replace('&#160;', ' ');
	contentRaw = contentRaw.replace('&#8722;', '−');

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

	// need to strip <i> only if it references a picture 
	// that goes with the post
	const iHTMLNodes = parse(contentRaw).querySelectorAll('i');
	for (const i of iHTMLNodes) {
		// bugfix for issue #1:
		// https://github.com/fl0-at/wikipedia-onthisday-bsky-bot/issues/1
		if (i.innerHTML.includes('pictured')) {
			contentRaw = contentRaw.replace(i.toString(), '');
		} else {
			contentRaw = contentRaw.replace(i.toString(), i.innerHTML);
		}
	}

	// future improvement - make a separate type of post
	// for the "featured" event of the day with the picture
	/*
		maybe in the future we could 
		parse the picture and attach it 
		to the post somehow?
	*/

	// <sup> and <sub>
	// this is a bit tricky, because we need to replace
	// the HTML tags for superscript and subscript with
	// actual characters in unicode, using custom functions
	// bugfix for issue #4:
	// https://github.com/fl0-at/wikipedia-onthisday-bsky-bot/issues/4
	const supHTMLNodes = parse(contentRaw).querySelectorAll('sup');
	for (const sup of supHTMLNodes) {
		contentRaw = contentRaw.replace(sup.toString(), await convertToSuperscript(sup.innerHTML));
	}
	const subHTMLNodes = parse(contentRaw).querySelectorAll('sub');
	for (const sub of subHTMLNodes) {
		contentRaw = contentRaw.replace(sub.toString(), await convertToSubscript(sub.innerHTML));
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

	// moved the link collection creation to the end of our function
	// as part of bugfix for issue #2:
	// https://github.com/fl0-at/wikipedia-onthisday-bsky-bot/issues/2

	// let's create a link collection object 
	// so we don't lose the context of the links
	const linkCollection = new Array<Link>;
	const aHrefNodes = parse(contentRaw).querySelectorAll('a');

	// push those links into a link collection
	// and then replace HTML links with text only
	for (const aHref of aHrefNodes) {
		linkCollection.push({
			text: aHref.innerText,
			url: WIKI_URL + aHref.getAttribute('href')
		});
		// strip the HTML tags and replace with just the text
		contentRaw = contentRaw.replace(aHref.toString(), aHref.innerText);
		log(LogLevel.DEBUG, 'linkText:', aHref.innerText, 'WIKI_URL:', WIKI_URL + aHref.getAttribute('href'));
	}

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

/**
 * Convert text to subscript
 * @param {string} text 
 * @returns {Promise<string>}
 */
async function convertToSubscript(text: string): Promise<string> {
    for (const character of text) {
        let subscriptCharacter = character;
        switch (character) {
            case '0':
                // ₀
                subscriptCharacter = '₀';
                break;
            case '1':
                // ₁
                subscriptCharacter = '₁';
                break;
            case '2':
                // ₂
                subscriptCharacter = '₂';
                break;
            case '3':
                // ₃
                subscriptCharacter = '₃';
                break;
            case '4':
                // ₄
                subscriptCharacter = '₄';
                break;
            case '5':
                // ₅
                subscriptCharacter = '₅';
                break;
            case '6':
                // ₆
                subscriptCharacter = '₆';
                break;
            case '7':
                // ₇
                subscriptCharacter = '₇';
                break;
            case '8':
                // ₈
                subscriptCharacter = '₈';
                break;
            case '9':
                // ₉
                subscriptCharacter = '₉';
                break;
            case '+':
                // ₊
                subscriptCharacter = '₊';
                break;
            case '-':
                // ₋
                subscriptCharacter = '₋';
                break;
            case '=':
                // ₌
                subscriptCharacter = '₌';
                break;
            case '(':
                // ₍
                subscriptCharacter = '₍';
                break;
            case ')':
                // ₎
                subscriptCharacter = '₎';
                break;
            case 'a':
                // ₐ
                subscriptCharacter = 'ₐ';
                break;
            case 'e':
                // ₑ
                subscriptCharacter = 'ₑ';
                break;
            case 'h':
                // ₕ
                subscriptCharacter = 'ₕ';
                break;
            case 'i':
                // ᵢ
                subscriptCharacter = 'ᵢ';
                break;
            case 'j':
                // ⱼ
                subscriptCharacter = 'ⱼ';
                break;
            case 'k':
                // ₖ
                subscriptCharacter = 'ₖ';
                break;
            case 'l':
                // ₗ
                subscriptCharacter = 'ₗ';
                break;
            case 'm':
                // ₘ
                subscriptCharacter = 'ₘ';
                break;
            case 'n':
                // ₙ
                subscriptCharacter = 'ₙ';
                break;
            case 'o':
                // ₒ
                subscriptCharacter = 'ₒ';
                break;
            case 'p':
                // ₚ
                subscriptCharacter = 'ₚ';
                break;
            case 'r':
                // ᵣ
                subscriptCharacter = 'ᵣ';
                break;
            case 's':
                // ₛ
                subscriptCharacter = 'ₛ';
                break;
            case 't':
                // ₜ
                subscriptCharacter = 'ₜ';
                break;
            case 'u':
                // ᵤ
                subscriptCharacter = 'ᵤ';
                break;
            case 'v':
                // ᵥ
                subscriptCharacter = 'ᵥ';
                break;
            case 'x':
                // ₓ
                subscriptCharacter = 'ₓ';
                break;
            default:
                break;
        }
        text = text.replace(character, subscriptCharacter);
    }
    
    return text;
}

/**
 * Convert text to superscript
 * @param {string} text 
 * @returns {Promise<string>}
 */
async function convertToSuperscript(text: string): Promise<string> {
	
	for (const character of text) {
		let superscriptCharacter = character;
		switch (character) {
			case '0':
				// ⁰
				superscriptCharacter = '⁰';
				break;
			case '1':
				// ¹
				superscriptCharacter = '¹';
				break;
			case '2':
				// ²
				superscriptCharacter = '²';
				break;
			case '3':
				// ³
				superscriptCharacter = '³';
				break;
			case '4':
				// ⁴
				superscriptCharacter = '⁴';
				break;
			case '5':
				// ⁵
				superscriptCharacter = '⁵';
				break;
			case '6':
				// ⁶
				superscriptCharacter = '⁶';
				break;
			case '7':
				// ⁷
				superscriptCharacter = '⁷';
				break;
			case '8':
				// ⁸
				superscriptCharacter = '⁸';
				break;
			case '9':
				// ⁹
				superscriptCharacter = '⁹';
				break;
			case '+':
				// ⁺
				superscriptCharacter = '⁺';
				break;
			case '-':
				// ⁻
				superscriptCharacter = '⁻';
				break;
			case '=':
				// ⁼
				superscriptCharacter = '⁼';
				break;
			case '(':
				// ⁽
				superscriptCharacter = '⁽';
				break;
			case ')':
				// ⁾
				superscriptCharacter = '⁾';
				break;
			case 'a':
				// ᵃ
				superscriptCharacter = 'ᵃ';
				break;
			case 'b':
				// ᵇ
				superscriptCharacter = 'ᵇ';
				break;
			case 'c':
				// ᶜ
				superscriptCharacter = 'ᶜ';
				break;
			case 'd':
				// ᵈ
				superscriptCharacter = 'ᵈ';
				break;
			case 'e':
				// ᵉ
				superscriptCharacter = 'ᵉ';
				break;
			case 'f':
				// ᶠ
				superscriptCharacter = 'ᶠ';
				break;
			case 'g':
				// ᵍ
				superscriptCharacter = 'ᵍ';
				break;
			case 'h':
				// ʰ
				superscriptCharacter = 'ʰ';
				break;
			case 'i':
				// ⁱ
				superscriptCharacter = 'ⁱ';
				break;
			case 'j':
				// ʲ
				superscriptCharacter = 'ʲ';
				break;
			case 'k':
				// ᵏ
				superscriptCharacter = 'ᵏ';
				break;
			case 'l':
				// ˡ
				superscriptCharacter = 'ˡ';
				break;
			case 'm':
				// ᵐ
				superscriptCharacter = 'ᵐ';
				break;
			case 'n':
				// ⁿ
				superscriptCharacter = 'ⁿ';
				break;
			case 'o':
				// ᵒ
				superscriptCharacter = 'ᵒ';
				break;
			case 'p':
				// ᵖ
				superscriptCharacter = 'ᵖ';
				break;
			case 'r':
				// ʳ
				superscriptCharacter = 'ʳ';
				break;
			case 's':
				// ˢ
				superscriptCharacter = 'ˢ';
				break;
			case 't':
				// ᵗ
				superscriptCharacter = 'ᵗ';
				break;
			case 'u':
				// ᵘ
				superscriptCharacter = 'ᵘ';
				break;
			case 'v':
				// ᵛ
				superscriptCharacter = 'ᵛ';
				break;
			case 'w':
				// ʷ
				superscriptCharacter = 'ʷ';
				break;
			case 'x':
				// ˣ
				superscriptCharacter = 'ˣ';
				break;
			case 'y':
				// ʸ
				superscriptCharacter = 'ʸ';
				break;
			case 'z':
				// ᶻ
				superscriptCharacter = 'ᶻ';
				break;
			default:
				break;
		}
		text = text.replace(character, superscriptCharacter);
	}

	return text;
}

/**
 * Prefix the text with the "todayText"
 * @param {Article} article 
 * @param {Content} content 
 * @returns {Promise<string>}
 */
async function prefixText(article: Article, content: Content): Promise<string> {
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
			if(content.value.includes('<abbr title="born">')) {
				prefixedContent = '<<BORN>> ' + prefixedContent;
			} else if(content.value.includes('<abbr title="died">')) {
				prefixedContent = '<<DIED>> ' + prefixedContent;
			}
			prefixedText = '#Anniversary - #OnThisDay, ' + todayText + ':\n\n' + prefixedContent;
			break;
		case ContentType.event:
			prefixedContent = prefixedContent.replace('</a> – ', '</a>:\n\n');
			prefixedText = '#OnThisDay, ' + todayText + ' in ' + prefixedContent;
			break;
		case ContentType.featuredEvent:
			prefixedContent = prefixedContent.replace('</a> – ', '</a>:\n\n');
			prefixedText = '#PicOfTheDay - #OnThisDay, ' + todayText + ' in ' + prefixedContent;
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
 * Decorates the text and replaces certain placeholders with emojis
 * and other decorations
 * @param {string} text the text you want to decorate
 * @returns {Promise<string>} the decorated text
 */
async function decorateText(text: string): Promise<string> {
	let decoratedText = text.replace('<<CALENDAR>> ', '📅 ');
	decoratedText = decoratedText.replace('<<BORN>>', '🚼');
	decoratedText = decoratedText.replace('<<DIED>>', '✝');

	return decoratedText;
}

async function savePostToJSON(newPost: BlueskyPost) {
	try {
		// load the saved postings file if it exists
		const pFromFile: Posts = await loadFromJSON(POSTS_FILENAME) as Posts;
		// create a new array to hold the posts
		const pArr: Array<BlueskyPost> = [];
		if (pFromFile.posts.length > 0) {
			const postList: Posts = { "posts": pFromFile.posts };
			for (const post of postList.posts) {
				pArr.push(post);
			}
		}
		pArr.push(newPost);
		const posts: Posts = { "posts": pArr };
		await saveToJSON(posts);
	} catch (error) {
		if (error.code === 'ENOENT') {
			// this means the posts file does not exist yet
			// we need to create it
			log(LogLevel.DEBUG, 'Creating new posts file...');
			await initializeJSON(POSTS_FILENAME);
			await savePostToJSON(newPost);
		} else {
			log(LogLevel.ERROR, 'Failed to save post to JSON:', error);
		}
	}
}

/**
 * Log a message to the console and optionally to a file
 * @param {LogLevel | string} level - The log level
 * @param {string} message - The message to log
 * @param {any[]} optionalParams - Optional parameters
 * @returns {Promise<void>}
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function log(level: LogLevel | string, message: string, ...optionalParams: any[]): Promise<void> {
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
	return;
}

/**
 * Verify the cron notation
 * @param {string} cron - The cron schedule
 * @returns {boolean}
 */
function isValidCronNotation(cron: string): boolean {
	if (cron === '' || cron === undefined || cron === null) {
		log(LogLevel.WARNING, 'Empty cron schedule detected!');
		log(LogLevel.WARNING, 'Using default values instead...');
		return false;
	}
	const regEx = /((((\d+,)+\d+|([\d*]+(\/|-)\d+)|\d+|\*) ?){5,6})/;
	const validCron = cron.match(regEx)? true : false;
	if (!validCron)	{
		log(LogLevel.WARNING, 'Invalid cron schedule:', cron);
		log(LogLevel.WARNING, 'Using default values instead...');
		return false;
	}
	return true;
}

export {
	saveArticleToJSON,
	saveArticleWithoutContents,
	saveArticleContent,
	loadArticle,
	loadArticles,
	loadArticleContent,
	markArticleContentAsPosted,
	getBlobFromImgUri,
	checkIfContentAlreadyPostedForArticle,
	prefixText,
	stripHTMLElementsAndDecorateText,
	savePostToJSON,
	log,
	isValidCronNotation
};