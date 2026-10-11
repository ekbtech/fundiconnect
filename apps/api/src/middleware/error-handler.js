export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  console.error('API request failed:', error);
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: 'Uploaded files must be 5 MB or smaller.' });
  }
  if (error.code === 'INVALID_VERIFICATION_DOCUMENT' || error.code === 'INVALID_PHOTO') {
    return res.status(400).json({ message: error.message });
  }
  if (error.name === 'MulterError') {
    return res.status(400).json({ message: 'The upload contains too many files or fields, or uses an unexpected file field.' });
  }
  if (error.status === 400 || error.status === 413) {
    return res.status(error.status).json({ message: 'Request body is invalid or too large.' });
  }
  return res.status(500).json({ message: 'An unexpected server error occurred.' });
}
