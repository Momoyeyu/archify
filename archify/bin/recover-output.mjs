import { recoverRetiredPublication } from '../renderers/shared/atomic-output.mjs';

function usage() {
  process.stderr.write('Usage: node bin/recover-output.mjs <private-recovery-directory> [--json]\n');
}

const args = process.argv.slice(2);
const json = args.at(-1) === '--json';
if (json) args.pop();
if (args.length !== 1) {
  usage();
  process.exitCode = 64;
} else {
  const result = recoverRetiredPublication(args[0]);
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    const reason = result.reason?.code || 'publication-recovery-unknown';
    process.stdout.write(`${result.status}: ${reason}\n`);
  }
  // A complete prior recovery is idempotent. A preserved target is a safe,
  // deliberate non-action that needs the operator to inspect the claimant.
  process.exitCode = ['recovered', 'absent'].includes(result.status)
    ? 0
    : result.status === 'preserved' ? 2 : 1;
}
