import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

const fifteenMinutes = 15 * 60 * 1000;

export const securityHeaders = helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

export function createJsonRateLimiter({ limit, message, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs: fifteenMinutes,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests,
    handler(_req, res) {
      return res.status(429).json({ message });
    },
  });
}

export const apiWriteRateLimiter = createJsonRateLimiter({
  limit: 120,
  message: 'Too many changes were submitted. Wait a few minutes and try again.',
});

export const loginRateLimiter = createJsonRateLimiter({
  limit: 10,
  skipSuccessfulRequests: true,
  message: 'Too many unsuccessful sign-in attempts. Wait 15 minutes and try again.',
});

export const accountActionRateLimiter = createJsonRateLimiter({
  limit: 5,
  message: 'Too many account security requests. Wait 15 minutes and try again.',
});
