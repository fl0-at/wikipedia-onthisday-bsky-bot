import dotenv from 'dotenv';
import fs from 'fs/promises';
import { Article, Content } from '../classes/classes';
import { ContentType, LogLevel } from '../utils/enums';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const DB = require('../../database/posted_articles.json');
const LOG_LEVEL = process.env.LOG_LEVEL || LogLevel.INFO;

dotenv.config();

async function saveToDb(DB) {
	try {
		await fs.writeFile('./database/posted_articles.json', JSON.stringify(DB, null, 2), 'utf-8');	
	} catch (error) {
		log(LogLevel.CRITICAL, 'Failed to save DB to local filesystem:', error);
	}
}

// save posted articles to local file
async function savePostedArticle(article: Article) {
	try {
		// need to just write the "bare" article, without contents
		const articleWithoutContent = new Article(article.id,[]);
		log(LogLevel.DEBUG, 'Trying to save bare article to DB:', articleWithoutContent);				
		
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
			if (con === content) isDuplicateContent = true;
		}
		// for some reason I get duplicate content entries
		// need to fix!!!
		if (!isDuplicateContent) {
			curArt.contentList.push(content)
		} else {
			log(LogLevel.WARNING, 'Duplicate content detected - will be skipped:', content.value);
		}

		log(LogLevel.DEBUG, 'Saving the following article ID:', article.id);
		log(LogLevel.DEBUG, 'Saving the following content list:', DB.articles[indexForUpdate].contentList);

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function log(level: LogLevel, message: string, ...optionalParams: any[] ) {
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
				console.log(`[${new Date().toISOString()}][UNKNOWN] ${message}`, ...optionalParams);
				break;
		}		
	} catch (error) {
		throw new Error(`Unable to log to console: [${new Date().toISOString()}] ${error}`);			
	}
	return true;
}

export { 
	savePostedArticle,
	savePostedArticleContent,
	loadPostedArticle,
	loadPostedArticles,
	loadPostedArticleContent,
	checkIfContentAlreadyPostedForArticle,
	log
};