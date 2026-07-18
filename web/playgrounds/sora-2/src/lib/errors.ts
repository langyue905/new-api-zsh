export class InvalidApiKeyError extends Error {
    constructor(message = 'Invalid OpenAI API key') {
        super(message);
        this.name = 'InvalidApiKeyError';
    }
}
