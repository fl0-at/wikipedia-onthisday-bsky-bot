import { RichText } from '@atproto/api/dist/rich-text/rich-text';
import { ContentType } from '../utils/enums';

/**
 * A class that represents a content object
 * @class Content
 * @property {ContentType} type - The type of the content
 * @property {string} value - The value of the content
 * @property {string} imgUri - The image URI associated with the content
 * @property {string} imgAltText - The data of the content
 * @property {boolean} alreadyPosted - A boolean value that indicates if the content has already been posted
 */
class Content {
	type: ContentType;
	value: string;
	imgUri: string|null;
	imgAltText: string|null;
	alreadyPosted: boolean;

	/**
	 * Creates an instance of Content.
	 * @param {ContentType} type - The type of the content
	 * @param {string} value - The value of the content
	 * @param {string} [imgUri=null] - The image URI associated with the content (default is null)
	 * @param {string} [imgUri=null] - The data of the content (default is null)
	 * @constructor
	 */
	constructor(type: ContentType, value: string, imgUri: string = null, imgAltText: string = null, alreadyPosted: boolean = false) {
		this.type = type;
		this.value = value;
		this.imgUri = imgUri;
		this.imgAltText = imgAltText;
		this.alreadyPosted = alreadyPosted;
	}
}

/**
 * A class that represents an article object
 * @class Article
 * @property {string} id - The id of the article
 * @property {Content[]} contentList - The list of contents in the article
 */
class Article {
	id: string; 
	contentList: Content[];

	public toString() {
		const contents = [];
		for (const content of this.contentList) {
			contents.push(content);
		}
		const str = {
			"id": this.id,
			"contentList": contents
		}
		return JSON.stringify(str);
	}

	/**
	 * Creates an instance of Article.
	 * @param {string} id - The id of the article
	 * @param {Content[]} contentList - The list of contents in the article
	 * @constructor
	 */
	constructor(id: string, contentList: Content[]){
		this.id = id;
		this.contentList = contentList
	}
}

/**
 * A class that represents a Bluesky post object
 * @class BlueskyPost
 * @property {string} $type - The type of the post
 * @property {RichText["text"]} text - The text of the post
 * @property {RichText["facets"]} facets - The facets of the post
 * @property {string} createdAt - The creation date of the post
 */
class BlueskyPost {
	$type: string;
	text: RichText["text"];
	facets: RichText["facets"];
	createdAt: string;

	/**
	 * Creates an instance of BlueskyPost.
	 * @param {RichText["text"]} text - The text of the post
	 * @param {RichText["facets"]} facets - The facets of the post
	 * @param {string} createdAt - The creation date of the post
	 * @constructor
	 */
	constructor(text: RichText["text"], facets: RichText["facets"], createdAt: string) {
		this.$type = 'app.bsky.feed.post';
		this.text = text;
		this.facets = facets;
		this.createdAt = createdAt;
	}
}

export { Article, Content, BlueskyPost };