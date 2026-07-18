import type { VideoCreateParams, VideoModel, VideoSeconds, VideoSize } from 'openai/resources/videos';
import { createFrontendOpenAI } from './openai-client';
import { InvalidApiKeyError } from './errors';
import type { VideoJob } from '@/types/video';

export type ApiMode = 'backend' | 'frontend';

interface ServiceConfig {
    mode: ApiMode;
    clientApiKey?: string | null;
    clientPasswordHash?: string | null;
    baseURL?: string;
}

const VIDEO_SECONDS_VALUES: ReadonlyArray<VideoSeconds> = ['4', '8', '12'];
const VIDEO_SIZE_VALUES: ReadonlyArray<VideoSize> = ['720x1280', '1280x720', '1024x1792', '1792x1024'];

export class VideoService {
    private config: ServiceConfig;

    constructor(config: ServiceConfig) {
        this.config = config;
    }

    private normalizeSeconds(value: number | string): VideoSeconds {
        const secondsValue = value.toString();
        if (VIDEO_SECONDS_VALUES.includes(secondsValue as VideoSeconds)) {
            return secondsValue as VideoSeconds;
        }

        throw new Error(`Unsupported clip duration: ${value}`);
    }

    private normalizeSize(value: string): VideoSize {
        if (VIDEO_SIZE_VALUES.includes(value as VideoSize)) {
            return value as VideoSize;
        }

        throw new Error(`Unsupported video size: ${value}`);
    }

    private handleFrontendError(error: unknown): never {
        if (error && typeof error === 'object') {
            const status = (error as { status?: number }).status;
            const code = (error as { code?: string }).code;
            if ((typeof status === 'number' && (status === 401 || status === 403)) || code === 'invalid_api_key') {
                throw new InvalidApiKeyError();
            }
        }

        if (error instanceof Error) {
            throw error;
        }

        throw new Error('Unexpected error while communicating with OpenAI.');
    }

    async createVideo(params: {
        model: VideoModel;
        prompt: string;
        size: VideoSize;
        seconds: VideoSeconds;
        input_reference?: File | null;
    }): Promise<VideoJob> {
        const normalizedSeconds = this.normalizeSeconds(params.seconds);
        const normalizedSize = this.normalizeSize(params.size);

        if (this.config.mode === 'frontend') {
            if (!this.config.clientApiKey) {
                throw new Error('API key is required for frontend mode');
            }

            const openai = createFrontendOpenAI(this.config.clientApiKey, this.config.baseURL);

            const createParams: VideoCreateParams = {
                model: params.model,
                prompt: params.prompt,
                size: normalizedSize,
                seconds: normalizedSeconds
            };

            if (params.input_reference) {
                createParams.input_reference = params.input_reference;
            }

            try {
                const video = await openai.videos.create(createParams);
                return video as VideoJob;
            } catch (error) {
                this.handleFrontendError(error);
            }
        } else {
            // Backend mode - existing implementation
            const apiFormData = new FormData();
            if (this.config.clientPasswordHash) {
                apiFormData.append('passwordHash', this.config.clientPasswordHash);
            }

            apiFormData.append('model', params.model);
            apiFormData.append('prompt', params.prompt);
            apiFormData.append('size', normalizedSize);
            apiFormData.append('seconds', normalizedSeconds);

            if (params.input_reference) {
                apiFormData.append('input_reference', params.input_reference);
            }

            const response = await fetch('/api/videos', {
                method: 'POST',
                body: apiFormData
            });

            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.error || `API request failed with status ${response.status}`);
            }

            return await response.json();
        }
    }

    async remixVideo(sourceVideoId: string, prompt: string): Promise<VideoJob> {
        if (this.config.mode === 'frontend') {
            if (!this.config.clientApiKey) {
                throw new Error('API key is required for frontend mode');
            }

            const openai = createFrontendOpenAI(this.config.clientApiKey, this.config.baseURL);
            try {
                const video = await openai.videos.remix(sourceVideoId, { prompt });
                return video as VideoJob;
            } catch (error) {
                this.handleFrontendError(error);
            }
        } else {
            // Backend mode - existing implementation
            const response = await fetch(`/api/videos/${sourceVideoId}/remix`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt,
                    passwordHash: this.config.clientPasswordHash
                })
            });

            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.error || `API request failed with status ${response.status}`);
            }

            return await response.json();
        }
    }

    async retrieveVideo(videoId: string): Promise<VideoJob> {
        if (this.config.mode === 'frontend') {
            if (!this.config.clientApiKey) {
                throw new Error('API key is required for frontend mode');
            }

            const openai = createFrontendOpenAI(this.config.clientApiKey, this.config.baseURL);
            try {
                const video = await openai.videos.retrieve(videoId);
                return video as VideoJob;
            } catch (error) {
                this.handleFrontendError(error);
            }
        } else {
            // Backend mode - existing implementation
            const response = await fetch(`/api/videos/${videoId}`, {
                headers: this.config.clientPasswordHash ? { 'x-password-hash': this.config.clientPasswordHash } : {}
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch job status: ${response.statusText}`);
            }

            return await response.json();
        }
    }

    async deleteVideo(videoId: string): Promise<void> {
        if (this.config.mode === 'frontend') {
            if (!this.config.clientApiKey) {
                throw new Error('API key is required for frontend mode');
            }

            const openai = createFrontendOpenAI(this.config.clientApiKey, this.config.baseURL);
            try {
                await openai.videos.delete(videoId);
            } catch (error) {
                this.handleFrontendError(error);
            }
        } else {
            // Backend mode - existing implementation
            const response = await fetch(`/api/videos/${videoId}`, {
                method: 'DELETE',
                headers: this.config.clientPasswordHash ? { 'x-password-hash': this.config.clientPasswordHash } : {}
            });

            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.error || 'Failed to delete video');
            }
        }
    }

    async downloadContent(
        videoId: string,
        variant: 'video' | 'thumbnail' | 'spritesheet' = 'video'
    ): Promise<Blob> {
        if (this.config.mode === 'frontend') {
            if (!this.config.clientApiKey) {
                throw new Error('API key is required for frontend mode');
            }

            const openai = createFrontendOpenAI(this.config.clientApiKey, this.config.baseURL);
            try {
                const content = await openai.videos.downloadContent(videoId, { variant });
                return await content.blob();
            } catch (error) {
                this.handleFrontendError(error);
            }
        } else {
            // Backend mode - existing implementation
            const url = `/api/videos/${videoId}/content?variant=${variant}`;
            const fullUrl = this.config.clientPasswordHash
                ? `${url}&password-hash=${encodeURIComponent(this.config.clientPasswordHash)}`
                : url;

            const response = await fetch(fullUrl, {
                headers: this.config.clientPasswordHash ? { 'x-password-hash': this.config.clientPasswordHash } : {}
            });

            if (!response.ok) {
                throw new Error(`Failed to download ${variant}: ${response.statusText}`);
            }

            return await response.blob();
        }
    }
}
