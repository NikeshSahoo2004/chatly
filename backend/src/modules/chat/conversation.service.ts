import mongoose from 'mongoose';
import { Conversation } from './conversation.model';
import { IConversation } from './conversation.interface';
import { User } from '../user/user.model';
import { AppError } from '../../utils/errors';
import { eventEmitter } from '../../events/emitter';
import { EncryptionService } from '../../services/encryption.service';

export class ConversationService {
  private encryptionService = new EncryptionService();

  /**
   * Format conversation: decrypt lastMessage and redact it if deleted for the user
   */
  private formatConversation(conv: any, userId: string): any {
    const convObj = conv.toObject ? conv.toObject() : conv;
    const lastMsg = convObj.lastMessage as any;
    if (lastMsg) {
      const isDeletedForMe = lastMsg.deletedFor?.some(
        (id: any) => id.toString() === userId
      );
      if (isDeletedForMe) {
        convObj.lastMessage = undefined;
      } else if (lastMsg.isDeleted) {
        lastMsg.content = 'This message was deleted';
      } else {
        try {
          lastMsg.content = this.encryptionService.decryptMessage(
            lastMsg.content,
            lastMsg.iv,
            lastMsg.authTag
          );
        } catch (err) {
          lastMsg.content = '[Decryption Failed]';
        }
      }
    }
    return convObj;
  }

  /**
   * Create or locate a 1-to-1 conversation
   */
  public async createDirectConversation(
    userId: string,
    recipientId: string
  ): Promise<any> {
    if (userId === recipientId) {
      throw new AppError('You cannot start a conversation with yourself', 400);
    }

    // Verify recipient user exists
    const recipientExists = await User.findById(recipientId);
    if (!recipientExists) {
      throw new AppError('Recipient user not found', 404);
    }

    // Check if an active 1-to-1 conversation already exists
    const existingConversation = await Conversation.findOne({
      isGroup: false,
      participants: { $all: [userId, recipientId], $size: 2 },
    })
      .populate('participants', 'name username email avatar isOnline lastSeen')
      .populate('lastMessage');

    if (existingConversation) {
      return this.formatConversation(existingConversation, userId);
    }

    // Create a new direct conversation thread
    const newConversation = await Conversation.create({
      isGroup: false,
      participants: [userId, recipientId],
      admins: [userId, recipientId],
    });

    // Fetch populated version to return
    const populated = await Conversation.findById(newConversation._id)
      .populate('participants', 'name username email avatar isOnline lastSeen')
      .populate('lastMessage');

    if (!populated) {
      throw new AppError('Failed to fetch created conversation', 500);
    }

    return this.formatConversation(populated, userId);
  }

  /**
   * Fetch all conversation threads for an authenticated user
   */
  public async getUserConversations(userId: string): Promise<any[]> {
    const conversations = await Conversation.find({
      participants: userId,
    })
      .populate('participants', 'name username email avatar isOnline lastSeen')
      .populate('lastMessage')
      .sort({ updatedAt: -1 });

    return conversations.map((conv) => this.formatConversation(conv, userId));
  }

  /**
   * Fetch conversation details by ID
   */
  public async getConversationById(
    conversationId: string,
    userId: string
  ): Promise<any> {
    const conversation = await Conversation.findById(conversationId)
      .populate('participants', 'name username email avatar isOnline lastSeen')
      .populate('lastMessage');

    if (!conversation) {
      throw new AppError('Conversation not found', 404);
    }

    // Verify requesting user is a participant of this conversation
    const isParticipant = conversation.participants.some(
      (participant: any) => participant._id.toString() === userId
    );

    if (!isParticipant) {
      throw new AppError(
        'Access denied: You are not a participant of this conversation',
        403
      );
    }

    return this.formatConversation(conversation, userId);
  }

  /**
   * Create a new group conversation
   */
  public async createGroupConversation(
    userId: string,
    name: string,
    participantIds: string[],
    avatar?: string
  ): Promise<IConversation> {
    // Unique participants list including the creator
    const uniqueIds = Array.from(new Set([userId, ...participantIds]));

    // Validate that all participants exist in the database
    const users = await User.find({ _id: { $in: uniqueIds } });
    if (users.length !== uniqueIds.length) {
      throw new AppError('One or more participant user IDs are invalid', 400);
    }

    // Create the group conversation
    const group = await Conversation.create({
      name,
      isGroup: true,
      participants: uniqueIds,
      admins: [userId],
      owner: userId,
      avatar: avatar || '',
    });

    const populated = await Conversation.findById(group._id)
      .populate('participants', 'name username email avatar isOnline lastSeen')
      .populate('lastMessage');

    if (!populated) {
      throw new AppError('Failed to fetch created group conversation', 500);
    }

    // Emit group created event locally
    eventEmitter.emit('group:created', populated);

    return populated;
  }

  /**
   * Add participants to an existing group conversation
   */
  public async addGroupParticipants(
    userId: string,
    conversationId: string,
    participantIds: string[]
  ): Promise<IConversation> {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found', 404);
    }

    if (!conversation.isGroup) {
      throw new AppError('Conversation is not a group chat', 400);
    }

    // Verify requesting user is an admin of the group
    const isAdmin = conversation.admins.some(
      (id: any) => id.toString() === userId
    );
    if (!isAdmin) {
      throw new AppError(
        'Access denied: Only group admins can add participants',
        403
      );
    }

    // Filter out users who are already participants
    const newParticipantIds = participantIds.filter(
      (id) =>
        !conversation.participants.some((pId: any) => pId.toString() === id)
    );

    if (newParticipantIds.length === 0) {
      return conversation;
    }

