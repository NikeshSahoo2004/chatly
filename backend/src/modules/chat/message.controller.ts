import { Request, Response, NextFunction } from 'express';
import { MessageService } from './message.service';
import { AppError } from '../../utils/errors';

export class MessageController {
  private messageService = new MessageService();

  /**
   * Send a new message
   */
  public sendMessage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const { conversationId, content, replyTo } = req.body;

      if (!userId) {
        throw new AppError('Authentication required', 401);
      }

      const message = await this.messageService.sendMessage(userId, conversationId, content, replyTo);

      res.status(201).json({
        status: 'success',
        data: { message },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get messages for a conversation with cursor-based pagination
   */
  public getMessages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const { conversationId } = req.params;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const cursor = req.query.cursor as string | undefined;

      if (!userId) {
        throw new AppError('Authentication required', 401);
      }

      const messages = await this.messageService.getMessagesByConversation(
        conversationId,
        userId,
        limit,
        cursor
      );

      // Determine next cursor (oldest message's createdAt timestamp)
      const nextCursor = messages.length > 0 ? messages[messages.length - 1].createdAt : null;

      res.status(200).json({
        status: 'success',
        results: messages.length,
        data: {
          messages,
          nextCursor,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Search messages inside a conversation (decrypt in-memory)
   */
  public searchMessages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const { conversationId } = req.params;
      const query = req.query.q as string | undefined;

      if (!userId) {
        throw new AppError('Authentication required', 401);
      }

      if (!query) {
        throw new AppError('Query parameter "q" is required for searching', 400);
      }

      const messages = await this.messageService.searchMessages(conversationId, userId, query);

      res.status(200).json({
        status: 'success',
        results: messages.length,
        data: { messages },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Upload file to Cloudinary and return details
   */
  public uploadFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new AppError('Authentication required', 401);
      }

      if (!req.file) {
        throw new AppError('No file uploaded', 400);
      }

      // Dynamic import to configure Cloudinary only when needed
      const { default: cloudinary } = await import('../../config/cloudinary.config');

      // Detect resource type
      const isVideo = req.file.mimetype.startsWith('video/');
      const resourceType = isVideo ? 'video' : 'image';

      // Create stream upload
      const uploadStream = () => {
        return new Promise<any>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: 'chatly_media',
              resource_type: resourceType,
            },
            (error, result) => {
              if (error) {
                reject(error);
              } else {
                resolve(result);
              }
            }
          );
          stream.end(req.file!.buffer);
        });
      };

      const result = await uploadStream();

      res.status(200).json({
        status: 'success',
        data: {
          url: result.secure_url,
          resourceType,
          format: result.format,
          bytes: result.bytes,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Delete a message
   */
  public deleteMessage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const messageId = req.params.id;
      const rawType = req.body?.type || req.query.type;

      if (!userId) {
        throw new AppError('Authentication required', 401);
      }

      if (!rawType || (rawType !== 'me' && rawType !== 'everyone')) {
        throw new AppError('Invalid or missing deletion type parameter', 400);
      }

      const result = await this.messageService.deleteMessage(messageId, userId, rawType);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
