import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'Name is required' })
      .min(2, 'Name must be at least 2 characters')
      .max(50, 'Name cannot exceed 50 characters'),
    username: z
      .string({ required_error: 'Username is required' })
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username cannot exceed 30 characters')
      .regex(
        /^[a-zA-Z0-9_]+$/,
        'Username can only contain letters, numbers, and underscores'
      ),
    email: z
      .string({ required_error: 'Email is required' })
      .email('Invalid email address'),
    password: z
      .string({ required_error: 'Password is required' })
      .min(6, 'Password must be at least 6 characters'),
    bio: z.string().max(160, 'Bio cannot exceed 160 characters').optional(),
    avatar: z
      .string()
      .url('Avatar must be a valid URL')
      .optional()
      .or(z.literal('')),
  }),
});

export const loginSchema = z.object({
  body: z
    .object({
      email: z.string().email('Invalid email address').optional(),
      username: z
        .string()
        .min(3, 'Username must be at least 3 characters')
        .optional(),
      password: z
        .string({ required_error: 'Password is required' })
        .min(6, 'Password must be at least 6 characters'),
    })
    .refine((data) => data.email || data.username, {
      message: 'Either email or username is required to login',
      path: ['email'],
    }),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
