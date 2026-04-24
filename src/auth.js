import jwt from 'jsonwebtoken';
import { config, DEFAULT_OWNER_PASSWORD, DEFAULT_JWT_SECRET } from './config.js';

const COOKIE_NAME = 'tuman_owner_token';

export function getAuthConfigurationError() {
  const issues = [];

  if (!config.ownerPassword || config.ownerPassword === DEFAULT_OWNER_PASSWORD) {
    issues.push('OWNER_PASSWORD');
  }

  if (!config.jwtSecret || config.jwtSecret === DEFAULT_JWT_SECRET) {
    issues.push('JWT_SECRET');
  }

  if (!issues.length) {
    return null;
  }

  return `Вход владельца не настроен: задайте ${issues.join(' и ')} в переменных окружения сервера.`;
}

export function issueAuthCookie(res) {
  const token = jwt.sign({ role: 'owner', username: config.ownerUsername }, config.jwtSecret, {
    expiresIn: '30d'
  });

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function requireOwner(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
      return res.status(401).json({ error: 'Нужна авторизация владельца.' });
    }

    const payload = jwt.verify(token, config.jwtSecret);
    req.owner = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Сессия истекла. Войди заново.' });
  }
}

export function validateCredentials(username, password) {
  const normalizedUsername = String(username ?? '').trim();
  const normalizedPassword = String(password ?? '');
  const usernameMatches = !normalizedUsername || normalizedUsername === config.ownerUsername;
  return usernameMatches && normalizedPassword === config.ownerPassword;
}
