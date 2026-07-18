import Dexie, { type EntityTable } from 'dexie';

export interface VideoRecord {
    id: string; // video job id
    filename: string;
    blob: Blob; // MP4 blob
    thumbnail?: Blob; // WebP thumbnail
    created_at: number;
}

export class VideoDB extends Dexie {
    videos!: EntityTable<VideoRecord, 'id'>;

    constructor() {
        super('SoraVideoDB');

        this.version(1).stores({
            videos: '&id, filename, created_at'
        });

        this.videos = this.table('videos');
    }
}

export const db = new VideoDB();
