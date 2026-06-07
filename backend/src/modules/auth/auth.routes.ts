import { Router } from 'express';
import { AuthController } from './auth.controller';
import { validate } from '../../middleware/validate.middleware';
import { registerSchema, loginSchema } from './auth.validator';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();
const controller = new AuthController();

// Registration endpoint
router.post('/register', validate(registerSchema), controller.register);

// Login endpoint
router.post('/login', validate(loginSchema), controller.login);

// Token rotation endpoint
router.post('/refresh', controller.refresh);

// Logout endpoint (requires access token validation first)
router.post('/logout', authenticate, controller.logout);

export default router;
