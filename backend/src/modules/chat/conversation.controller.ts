import { Request, Response, NextFunction } from 'express';
import { ConversationService } from './conversation.service';
import { AppError } from '../../utils/errors';

export class ConversationController {
  private conversationService = new ConversationService();

  /**
   * Create or locate a direct chat session
   */
  public createConversation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const { recipientId } = req.body;

      if (!userId) {
        throw new AppError('Authentication required', 401);
      }

      const conversation =
        await this.conversationService.createDirectConversation(
          userId,
          recipientId
        );

      res.status(200).json({
        status: 'success',
        data: { conversation },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Fetch all conversation threads for the current user
   */
  public getConversations = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        throw new AppError('Authentication required', 401);
      }

      const conversations =
        await this.conversationService.getUserConversations(userId);

      res.status(200).json({
        status: 'success',
        results: conversations.length,
        data: { conversations },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Fetch a single conversation detail
   */
  public getConversationById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const conversationId = req.params.id;

      if (!userId) {
        throw new AppError('Authentication required', 401);
      }

      const conversation = await this.conversationService.getConversationById(
        conversationId,
        userId
      );

      res.status(200).json({
        status: 'success',
        data: { conversation },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Create a new group chat
   */
  public createGroupConversation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const { name, participants, avatar } = req.body;

      if (!userId) {
        throw new AppError('Authentication required', 401);
      }

      const conversation =
        await this.conversationService.createGroupConversation(
          userId,
          name,
          participants,
          avatar
        );

      res.status(201).json({
        status: 'success',
        data: { conversation },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Add members to a group
   */
  public addGroupParticipants = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const conversationId = req.params.id;
      const { participantIds } = req.body;

      if (!userId) {
        throw new AppError('Authentication required', 401);
      }

      const conversation = await this.conversationService.addGroupParticipants(
        userId,
        conversationId,
        participantIds
      );

      res.status(200).json({
        status: 'success',
        data: { conversation },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Remove members from a group
   */
  public removeGroupParticipants = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const conversationId = req.params.id;
      const { participantIds } = req.body;

      if (!userId) {
        throw new AppError('Authentication required', 401);
      }

      const conversation =
        await this.conversationService.removeGroupParticipants(
          userId,
          conversationId,
          participantIds
        );

      res.status(200).json({
        status: 'success',
        data: { conversation },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update group admins (add or remove)
   */
  public updateGroupAdmins = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const conversationId = req.params.id;
      const { adminIds, action } = req.body;

      if (!userId) {
        throw new AppError('Authentication required', 401);
      }

      const conversation = await this.conversationService.updateGroupAdmins(
        userId,
        conversationId,
        adminIds,
        action
      );

      res.status(200).json({
        status: 'success',
        data: { conversation },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Leave a group chat
   */
  public leaveGroupConversation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const conversationId = req.params.id;

      if (!userId) {
        throw new AppError('Authentication required', 401);
      }

      const result = await this.conversationService.leaveGroupConversation(
        userId,
        conversationId
      );

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
