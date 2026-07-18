require('dotenv').config({ path: '.env.local', quiet: true });

const isFrontendMode = process.env.NEXT_PUBLIC_ENABLE_FRONTEND_MODE === 'true';

if (isFrontendMode) {
    console.error('\n❌ Error: Frontend mode is enabled in your environment.\n');
    console.error('When NEXT_PUBLIC_ENABLE_FRONTEND_MODE=true, you must use:\n');
    console.error('  \x1b[1m\x1b[36mnpm run build:frontend\x1b[0m\n');
    console.error('This command properly excludes API routes for static export.\n');
    console.error('To use the regular build, remove or set NEXT_PUBLIC_ENABLE_FRONTEND_MODE=false\n');
    process.exit(1);
}

console.log('✅ Build mode check passed');
