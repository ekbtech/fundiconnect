import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  readPhoto,
  removePhoto,
  storePhoto,
  validatePhoto,
} from './media.js';

function pngFile() {
  const buffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  return { originalname: 'work.png', mimetype: 'image/png', buffer, size: buffer.length };
}

test('photo validation accepts matching JPEG and PNG signatures only', () => {
  const metadata = validatePhoto(pngFile());
  assert.equal(metadata.extension, 'png');
  assert.equal(metadata.mimeType, 'image/png');
  assert.equal(metadata.sizeBytes, 9);
  assert.match(metadata.storageKey, /^[0-9a-f-]{36}$/);
  assert.equal(validatePhoto({ ...pngFile(), originalname: 'photo.jpg' }), null);
  assert.equal(validatePhoto({ ...pngFile(), buffer: Buffer.from('not an image'), size: 12 }), null);
  assert.equal(validatePhoto({ ...pngFile(), size: 8 }), null);
});

test('photos are stored beneath a private area and can be read and removed', async (t) => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fundiconnect-media-'));
  const previousUploadDirectory = process.env.PRIVATE_UPLOAD_DIR;
  process.env.PRIVATE_UPLOAD_DIR = storageRoot;
  t.after(async () => {
    if (previousUploadDirectory === undefined) delete process.env.PRIVATE_UPLOAD_DIR;
    else process.env.PRIVATE_UPLOAD_DIR = previousUploadDirectory;
    await rm(storageRoot, { recursive: true, force: true });
  });

  const file = pngFile();
  const metadata = validatePhoto(file);
  const storedPath = await storePhoto('quotation', metadata.storageKey, metadata.extension, file.buffer);
  assert.equal(storedPath.startsWith(resolve(storageRoot, 'quotation')), true);
  assert.deepEqual(await readPhoto('quotation', metadata.storageKey, metadata.extension), file.buffer);
  await removePhoto(storedPath);
  assert.equal(await readPhoto('quotation', metadata.storageKey, metadata.extension), null);
  await assert.rejects(storePhoto('public', metadata.storageKey, metadata.extension, file.buffer));
});
