import multer from 'multer';
import { AppError } from '../utils/errors';

// Use memory storage to capture buffer for Cloudinary stream upload
const storage = multer.memoryStorage();

// File filter to allow only common image and video formats
const fileFilter = (req: any, file: any, cb: any) => {
  const allowedMimeTypes = [
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    // Videos
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/webm',
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Invalid file type. Only standard images and videos are supported.', 400), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
});
