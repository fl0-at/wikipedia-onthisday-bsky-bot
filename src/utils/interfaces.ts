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
 * An interface for a picture object
 * @interface Picture
 * @property {string} uri - The URI of the picture
 * @property {string} alt - The alt text of the picture
 * @property {number} height - The height of the picture
 * @property {number} width - The width of the picture
 */
interface Picture {
	uri: string,
	alt: string,
	height: number,
	width: number
}

/**
 * An interface for a pictured event object
 * @interface PicturedEvent
 * @property {string} event - The event
 * @property {Picture} img - The image
 */
interface PicturedEvent {
	event: string,
	img: Picture
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
	posts: Array<BlueskyPost>;
}

interface OnThisDayArticle {
	id: string;
	title: string;
	contents: string; 
	link: string;
}

export { Link, Articles, Posts, OnThisDayArticle, PicturedEvent, Picture };