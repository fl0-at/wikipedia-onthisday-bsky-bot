import { Article, BlueskyPost } from "../classes/classes";

/**
 * An interface for a link object
 * @interface Link
 * @property {string} text - The text of the link
 * @property {string} url - The url of the link
 */
interface Link {
	text: string,
	url: string
}

/**
 * An interface for an articles object
 * @interface Articles
 * @property {Article[]} articles - The list of articles
 */
interface Articles {
	articles: Array<Article>;
}

/**
 * An interface for a postings object
 * @interface Posts
 * @property {BlueskyPost[]} postings - The list of posts
 */
interface Posts {
	postings: Array<BlueskyPost>;
}

interface OnThisDayArticle {
	id: string;
	title: string;
	contents: string; 
	link: string;
}

export { Link, Articles, Posts, OnThisDayArticle };