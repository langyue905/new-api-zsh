import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

function sha256(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
}

export async function GET(request: NextRequest) {
    const appPasswordSet = !!process.env.APP_PASSWORD;

    // If no password is required, return early
    if (!appPasswordSet) {
        return NextResponse.json({ passwordRequired: false, valid: true });
    }

    // Check if a password hash was provided for validation
    const clientPasswordHash = request.headers.get('x-password-hash');

    // If no hash provided, just return that password is required
    if (!clientPasswordHash) {
        return NextResponse.json({ passwordRequired: true, valid: null });
    }

    // Validate the provided hash
    const serverPasswordHash = sha256(process.env.APP_PASSWORD!);
    const isValid = clientPasswordHash === serverPasswordHash;

    return NextResponse.json({ passwordRequired: true, valid: isValid });
}
