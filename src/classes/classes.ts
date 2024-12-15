import { ContentType } from '../utils/enums';

class Content {
	type: ContentType;
	value: string;

	constructor(type: ContentType, value: string) {
		this.type = type;
		this.value = value;
	}
}

class Article {
	id: string; 
	contentList: Content[];

	constructor(id: string, contentList: Content[]){
		this.id = id;
		this.contentList = contentList
	}
}

export default {Content, Article};
export { Article, Content };