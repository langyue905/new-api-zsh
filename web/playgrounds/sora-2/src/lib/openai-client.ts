import { InvalidApiKeyError } from './errors';
import OpenAI from 'openai';

export function createFrontendOpenAI(apiKey: string): OpenAI {
    return new OpenAI({
        apiKey,
        baseURL: typeof window === 'undefined' ? '/v1' : `${window.location.origin}/v1`,
        dangerouslyAllowBrowser: true
    });
}

export async function verifyFrontendApiKey(apiKey: string): Promise<void> {
    const client = createFrontendOpenAI(apiKey);

    try {
        await client.models.list();
    } catch (error) {
        if (error instanceof OpenAI.AuthenticationError) {
            throw new InvalidApiKeyError();
        }

        if (error && typeof error === 'object') {
            const status = (error as { status?: number }).status;
            if (typeof status === 'number' && (status === 401 || status === 403)) {
                throw new InvalidApiKeyError();
            }

            const code =
                (error as { code?: string; error?: { code?: string } }).code ??
                (error as { code?: string; error?: { code?: string } }).error?.code;
            if (code === 'invalid_api_key') {
                throw new InvalidApiKeyError();
            }
        }

        throw error instanceof Error ? error : new Error('Failed to verify API key');
    }
}
