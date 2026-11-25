import { z } from 'zod';
import { ORDER_STATUSES } from './types.js';

export const MAX_ITEM_QUANTITY = 1000;

const optionalTrimmedString = (max: number, label: string) =>
  z
    .string({ error: `${label} must be a string.` })
    .trim()
    .max(max, `${label} must be at most ${max} characters.`)
    .transform((val) => (val.length === 0 ? undefined : val))
    .optional();

export const orderIdParamSchema = z.object({
  id: z.coerce
    .number({ error: 'Order ID must be a positive integer.' })
    .int('Order ID must be a positive integer.')
    .positive('Order ID must be a positive integer.'),
});

export const listOrdersQuerySchema = z.object({
  search: z.string().trim().max(64, 'Search query must be at most 64 characters.').optional(),
  status: z
    .enum(['All', ...ORDER_STATUSES], {
      error: `Status filter must be one of: All, ${ORDER_STATUSES.join(', ')}.`,
    })
    .optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom must be YYYY-MM-DD.')
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateTo must be YYYY-MM-DD.')
    .optional(),
  sortBy: z.enum(['createdAt', 'totalCents', 'reference', 'status']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const createOrderItemSchema = z.object({
  productId: z
    .number({ error: 'productId must be a positive integer.' })
    .int('productId must be a positive integer.')
    .positive('productId must be a positive integer.'),
  quantity: z
    .number({ error: 'quantity must be a positive integer.' })
    .int('quantity must be a positive integer.')
    .min(1, 'quantity must be at least 1.')
    .max(MAX_ITEM_QUANTITY, `quantity must be at most ${MAX_ITEM_QUANTITY}.`),
});

export const createOrderBodySchema = z
  .object({
    customerName: optionalTrimmedString(100, 'customerName'),
    customerPhone: z
      .string({ error: 'customerPhone must be a string.' })
      .trim()
      .max(20, 'customerPhone must be at most 20 characters.')
      .refine(
        (val) =>
          val.length === 0 ||
          (/^[+\d\s().-]{7,20}$/.test(val) && /\d{5,}/.test(val.replace(/\D/g, ''))),
        'customerPhone must be a valid phone number (7-20 digits/symbols).'
      )
      .transform((val) => (val.length === 0 ? undefined : val))
      .optional(),
    notes: optionalTrimmedString(500, 'notes'),
    items: z
      .array(createOrderItemSchema, { error: 'items must be an array.' })
      .min(1, 'An order must contain at least one product.')
      .max(50, 'An order cannot contain more than 50 line items.'),
  })
  .strict();

export const transitionOrderBodySchema = z
  .object({
    status: z.enum(ORDER_STATUSES, {
      error: `Status must be one of: ${ORDER_STATUSES.join(', ')}.`,
    }),
    reason: z
      .string({ error: 'reason must be a string.' })
      .trim()
      .max(300, 'reason must be at most 300 characters.')
      .optional(),
    expectedVersion: z
      .number({ error: 'expectedVersion must be a positive integer.' })
      .int('expectedVersion must be a positive integer.')
      .positive('expectedVersion must be a positive integer.')
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.status === 'Cancelled' && (!data.reason || data.reason.trim().length < 3)) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'A cancellation reason (at least 3 characters) is required.',
      });
    }
  });

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(1, 'Idempotency-Key header cannot be empty.')
  .max(128, 'Idempotency-Key header must be at most 128 characters.');

export const loginBodySchema = z
  .object({
    username: z
      .string({ error: 'username is required.' })
      .trim()
      .min(1, 'username is required.')
      .max(64, 'username must be at most 64 characters.'),
    password: z
      .string({ error: 'password is required.' })
      .min(1, 'password is required.')
      .max(128, 'password must be at most 128 characters.'),
  })
  .strict();

export const createProductBodySchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(2, 'SKU must be at least 2 characters.')
      .max(32, 'SKU must be at most 32 characters.'),
    name: z
      .string()
      .trim()
      .min(2, 'Product name must be at least 2 characters.')
      .max(120, 'Product name must be at most 120 characters.'),
    category: z.string().trim().min(1).max(60).optional(),
    priceCents: z.number().int().min(0).max(100_000_000),
    stock: z.number().int().min(0).max(1_000_000),
  })
  .strict();

export const updateProductBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    category: z.string().trim().min(1).max(60).optional(),
    priceCents: z.number().int().min(0).max(100_000_000).optional(),
  })
  .strict()
  .refine(
    (d) => d.name !== undefined || d.category !== undefined || d.priceCents !== undefined,
    'At least one field (name, category, priceCents) must be provided.'
  );

export const adjustStockBodySchema = z
  .object({
    delta: z
      .number()
      .int('delta must be an integer.')
      .refine((v) => v !== 0, 'delta cannot be 0.')
      .refine((v) => Math.abs(v) <= 100_000, 'delta magnitude cannot exceed 100000.'),
    reason: z
      .string({ error: 'A stock adjustment reason is required.' })
      .trim()
      .min(3, 'Adjustment reason must be at least 3 characters.')
      .max(200, 'Adjustment reason must be at most 200 characters.'),
  })
  .strict();

export const editOrderBodySchema = createOrderBodySchema.extend({
  expectedVersion: z.number().int().positive().optional(),
});

export const changePasswordBodySchema = z
  .object({
    currentPassword: z
      .string({ error: 'currentPassword is required.' })
      .min(1, 'currentPassword is required.')
      .max(128),
    newPassword: z
      .string({ error: 'newPassword is required.' })
      .min(8, 'newPassword must be at least 8 characters.')
      .max(128, 'newPassword must be at most 128 characters.'),
  })
  .strict();
