import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { z } from 'zod';
import { config } from './config.js';
import { logger } from './logger.js';
import {
  changePassword,
  deleteSession,
  getSession,
  loginWithPassword,
  SESSION_COOKIE_NAME,
  type AuthSession,
} from './services/authService.js';
import {
  adjustProductStock,
  createProduct,
  getDashboardSummary,
  updateProduct,
} from './services/inventoryService.js';
import {
  AppError,
  createOrder,
  editPlacedOrder,
  getOrderById,
  listAllOrdersForExport,
  listOrders,
  listProducts,
  listStockMovements,
  ordersToCsv,
  transitionOrderStatus,
} from './services/orderService.js';
import type { UserRole } from './types.js';
import {
  adjustStockBodySchema,
  changePasswordBodySchema,
  createOrderBodySchema,
  createProductBodySchema,
  editOrderBodySchema,
  idempotencyKeySchema,
  listOrdersQuerySchema,
  loginBodySchema,
  orderIdParamSchema,
  transitionOrderBodySchema,
  updateProductBodySchema,
} from './validation.js';

interface AuthenticatedRequest extends Request {
  auth?: AuthSession;
}

function parseWithSchema<T>(schema: z.ZodType<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const message = firstIssue ? firstIssue.message : `Invalid ${label}.`;
    throw new AppError(400, 'VALIDATION_ERROR', message, {
      issues: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }
  return result.data;
}

export interface CreateAppOptions {
  loginRateLimitMax?: number;
  rateLimitMax?: number;
  trustProxy?: boolean | number | string;
  logger?: Logger;
}

export function createApp(db: DatabaseSync, options: CreateAppOptions = {}): express.Express {
  const app = express();
  app.set('trust proxy', options.trustProxy ?? config.trustProxy);

  app.use(
    pinoHttp({
      logger: options.logger ?? logger,
      genReqId: (req, res) => {
        const existing = req.headers['x-request-id'];
        const id =
          typeof existing === 'string' && existing.trim().length > 0
            ? existing.trim()
            : crypto.randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
    })
  );

  app.use(helmet());

  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : config.corsOrigins;

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new AppError(403, 'CORS_FORBIDDEN', 'Origin not allowed by CORS policy.'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Idempotency-Key', 'X-CSRF-Token'],
    })
  );

  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      max: options.rateLimitMax ?? config.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again shortly.',
          },
        });
      },
    })
  );

  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    max: options.loginRateLimitMax ?? Number(process.env.LOGIN_RATE_LIMIT_MAX || 20),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: 'LOGIN_RATE_LIMIT_EXCEEDED',
          message: 'Too many login attempts. Please wait and try again.',
        },
      });
    },
  });

  app.use(cookieParser());
  app.use(express.json({ limit: '32kb' }));

  const requireAuth = (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    const sid = req.cookies?.[SESSION_COOKIE_NAME];
    const session = typeof sid === 'string' ? getSession(db, sid) : null;
    if (!session) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication is required.'));
      return;
    }
    req.auth = session;
    next();
  };

  const requireCsrf = (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    const session = req.auth;
    const provided = req.header('X-CSRF-Token');
    if (!session || !provided) {
      next(new AppError(403, 'CSRF_INVALID', 'Missing or invalid CSRF token.'));
      return;
    }
    const expectedBuf = Buffer.from(session.csrfToken, 'utf8');
    const providedBuf = Buffer.from(provided, 'utf8');
    if (
      expectedBuf.length !== providedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, providedBuf)
    ) {
      next(new AppError(403, 'CSRF_INVALID', 'Missing or invalid CSRF token.'));
      return;
    }
    next();
  };

  const requireRole =
    (...roles: UserRole[]) =>
    (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
      const role = req.auth?.user.role;
      if (!role || !roles.includes(role)) {
        next(
          new AppError(
            403,
            'FORBIDDEN',
            `This action requires one of the following roles: ${roles.join(', ')}.`
          )
        );
        return;
      }
      next();
    };

  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: config.cookieSecure,
    maxAge: 8 * 60 * 60 * 1000,
  };

  app.get('/api/health', (_req: Request, res: Response, next: NextFunction) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({
        status: 'ok',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/login', loginLimiter, (req: Request, res: Response, next: NextFunction) => {
    try {
      const { username, password } = parseWithSchema(
        loginBodySchema,
        req.body ?? {},
        'login payload'
      );
      const prevSid =
        typeof req.cookies?.[SESSION_COOKIE_NAME] === 'string'
          ? req.cookies[SESSION_COOKIE_NAME]
          : undefined;
      const session = loginWithPassword(db, username, password, prevSid);
      res.cookie(SESSION_COOKIE_NAME, session.sessionId, cookieOptions);
      res.json({
        user: session.user,
        csrfToken: session.csrfToken,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json({
      user: req.auth!.user,
      csrfToken: req.auth!.csrfToken,
    });
  });

  app.post(
    '/api/auth/change-password',
    requireAuth,
    requireCsrf,
    (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { currentPassword, newPassword } = parseWithSchema(
          changePasswordBodySchema,
          req.body ?? {},
          'password change payload'
        );
        changePassword(db, req.auth!.user.id, req.auth!.sessionId, currentPassword, newPassword);
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/auth/logout',
    requireAuth,
    requireCsrf,
    (req: AuthenticatedRequest, res: Response) => {
      deleteSession(db, req.auth!.sessionId);
      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      res.json({ ok: true });
    }
  );

  app.get('/api/dashboard', requireAuth, (_req: Request, res: Response, next: NextFunction) => {
    try {
      const summary = getDashboardSummary(db, config.storeTimezone);
      res.json({ dashboard: summary });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/products', requireAuth, (_req: Request, res: Response, next: NextFunction) => {
    try {
      const products = listProducts(db);
      res.json({ products });
    } catch (err) {
      next(err);
    }
  });

  app.post(
    '/api/products',
    requireAuth,
    requireCsrf,
    requireRole('Admin'),
    (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const body = parseWithSchema(createProductBodySchema, req.body ?? {}, 'product payload');
        const actor = req.auth
          ? { id: req.auth.user.id, username: req.auth.user.username }
          : undefined;
        const product = createProduct(db, body, actor);
        res.status(201).json({ product });
      } catch (err) {
        next(err);
      }
    }
  );

  app.patch(
    '/api/products/:id',
    requireAuth,
    requireCsrf,
    requireRole('Admin'),
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = parseWithSchema(orderIdParamSchema, req.params, 'product ID');
        const body = parseWithSchema(updateProductBodySchema, req.body ?? {}, 'product update');
        const product = updateProduct(db, id, body);
        res.json({ product });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/products/:id/adjust-stock',
    requireAuth,
    requireCsrf,
    requireRole('Admin'),
    (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { id } = parseWithSchema(orderIdParamSchema, req.params, 'product ID');
        const { delta, reason } = parseWithSchema(
          adjustStockBodySchema,
          req.body ?? {},
          'stock adjustment'
        );
        const actor = req.auth
          ? { id: req.auth.user.id, username: req.auth.user.username }
          : undefined;
        const product = adjustProductStock(db, id, delta, reason, actor);
        res.json({ product });
      } catch (err) {
        next(err);
      }
    }
  );

  app.get(
    '/api/stock-movements',
    requireAuth,
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const rawProductId = req.query.productId;
        const productId =
          typeof rawProductId === 'string' && rawProductId.trim() !== ''
            ? parseWithSchema(orderIdParamSchema, { id: rawProductId }, 'productId').id
            : undefined;
        const movements = listStockMovements(db, productId);
        res.json({ movements });
      } catch (err) {
        next(err);
      }
    }
  );

  app.get(
    '/api/orders/export.csv',
    requireAuth,
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = parseWithSchema(listOrdersQuerySchema, req.query, 'query parameters');
        const orders = listAllOrdersForExport(db, query);
        const csv = ordersToCsv(orders);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="orders-export.csv"');
        res.send(csv);
      } catch (err) {
        next(err);
      }
    }
  );

  app.get('/api/orders', requireAuth, (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = parseWithSchema(listOrdersQuerySchema, req.query, 'query parameters');
      const result = listOrders(db, query);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/orders/:id', requireAuth, (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = parseWithSchema(orderIdParamSchema, req.params, 'order ID');
      const order = getOrderById(db, id);
      res.json({ order });
    } catch (err) {
      next(err);
    }
  });

  app.patch(
    '/api/orders/:id',
    requireAuth,
    requireCsrf,
    requireRole('Admin', 'Operator'),
    (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { id } = parseWithSchema(orderIdParamSchema, req.params, 'order ID');
        const body = parseWithSchema(editOrderBodySchema, req.body ?? {}, 'order edit payload');
        const actor = req.auth
          ? { id: req.auth.user.id, username: req.auth.user.username }
          : undefined;
        const order = editPlacedOrder(db, id, body, actor);
        res.json({ order });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/orders',
    requireAuth,
    requireCsrf,
    requireRole('Admin', 'Operator'),
    (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const body = parseWithSchema(createOrderBodySchema, req.body ?? {}, 'order payload');
        const rawIdemKey = req.header('Idempotency-Key');
        const idempotencyKey =
          rawIdemKey !== undefined
            ? parseWithSchema(idempotencyKeySchema, rawIdemKey, 'Idempotency-Key header')
            : undefined;

        const actor = req.auth
          ? { id: req.auth.user.id, username: req.auth.user.username }
          : undefined;
        const { order, replayed } = createOrder(db, body, idempotencyKey, actor);
        res.status(replayed ? 200 : 201).json({ order });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/orders/:id/status',
    requireAuth,
    requireCsrf,
    requireRole('Admin', 'Warehouse'),
    (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { id } = parseWithSchema(orderIdParamSchema, req.params, 'order ID');
        const { status, reason, expectedVersion } = parseWithSchema(
          transitionOrderBodySchema,
          req.body ?? {},
          'status payload'
        );
        const actor = req.auth
          ? { id: req.auth.user.id, username: req.auth.user.username }
          : undefined;
        const order = transitionOrderStatus(db, id, status, actor, reason, expectedVersion);
        res.json({ order });
      } catch (err) {
        next(err);
      }
    }
  );

  // Serve built frontend in production if dist/client exists
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDistPath = path.resolve(__dirname, '../client');
  app.use(express.static(clientDistPath));
  app.get(/^\/(?!api(?:\/|$)).*/, (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/assets/')) {
      next();
      return;
    }
    res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
      if (err) next();
    });
  });

  // Global error handler — unified { error: { code, message, details? } } without leaking internals
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
      });
      return;
    }

    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({
        error: {
          code: 'INVALID_JSON',
          message: 'Request body contains malformed JSON.',
        },
      });
      return;
    }

    if (
      typeof err === 'object' &&
      err !== null &&
      'type' in err &&
      (err as { type?: string }).type === 'entity.too.large'
    ) {
      res.status(413).json({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request body exceeds the 32kb limit.',
        },
      });
      return;
    }

    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected server error occurred.',
      },
    });
  });

  return app;
}
