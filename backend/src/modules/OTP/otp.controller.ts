import { Request, Response } from 'express';
import { ioredisClient as redis } from '../../database/redis';
import { sendSMS } from '../../services/sms.services';

function otpKey(phone: string) {
  return `user:otp:${phone}`;
}

export const sendOTP = async (req: Request, res: Response) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({
      success: false,
      message: 'Phone number is required',
    });
  }

  const otp = Math.floor(Math.random() * 900000 + 100000).toString();

  await redis.set(otpKey(phone), otp, 'EX', 30);

  try {
    await sendSMS(phone, otp);
    res.json({
      success: true,
      message: 'OTP sent successfully',
      otp,
    });
  } catch (error: any) {
    console.error('Twilio SMS send failure:', error.message || error);
    res.json({
      success: true,
      message: 'OTP generated successfully (SMS sending failed)',
      otp,
    });
  }
};

export const verifyOTP = async (req: Request, res: Response) => {
  const { phone, otp } = req.body;
  const storedOtp = await redis.get(otpKey(phone));

  if (!storedOtp) {
    return res.status(400).json({
      success: false,
      message: 'OTP expired or not found',
    });
  }

  if (storedOtp !== otp) {
    return res.status(400).json({
      success: false,
      message: 'Invalid OTP',
    });
  }

  // OTP verified
  await redis.del(otpKey(phone));

  res.json({
    success: true,
    message: 'OTP verified successfully',
  });
};

export const getTTL = async (req: Request, res: Response) => {
  const ttl = await redis.ttl(otpKey(req.params.phone));
  res.json({
    success: true,
    ttl,
  });
};
