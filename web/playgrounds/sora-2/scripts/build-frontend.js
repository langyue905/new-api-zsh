const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const apiPath = path.join(__dirname, '../src/app/api');
const disabledPath = path.join(__dirname, '../.api-routes-backup');

function disableApiRoutes() {
  if (fs.existsSync(apiPath)) {
    fs.renameSync(apiPath, disabledPath);
    console.log('✅ API routes disabled for frontend build');
  } else {
    console.log('ℹ️  API routes already disabled');
  }
}

function restoreApiRoutes() {
  if (fs.existsSync(disabledPath)) {
    fs.renameSync(disabledPath, apiPath);
    console.log('✅ API routes restored');
  } else {
    console.log('ℹ️  API routes already restored');
  }
}

let buildExitCode = 0;

try {
  // Step 1: Disable API routes
  disableApiRoutes();

  try {
    // Step 2: Run the Next.js build
    console.log('\n🔨 Building static frontend...\n');
    execSync('cross-env NEXT_PUBLIC_ENABLE_FRONTEND_MODE=true next build', {
      stdio: 'inherit',
      env: { ...process.env, NEXT_PUBLIC_ENABLE_FRONTEND_MODE: 'true' }
    });
    console.log('\n✅ Build completed successfully\n');
  } catch (buildError) {
    console.error('\n❌ Build failed\n');
    buildExitCode = buildError.status || 1;
  }
} finally {
  // Step 3: Always restore API routes, even if build failed
  restoreApiRoutes();
}

// Exit with the build's exit code
process.exit(buildExitCode);
