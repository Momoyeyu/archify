import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  captureAtomicOutput,
  captureRegularFileBinding,
  releaseRegularFileBinding,
  removeOwnedRegularFile,
  verifyAtomicOutput,
  verifyRegularFileBinding,
} from '../archify/renderers/shared/atomic-output.mjs';
import { containedBy, sameLocation } from '../archify/renderers/shared/path-semantics.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(__dirname, '../docs/assets');
const SITE_ASSETS = Object.freeze([
  'site-language.js',
  'site-navigation.css',
]);

function publicationError(asset, state) {
  const reason = state?.reason || state;
  return new Error(`Cannot safely publish site asset "${asset}" (${reason?.code || 'indeterminate'}).`, {
    cause: reason,
  });
}

function stageSiteAsset(source, commitPath, mode) {
  const content = fs.readFileSync(source);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidatePath = path.join(
      path.dirname(commitPath),
      `.${path.basename(commitPath)}.archify-${randomBytes(16).toString('hex')}.tmp`,
    );
    let descriptor;
    let identity;
    try {
      const noFollow = process.platform === 'win32' ? 0 : (fs.constants.O_NOFOLLOW || 0);
      descriptor = fs.openSync(
        candidatePath,
        fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | noFollow,
        mode ?? 0o666,
      );
      const metadata = fs.fstatSync(descriptor, { bigint: true });
      if (!metadata.isFile() || metadata.ino === 0n) {
        throw new Error('Temporary site asset identity could not be verified safely.');
      }
      identity = { device: metadata.dev, inode: metadata.ino };
      fs.writeFileSync(descriptor, content);
      if (mode !== null) fs.fchmodSync(descriptor, mode);
      fs.closeSync(descriptor);
      descriptor = undefined;
      return { candidatePath, identity };
    } catch (error) {
      if (descriptor !== undefined) {
        try { fs.closeSync(descriptor); } catch {}
      }
      if (error?.code === 'EEXIST') continue;
      if (identity) removeOwnedRegularFile(candidatePath, identity, { subject: 'site-asset-candidate' });
      throw error;
    }
  }
  throw Object.assign(new Error(`Could not reserve a temporary site asset beside "${commitPath}".`), {
    code: 'EEXIST',
  });
}

export function copySiteAssets(outputHtmlPath) {
  const requestedOutputParent = path.dirname(path.resolve(outputHtmlPath));
  fs.mkdirSync(requestedOutputParent, { recursive: true });
  const outputParent = fs.realpathSync.native(requestedOutputParent);
  const targetRoot = path.join(outputParent, 'assets');
  try {
    fs.mkdirSync(targetRoot);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
  const assetsEntry = fs.lstatSync(targetRoot, { bigint: true });
  if (assetsEntry.isSymbolicLink() || !assetsEntry.isDirectory()) {
    throw new Error('Site assets directory must be a physical directory, not a symbolic link or special entry.');
  }
  const containment = containedBy(outputParent, targetRoot);
  if (containment.status !== 'match') {
    throw new Error('Site assets directory is not physically contained by the output directory.', {
      cause: containment.reason,
    });
  }

  const publications = [];
  for (const asset of SITE_ASSETS) {
    const source = path.join(sourceRoot, asset);
    const target = path.join(targetRoot, asset);
    const capture = captureAtomicOutput(target, {
      requestedEntryPolicy: 'regular-or-absent',
    });
    if (capture.status !== 'captured') {
      throw publicationError(asset, capture);
    }
    if (capture.snapshot.slot.parentDevice !== assetsEntry.dev
      || capture.snapshot.slot.parentInode !== assetsEntry.ino) {
      throw new Error(`Cannot safely publish site asset "${asset}" (assets-directory-changed).`);
    }
    const relation = sameLocation(source, capture.commitPath);
    if (relation.status === 'match') continue;
    if (relation.status === 'unknown') {
      throw new Error(`Cannot determine whether site asset source and target alias: ${asset}`, {
        cause: relation.reason,
      });
    }
    publications.push({ asset, source, capture });
  }

  for (const { asset, source, capture } of publications) {
    let candidatePath;
    let candidateIdentity;
    let candidateBinding;
    try {
      ({ candidatePath, identity: candidateIdentity } = stageSiteAsset(
        source,
        capture.commitPath,
        capture.mode,
      ));
      const candidate = captureRegularFileBinding(candidatePath, {
        subject: 'site-asset-candidate',
        expectedIdentity: candidateIdentity,
        ...(capture.mode === null ? {} : { expectedMode: capture.mode }),
      });
      if (candidate.status !== 'captured') throw publicationError(asset, candidate);
      candidateBinding = candidate.binding;
      const targetVerification = verifyAtomicOutput(capture.snapshot);
      if (targetVerification.status !== 'match') {
        throw publicationError(asset, targetVerification);
      }
      const candidateVerification = verifyRegularFileBinding(candidateBinding);
      if (candidateVerification.status !== 'match') {
        throw publicationError(asset, candidateVerification);
      }
      const released = releaseRegularFileBinding(candidateBinding);
      candidateBinding = undefined;
      if (released.status !== 'released') throw publicationError(asset, released);
      fs.renameSync(candidatePath, capture.commitPath);
      candidatePath = undefined;
      candidateIdentity = undefined;
    } finally {
      if (candidateBinding) releaseRegularFileBinding(candidateBinding);
      if (candidatePath && candidateIdentity) {
        const cleanup = removeOwnedRegularFile(candidatePath, candidateIdentity, {
          subject: 'site-asset-candidate',
        });
        if (!['removed', 'absent', 'preserved'].includes(cleanup.status)) {
          throw publicationError(asset, cleanup);
        }
      }
    }
  }
}
