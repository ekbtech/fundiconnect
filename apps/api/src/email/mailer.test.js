import test from 'node:test';
import assert from 'node:assert/strict';
import { isEmailConfigured } from './mailer.js';

const mailVariables = ['MAIL_HOST', 'MAIL_PORT', 'MAIL_USER', 'MAIL_PASS', 'MAIL_FROM'];

function withMailEnvironment(values, callback) {
  const previous = Object.fromEntries(mailVariables.map((key) => [key, process.env[key]]));
  for (const key of mailVariables) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try {
    callback();
  } finally {
    for (const key of mailVariables) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('SMTP delivery is enabled only with valid server and sender settings', () => {
  withMailEnvironment({}, () => assert.equal(isEmailConfigured(), false));
  withMailEnvironment({
    MAIL_HOST: 'smtp.example.test',
    MAIL_PORT: '587',
    MAIL_USER: 'mailer@example.test',
    MAIL_PASS: 'test-password',
  }, () => assert.equal(isEmailConfigured(), true));
  withMailEnvironment({
    MAIL_HOST: 'smtp.example.test',
    MAIL_PORT: '587',
    MAIL_USER: 'mailer@example.test',
  }, () => assert.equal(isEmailConfigured(), false));
  withMailEnvironment({
    MAIL_HOST: 'smtp.example.test',
    MAIL_PORT: 'not-a-port',
    MAIL_FROM: 'FundiConnect <noreply@example.test>',
  }, () => assert.equal(isEmailConfigured(), false));
});
