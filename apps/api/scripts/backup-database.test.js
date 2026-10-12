import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createBackupConfiguration } from './backup-database.js';

const repositoryRoot = resolve(tmpdir(), 'fundiconnect-source');
const backupDirectory = resolve(tmpdir(), 'fundiconnect-private-backups');
const validEnvironment = {
  MYSQL_BACKUP_LOGIN_PATH: 'fundiconnect-backup',
  DB_NAME: 'fundiconnect',
  DB_BACKUP_DIR: backupDirectory,
};

test('database backup uses a configured MySQL login path and transactional dump', () => {
  const configuration = createBackupConfiguration(validEnvironment, repositoryRoot);
  assert.equal(configuration.backupDirectory, backupDirectory);
  assert.equal(configuration.database, 'fundiconnect');
  assert.deepEqual(configuration.args, [
    '--login-path=fundiconnect-backup',
    '--single-transaction',
    '--quick',
    '--routines',
    '--triggers',
    '--events',
    '--databases',
    'fundiconnect',
  ]);
  assert.doesNotMatch(configuration.args.join(' '), /password/i);
});

test('database backup rejects missing credentials, unsafe names and invalid output paths', () => {
  assert.throws(() => createBackupConfiguration({ ...validEnvironment, MYSQL_BACKUP_LOGIN_PATH: '' }));
  assert.throws(() => createBackupConfiguration({ ...validEnvironment, DB_NAME: '--all-databases' }));
  assert.throws(() => createBackupConfiguration({ ...validEnvironment, DB_BACKUP_DIR: 'relative-backups' }));
  assert.throws(() =>
    createBackupConfiguration(
      { ...validEnvironment, DB_BACKUP_DIR: resolve(repositoryRoot, 'backups') },
      repositoryRoot,
    ),
  );
});