    // Verify new participants exist
    const users = await User.find({ _id: { $in: newParticipantIds } });
    if (users.length !== newParticipantIds.length) {
      throw new AppError('One or more participant user IDs are invalid', 400);
    }

    // Add them to the participants list
    newParticipantIds.forEach((id) => {
      conversation.participants.push(new mongoose.Types.ObjectId(id) as any);
    });

    await conversation.save();

    const populated = await Conversation.findById(conversationId)
      .populate('participants', 'name username email avatar isOnline lastSeen')
      .populate('lastMessage');

    if (!populated) {
      throw new AppError('Failed to fetch updated group conversation', 500);
    }

    // Emit group updated event locally
    eventEmitter.emit('group:updated', populated);

    return populated;
  }

  /**
   * Remove participants from a group conversation
   */
  public async removeGroupParticipants(
    userId: string,
    conversationId: string,
    participantIds: string[]
  ): Promise<IConversation> {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found', 404);
    }

    if (!conversation.isGroup) {
      throw new AppError('Conversation is not a group chat', 400);
    }

    // Verify requesting user is an admin of the group
    const isAdmin = conversation.admins.some(
      (id: any) => id.toString() === userId
    );
    if (!isAdmin) {
      throw new AppError(
        'Access denied: Only group admins can remove participants',
        403
      );
    }

    // Group owner cannot be removed by other admins
    if (participantIds.some((id) => id === conversation.owner?.toString())) {
      throw new AppError(
        'Access denied: Group owner cannot be removed from the group',
        400
      );
    }

    // Remove them from participants and admins arrays
    conversation.participants = conversation.participants.filter(
      (pId: any) => !participantIds.includes(pId.toString())
    );
    conversation.admins = conversation.admins.filter(
      (aId: any) => !participantIds.includes(aId.toString())
    );

    await conversation.save();

    const populated = await Conversation.findById(conversationId)
      .populate('participants', 'name username email avatar isOnline lastSeen')
      .populate('lastMessage');

    if (!populated) {
      throw new AppError('Failed to fetch updated group conversation', 500);
    }

    // Emit group updated event locally
    eventEmitter.emit('group:updated', populated);

    return populated;
  }

  /**
   * Add or remove group admins
   */
  public async updateGroupAdmins(
    userId: string,
    conversationId: string,
    adminIds: string[],
    action: 'add' | 'remove'
  ): Promise<IConversation> {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found', 404);
    }

    if (!conversation.isGroup) {
      throw new AppError('Conversation is not a group chat', 400);
    }

    // Verify requesting user is an admin of the group
    const isAdmin = conversation.admins.some(
      (id: any) => id.toString() === userId
    );
    if (!isAdmin) {
      throw new AppError(
        'Access denied: Only group admins can update group admins',
        403
      );
    }

    if (action === 'add') {
      // Verify all adminIds are already participants
      const allParticipants = adminIds.every((id) =>
        conversation.participants.some((pId: any) => pId.toString() === id)
      );
      if (!allParticipants) {
        throw new AppError(
          'Access denied: All nominated admins must be participants in the group',
          400
        );
      }

      adminIds.forEach((id) => {
        if (!conversation.admins.some((aId: any) => aId.toString() === id)) {
          conversation.admins.push(new mongoose.Types.ObjectId(id) as any);
        }
      });
    } else {
      // Cannot remove group owner from admins
      if (adminIds.some((id) => id === conversation.owner?.toString())) {
        throw new AppError(
          'Access denied: Group owner must remain an admin',
          400
        );
      }

      conversation.admins = conversation.admins.filter(
        (aId: any) => !adminIds.includes(aId.toString())
      );
    }

    await conversation.save();

    const populated = await Conversation.findById(conversationId)
      .populate('participants', 'name username email avatar isOnline lastSeen')
      .populate('lastMessage');

    if (!populated) {
      throw new AppError('Failed to fetch updated group conversation', 500);
    }

    // Emit group updated event locally
    eventEmitter.emit('group:updated', populated);

    return populated;
  }

  /**
   * Leave a group conversation
   */
  public async leaveGroupConversation(
    userId: string,
    conversationId: string
  ): Promise<any> {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found', 404);
    }

    if (!conversation.isGroup) {
      throw new AppError('Conversation is not a group chat', 400);
    }

    // Verify leaving user is a participant
    const isParticipant = conversation.participants.some(
      (id: any) => id.toString() === userId
    );
    if (!isParticipant) {
      throw new AppError(
        'Access denied: You are not a participant in this group',
        400
      );
    }

    // Remove user from participants list
    conversation.participants = conversation.participants.filter(
      (pId: any) => pId.toString() !== userId
    );
    conversation.admins = conversation.admins.filter(
      (aId: any) => aId.toString() !== userId
    );

    // If zero participants remain, delete the conversation
    if (conversation.participants.length === 0) {
      await Conversation.findByIdAndDelete(conversationId);
      return { status: 'deleted' };
    }

    // If leaving user is the owner, appoint a new owner
    if (conversation.owner?.toString() === userId) {
      if (conversation.admins.length > 0) {
        // Appoint first remaining admin
        conversation.owner = conversation.admins[0];
      } else {
        // Appoint first remaining participant, and make them admin
        conversation.owner = conversation.participants[0];
        conversation.admins.push(conversation.participants[0]);
      }
    }

    await conversation.save();

    const populated = await Conversation.findById(conversationId)
      .populate('participants', 'name username email avatar isOnline lastSeen')
      .populate('lastMessage');

    if (populated) {
      // Emit update event locally to alert other participants
      eventEmitter.emit('group:updated', populated);
    }

    return { status: 'left', conversation: populated };
  }
}
