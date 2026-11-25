import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import type { AppConfig } from '../config.js';
import { withTransaction } from '../db/connection.js';
import { DEMO_USERS } from '../db/seed.js';
import type { AuthUser, UserRole } from '../types.js';
import { AppError } from './orderService.js';

export const SESSION_COOKIE_NAME = 'store_ops_sid';
const SESSION_ABSOLUTE_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const SESSION_IDLE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  role: UserRole;
}

interface SessionJoinRow {
  session_id: string;
  csrf_token: string;
  expires_at: string;
  last_active_at: string | null;
  user_id: number;
  username: string;
  display_name: string;
  role: UserRole;
}

export interface AuthSession {
  sessionId: string;
  csrfToken: string;
  user: AuthUser;
}

export function loginWithPassword(
  db: DatabaseSync,
  username: string,
  password: string,
  previousSessionId?: string
): AuthSession {
  const userRow = db
    .prepare(
      `SELECT id, username, display_name, password_hash, role
       FROM users
       WHERE LOWER(username) = LOWER(?)`
    )
    .get(username) as UserRow | undefined;

  if (!userRow || !bcrypt.compareSync(password, userRow.password_hash)) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid username or password.');
  }

  const sessionId = crypto.randomBytes(32).toString('hex');
  const csrfToken = crypto.randomBytes(32).toString('hex');
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_ABSOLUTE_TTL_MS).toISOString();

  withTransaction(db, () => {
    if (previousSessionId) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(previousSessionId);
    }

    db.prepare(
      `INSERT INTO sessions (id, user_id, csrf_token, expires_at, last_active_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(sessionId, userRow.id, csrfToken, expiresAt, nowIso);
  });

  return {
    sessionId,
    csrfToken,
    user: {
      id: userRow.id,
      username: userRow.username,
      displayName: userRow.display_name,
      role: userRow.role,
    },
  };
}

export function getSession(db: DatabaseSync, sessionId: string): AuthSession | null {
  if (!sessionId || typeof sessionId !== 'string') {
    return null;
  }

  const row = db
    .prepare(
      `SELECT s.id AS session_id, s.csrf_token, s.expires_at, s.last_active_at,
              u.id AS user_id, u.username, u.display_name, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`
    )
    .get(sessionId) as SessionJoinRow | undefined;

  if (!row) {
    return null;
  }

  const now = Date.now();
  const lastActiveMs = row.last_active_at ? Date.parse(row.last_active_at) : now;
  if (Date.parse(row.expires_at) <= now || lastActiveMs + SESSION_IDLE_TTL_MS <= now) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }

  db.prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?').run(
    new Date(now).toISOString(),
    sessionId
  );

  return {
    sessionId: row.session_id,
    csrfToken: row.csrf_token,
    user: {
      id: row.user_id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
    },
  };
}

export function deleteSession(db: DatabaseSync, sessionId: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function changePassword(
  db: DatabaseSync,
  userId: number,
  currentSessionId: string,
  currentPassword: string,
  newPassword: string
): void {
  withTransaction(db, () => {
    const userRow = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(userId) as
      { id: number; password_hash: string } | undefined;

    if (!userRow || !bcrypt.compareSync(currentPassword, userRow.password_hash)) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
    }

    const rounds = process.env.NODE_ENV === 'test' || process.env.VITEST ? 4 : 10;
    const nextHash = bcrypt.hashSync(newPassword, rounds);

    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(nextHash, userId);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(userId, currentSessionId);
  });
}

export function assertProductionSafety(db: DatabaseSync, cfg: AppConfig): void {
  if (cfg.nodeEnv !== 'production' || cfg.allowDemoUsers) {
    return;
  }

  for (const demo of DEMO_USERS) {
    const row = db
      .prepare('SELECT password_hash FROM users WHERE LOWER(username) = LOWER(?)')
      .get(demo.username) as { password_hash: string } | undefined;
    if (row && bcrypt.compareSync(demo.password, row.password_hash)) {
      throw new Error(
        `FATAL: Seeded demo user "${demo.username}" has default password in production. Change credentials or set ALLOW_DEMO_USERS=true.`
      );
    }
  }
}

export function cleanupExpiredRecords(db: DatabaseSync): {
  deletedSessions: number;
  deletedIdempotencyKeys: number;
} {
  const nowIso = new Date().toISOString();
  const idleCutoffIso = new Date(Date.now() - SESSION_IDLE_TTL_MS).toISOString();

  const sessionsRes = db
    .prepare(
      `DELETE FROM sessions
       WHERE expires_at <= ? OR (last_active_at IS NOT NULL AND last_active_at <= ?)`
    )
    .run(nowIso, idleCutoffIso);

  const idemRes = db.prepare('DELETE FROM idempotency_keys WHERE expires_at <= ?').run(nowIso);

  return {
    deletedSessions: Number(sessionsRes.changes),
    deletedIdempotencyKeys: Number(idemRes.changes),
  };
}
