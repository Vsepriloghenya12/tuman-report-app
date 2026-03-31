import jwt from 'jsonwebtoken';
import { config } from './config.js';

const COOKIE_NAME = 'tuman_owner_token';

export function issueAuthCookie(res) {
  const token = jwt.sign({ role: 'owner', username: config.ownerUsername }, config.jwtSecret, {
    expiresIn: '30d'
  });

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME);
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
  return username === config.ownerUsername && password === config.ownerPassword;
}
