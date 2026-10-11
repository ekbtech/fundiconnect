import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  readVerificationDocument,
  removeVerificationDocument,
  storeVerificationDocument,
  validateVerificationDocument,
} from './verification-documents.js';

function imageFile(overrides = {}) {
  const buffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  return {
    originalname: 'license.png',
    mimetype: 'image/png',
    buffer,
    size: buffer.length,
    ...overrides,
  };
}

test('verification uploads accept supported matching file signatures and types', () => {
  const result = validateVerificationDocument(imageFile(), 'identity');
  assert.equal(result.documentType, 'identity');
  assert.equal(result.extension, 'png');
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.originalFilename, 'license.png');
  assert.equal(result.sizeBytes, 9);
  assert.match(result.storageKey, /^[0-9a-f-]{36}$/);

  const pdfBuffer = Buffer.from('%PDF-1.7 test');
  assert.equal(
    validateVerificationDocument({
      originalname: 'certificate.pdf',
      mimetype: 'application/pdf',
      buffer: pdfBuffer,
      size: pdfBuffer.length,
    }, 'qualification').extension,
    'pdf',
  );
});

test('verification uploads reject unsupported types and mismatched content signatures', () => {
  assert.equal(validateVerificationDocument(imageFile(), 'passport'), null);
  assert.equal(validateVerificationDocument(imageFile({ originalname: 'file.svg' }), 'identity'), null);
  assert.equal(
    validateVerificationDocument(
      imageFile({ buffer: Buffer.from('not an image'), size: 12 }),
      'identity',
    ),
    null,
  );
  assert.equal(
    validateVerificationDocument(imageFile({ size: 8 }), 'identity'),
    null,
  );
});

test('verification files use the configured private directory and can be removed', async (t) => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fundiconnect-private-'));
  const previousUploadDirectory = process.env.PRIVATE_UPLOAD_DIR;
  process.env.PRIVATE_UPLOAD_DIR = storageRoot;
  t.after(async () => {
    if (previousUploadDirectory === undefined) {
      delete process.env.PRIVATE_UPLOAD_DIR;
    } else {
      process.env.PRIVATE_UPLOAD_DIR = previousUploadDirectory;
    }
    await rm(storageRoot, { recursive: true, force: true });
  });

  const file = imageFile();
  const metadata = validateVerificationDocument(file, 'identity');
  const storedPath = await storeVerificationDocument(
    metadata.storageKey,
    metadata.extension,
    file.buffer,
  );
  assert.equal(storedPath.startsWith(resolve(storageRoot)), true);
  assert.deepEqual(
    await readVerificationDocument(metadata.storageKey, metadata.extension),
    file.buffer,
  );

  await removeVerificationDocument(storedPath);
  assert.equal(await readVerificationDocument(metadata.storageKey, metadata.extension), null);
});
