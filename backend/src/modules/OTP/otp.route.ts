import { Router } from 'express';
import { sendOTP, verifyOTP, getTTL } from './otp.controller';

const router = Router();

router.post('/send-otp', sendOTP);
router.post('/verify-otp', verifyOTP);
router.get('/:phone/ttl', getTTL);

export default router;
