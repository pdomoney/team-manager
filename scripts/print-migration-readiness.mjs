// Print the P10C static design-only manifest. Never accept workspace paths or personal data.
import { migrationReadinessManifest } from '../src/migration-readiness.js';

if (process.argv.length !== 2) {
  console.error('This command accepts no arguments: it never reads user data or backup files.');
  process.exitCode = 2;
} else {
  process.stdout.write(JSON.stringify(migrationReadinessManifest(), null, 2) + '\n');
}
