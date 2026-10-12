import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';

const defaultUploadRoot = join(dirname(fileURLToPath(import.meta.url)), '../../private-uploads');
const maxFileSize = 5 * 1024 * 1024;
const mimeExtensions = new Map([
  ['application/pdf', new Set(['.pdf'])],
  ['image/jpeg', new Set(['.jpg', '.jpeg'])],
  ['image/png', new Set(['.png'])],
]);

function getUploadDirectory() {
  return resolve(process.env.PRIVATE_UPLOAD_DIR || defaultUploadRoot, 'verification');
}

export const verificationDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSize, files: 1, fields: 1, fieldSize: 100 },
  fileFilter(_req, file, callback) {
    const allowedExtensions = mimeExtensions.get(file.mimetype);
    if (!allowedExtensions?.has(extname(file.originalname).toLowerCase())) {
      const error = new Error('Upload a PDF, JPEG, or PNG verification document.');
      error.status = 400;
      error.code = 'INVALID_VERIFICATION_DOCUMENT';
      callback(error);
      return;
    }
    callback(null, true);
  },
});

export function validateVerificationDocument(file, documentType) {
  if (!file || !['identity', 'qualification'].includes(documentType)) {
    return null;
  }
  const extension = extname(file.originalname).toLowerCase();
  const allowedExtensions = mimeExtensions.get(file.mimetype);
  if (
    !allowedExtensions?.has(extension) ||
    !Buffer.isBuffer(file.buffer) ||
    file.size !== file.buffer.length ||
    file.size < 1 ||
    file.size > maxFileSize
  ) {
    return null;
  }

  const signatureValid =
    (file.mimetype === 'application/pdf' && file.buffer.subarray(0, 5).toString() === '%PDF-') ||
    (file.mimetype === 'image/png' &&
      file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (file.mimetype === 'image/jpeg' &&
      file.buffer.length >= 3 &&
      file.buffer[0] === 0xff &&
      file.buffer[1] === 0xd8 &&
      file.buffer[2] === 0xff);
  if (!signatureValid) {
    return null;
  }

  return {
    documentType,
    extension: extension === '.jpeg' ? 'jpg' : extension.slice(1),
    mimeType: file.mimetype,
    originalFilename: basename(file.originalname)
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .slice(0, 255),
    sizeBytes: file.size,
    storageKey: randomUUID(),
  };
}

export async function storeVerificationDocument(storageKey, extension, buffer) {
  const uploadDirectory = getUploadDirectory();
  await mkdir(uploadDirectory, { recursive: true });
  const filePath = join(uploadDirectory, `${storageKey}.${extension}`);
  await writeFile(filePath, buffer, { flag: 'wx', mode: 0o600 });
  return filePath;
}

export async function removeVerificationDocument(filePath) {
  await unlink(filePath);
}

export async function removeStoredVerificationDocument(storageKey, extension) {
  if (
    typeof storageKey !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storageKey) ||
    !['pdf', 'jpg', 'png'].includes(extension)
  ) {
    throw new Error('Invalid private verification document reference.');
  }
  try {
    await unlink(join(getUploadDirectory(), `${storageKey}.${extension}`));
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export async function readVerificationDocument(storageKey, extension) {
  if (
    typeof storageKey !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storageKey) ||
    !['pdf', 'jpg', 'png'].includes(extension)
  ) {
    return null;
  }
  const filePath = join(getUploadDirectory(), `${storageKey}.${extension}`);
  try {
    return await readFile(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
