import { spawn } from 'node:child_process';
import { mkdir, open, rm } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import dotenv from 'dotenv';

const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(apiDirectory, '../..');

export function createBackupConfiguration(env, projectRoot = repositoryRoot) {
  const loginPath = env.MYSQL_BACKUP_LOGIN_PATH;
  const database = env.DB_NAME;
  const backupDirectory = env.DB_BACKUP_DIR;
  if (
    typeof loginPath !== 'string' ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(loginPath) ||
    typeof database !== 'string' ||
    !/^[A-Za-z0-9_][A-Za-z0-9_$-]{0,63}$/.test(database) ||
    typeof backupDirectory !== 'string' ||
    !isAbsolute(backupDirectory)
  ) {
    throw new Error(
      'Set MYSQL_BACKUP_LOGIN_PATH, DB_NAME, and an absolute DB_BACKUP_DIR outside the repository.',
    );
  }

  const resolvedBackupDirectory = resolve(backupDirectory);
  const pathFromRepository = relative(projectRoot, resolvedBackupDirectory);
  const isInsideRepository =
    pathFromRepository === '' ||
    (pathFromRepository !== '..' &&
      !pathFromRepository.startsWith(`..${sep}`) &&
      !isAbsolute(pathFromRepository));
  if (isInsideRepository) {
    throw new Error('DB_BACKUP_DIR must be outside the source repository.');
  }

  return {
    backupDirectory: resolvedBackupDirectory,
    database,
    args: [
      `--login-path=${loginPath}`,
      '--single-transaction',
      '--quick',
      '--routines',
      '--triggers',
      '--events',
      '--databases',
      database,
    ],
  };
}

async function writeDatabaseBackup(args, filePath) {
  const backupFile = await open(filePath, 'wx', 0o600);
  let dumpProcess;
  try {
    const output = backupFile.createWriteStream();
    dumpProcess = spawn('mysqldump', args, {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const exit = new Promise((resolveExit, rejectExit) => {
      dumpProcess.once('error', rejectExit);
      dumpProcess.once('close', (code, signal) => {
        if (code === 0) {
          resolveExit();
        } else {
          rejectExit(new Error(`mysqldump failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}.`));
        }
      });
    });
    await Promise.all([pipeline(dumpProcess.stdout, output), exit]);
  } catch (error) {
    dumpProcess?.kill();
    if (backupFile.fd !== -1) {
      try {
        await backupFile.close();
      } catch (closeError) {
        console.error('Could not close the incomplete database backup.', closeError);
      }
    }
    try {
      await rm(filePath, { force: true });
    } catch (cleanupError) {
      console.error('Could not remove the incomplete database backup.', cleanupError);
    }
    throw error;
  }
}

async function main() {
  dotenv.config({ path: resolve(repositoryRoot, '.env') });
  dotenv.config({ path: resolve(apiDirectory, '.env'), override: false });
  const { backupDirectory, database, args } = createBackupConfiguration(process.env);
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const filePath = resolve(backupDirectory, `${database}-${timestamp}.sql`);
  await writeDatabaseBackup(args, filePath);
  console.log(`Database backup created: ${filePath}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('Database backup failed.', error);
    process.exitCode = 1;
  });
}
