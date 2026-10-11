export function isAllowedOrigin(requestOrigin, allowedOrigin, requestHost) {
  if (!requestOrigin) {
    return true;
  }
  if (allowedOrigin && requestOrigin === allowedOrigin) {
    return true;
  }
  if (!requestHost) {
    return false;
  }
  try {
    const originUrl = new URL(requestOrigin);
    const hostUrl = new URL(`http://${requestHost}`);
    return originUrl.hostname === hostUrl.hostname;
  } catch {
    return false;
  }
}

export function originGuard(allowedOrigin) {
  return (req, res, next) => {
    const requestOrigin = req.get('origin');

    if (!isAllowedOrigin(requestOrigin, allowedOrigin, req.get('host'))) {
      return res.status(403).json({ message: 'Request origin is not allowed.' });
    }

    return next();
  };
}
