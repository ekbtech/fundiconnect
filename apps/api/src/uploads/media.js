import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';

const defaultUploadRoot = join(dirname(fileURLToPath(import.meta.url)), '../../private-uploads');
const maxFileSize = 5 * 1024 * 1024;
const maxFiles = 4;
const imageTypes = new Map([
  ['image/jpeg', new Set(['.jpg', '.jpeg'])],
  ['image/png', new Set(['.png'])],
]);

function getUploadDirectory(area) {
  return resolve(process.env.PRIVATE_UPLOAD_DIR || defaultUploadRoot, area);
}

function hasValidSignature(mimeType, buffer) {
  if (mimeType === 'image/png') {
    return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  return mimeType === 'image/jpeg' &&
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;
}

export const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSize, files: maxFiles, fields: 4, fieldSize: 5000 },
  fileFilter(_req, file, callback) {
    if (!imageTypes.get(file.mimetype)?.has(extname(file.originalname).toLowerCase())) {
      const error = new Error('Upload a JPEG or PNG image.');
      error.status = 400;
      error.code = 'INVALID_PHOTO';
      callback(error);
      return;
    }
    callback(null, true);
  },
});

export function validatePhoto(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    return null;
  }
  const extension = extname(file.originalname).toLowerCase();
  if (
    !imageTypes.get(file.mimetype)?.has(extension) ||
    file.size !== file.buffer.length ||
    file.size < 1 ||
    file.size > maxFileSize ||
    !hasValidSignature(file.mimetype, file.buffer)
  ) {
    return null;
  }
  return {
    storageKey: randomUUID(),
    extension: extension === '.jpeg' ? 'jpg' : extension.slice(1),
    mimeType: file.mimetype,
    sizeBytes: file.size,
  };
}

export async function storePhoto(area, storageKey, extension, buffer) {
  if (
    !['profile', 'quotation'].includes(area) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storageKey) ||
    !['jpg', 'png'].includes(extension)
  ) {
    throw new Error('Invalid private photo storage reference.');
  }
  const directory = getUploadDirectory(area);
  await mkdir(directory, { recursive: true });
  const filePath = join(directory, `${storageKey}.${extension}`);
  await writeFile(filePath, buffer, { flag: 'wx', mode: 0o600 });
  return filePath;
}

export async function readPhoto(area, storageKey, extension) {
  if (
    !['profile', 'quotation'].includes(area) ||
    typeof storageKey !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storageKey) ||
    !['jpg', 'png'].includes(extension)
  ) {
    return null;
  }
  try {
    return await readFile(join(getUploadDirectory(area), `${storageKey}.${extension}`));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function removePhoto(filePath) {
  await unlink(filePath);
}

export async function removeStoredPhoto(area, storageKey, extension) {
  if (
    !['profile', 'quotation'].includes(area) ||
    typeof storageKey !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storageKey) ||
    !['jpg', 'png'].includes(extension)
  ) {
    throw new Error('Invalid private photo storage reference.');
  }
  await unlink(join(getUploadDirectory(area), `${storageKey}.${extension}`));
}
