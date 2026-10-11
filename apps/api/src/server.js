import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { expireOverdueBookingRequests } from './bookings/expiry.js';
import { getPool } from './db/pool.js';
import adminRouter from './routes/admin.js';
import authRouter from './routes/auth.js';
import fundiRouter from './routes/fundi.js';
import bookingsRouter from './routes/bookings.js';
import quotationsRouter from './routes/quotations.js';
import paymentsRouter from './routes/payments.js';
import reviewsRouter from './routes/reviews.js';
import notificationsRouter from './routes/notifications.js';
import servicesRouter from './routes/services.js';
import usersRouter from './routes/users.js';
import { errorHandler } from './middleware/error-handler.js';
import { isAllowedOrigin, originGuard } from './middleware/origin-guard.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const frontendOrigin =
  process.env.WEB_ORIGIN || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000');

app.disable('x-powered-by');
app.use(originGuard(frontendOrigin));
app.use((req, res, next) => {
  const requestOrigin = req.get('origin');
  const allowedOrigin = isAllowedOrigin(requestOrigin, frontendOrigin, req.get('host'))
    ? requestOrigin || false
    : false;
  cors({ origin: allowedOrigin, credentials: true })(req, res, next);
});
app.use(express.json({ limit: '100kb' }));

app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'fundiconnect-api',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1', (req, res) => {
  res.status(200).json({
    name: 'FundiConnect API',
    version: 'v1',
    status: 'running',
  });
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/fundi', fundiRouter);
app.use('/api/v1/bookings', bookingsRouter);
app.use('/api/v1/quotations', quotationsRouter);
app.use('/api/v1/payments', paymentsRouter);
app.use('/api/v1/reviews', reviewsRouter);
app.use('/api/v1/notifications', notificationsRouter);
app.use('/api/v1/services', servicesRouter);
app.use('/api/v1/users', usersRouter);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use(errorHandler);

app.listen(port, () => {
  console.log(`FundiConnect API is running on http://localhost:${port}`);
  let expirySweepRunning = false;
  const sweepExpiredBookings = async () => {
    if (expirySweepRunning) {
      return;
    }
    expirySweepRunning = true;
    try {
      const expiredCount = await expireOverdueBookingRequests(getPool());
      if (expiredCount > 0) {
        console.log(`Expired ${expiredCount} unanswered booking request(s).`);
      }
    } catch (error) {
      console.error('Booking request expiry sweep failed.', error);
    } finally {
      expirySweepRunning = false;
    }
  };
  void sweepExpiredBookings();
  const expirySweepTimer = setInterval(() => void sweepExpiredBookings(), 60_000);
  expirySweepTimer.unref();
});
