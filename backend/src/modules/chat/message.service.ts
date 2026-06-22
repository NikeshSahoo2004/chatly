import mongoose from 'mongoose';
import { Message } from './message.model';
import { IMessage } from './message.interface';
import { Conversation } from './conversation.model';
import { EncryptionService } from '../../services/encryption.service';
import { eventEmitter } from '../../events/emitter';
import { AppError } from '../../utils/errors';

export class MessageService {
  private encryptionService = new EncryptionService();

  /**
   * Send a new message to a conversation
   */
  public async sendMessage(
    userId: string,
    conversationId: string,
    content: string,
    replyTo?: string
  ): Promise<any> {
    // Check if conversation exists
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found', 404);
    }

    // Verify requesting user is a participant of this conversation
    const isParticipant = conversation.participants.some(
      (id: any) => id.toString() === userId
    );

    if (!isParticipant) {
      throw new AppError(
        'Access denied: You are not a participant of this conversation',
        403
      );
    }

    // Encrypt the message content
    const { encryptedContent, iv, authTag } =
      this.encryptionService.encryptMessage(content);

    // Create the message
    const message = await Message.create({
      conversationId,
      senderId: userId,
      content: encryptedContent,
      iv,
      authTag,
      replyTo: replyTo || undefined,
    });

    // Update the conversation's lastMessage pointer and updatedAt
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: message._id,
    });

    // Fetch the fully populated message
    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', 'name username email avatar isOnline lastSeen')
      .populate({
        path: 'replyTo',
        populate: {
          path: 'senderId',
          select: 'name username email avatar',
        },
      });

    if (!populatedMessage) {
      throw new AppError('Failed to fetch created message', 500);
    }

    // Decrypt the content for the returned object
    const decryptedMessage = populatedMessage.toObject();
    decryptedMessage.content = content;

    // Publish the message locally to let Socket.IO know
    eventEmitter.emit('message:new', decryptedMessage);

    return decryptedMessage;
  }

  /**
   * Get messages inside a conversation with cursor-based pagination
   */
  public async getMessagesByConversation(
    conversationId: string,
    userId: string,
    limit: number = 20,
    cursor?: string
  ): Promise<any[]> {
    // Check if conversation exists
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found', 404);
    }

    // Verify requesting user is a participant of this conversation
    const isParticipant = conversation.participants.some(
      (id: any) => id.toString() === userId
    );

    if (!isParticipant) {
      throw new AppError(
        'Access denied: You are not a participant of this conversation',
        403
      );
    }

    // Build the query
    const query: any = {
      conversationId,
      deletedFor: { $nin: [new mongoose.Types.ObjectId(userId)] },
    };
    if (cursor) {
      query.createdAt = { $lt: new Date(cursor) };
    }

    // Find messages sorted by createdAt descending
    const messages = await Message.find(query)
      .populate('senderId', 'name username email avatar isOnline lastSeen')
      .populate({
        path: 'replyTo',
        populate: {
          path: 'senderId',
          select: 'name username email avatar',
        },
      })
      .sort({ createdAt: -1 })
      .limit(limit);

    // Decrypt messages on the fly
    return messages.map((msg) => {
      const msgObj = msg.toObject();
      if (msgObj.isDeleted) {
        msgObj.content = 'This message was deleted';
        return msgObj;
      }
      try {
        msgObj.content = this.encryptionService.decryptMessage(
          msg.content,
          msg.iv,
          msg.authTag
        );
      } catch (err) {
        msgObj.content = '[Decryption Failed]';
      }
      return msgObj;
    });
  }

  /**
   * In-memory search for messages within a conversation
   */
  public async searchMessages(
    conversationId: string,
    userId: string,
    query: string
  ): Promise<any[]> {
    // Check if conversation exists
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found', 404);
    }

    // Verify requesting user is a participant of this conversation
    const isParticipant = conversation.participants.some(
      (id: any) => id.toString() === userId
    );

    if (!isParticipant) {
      throw new AppError(
        'Access denied: You are not a participant of this conversation',
        403
      );
    }

    if (!query) {
      return [];
    }

    // Fetch all messages for the conversation to search in-memory
    const messages = await Message.find({
      conversationId,
      deletedFor: { $nin: [new mongoose.Types.ObjectId(userId)] },
      isDeleted: false,
    })
      .populate('senderId', 'name username email avatar isOnline lastSeen')
      .populate({
        path: 'replyTo',
        populate: {
          path: 'senderId',
          select: 'name username email avatar',
        },
      })
      .sort({ createdAt: -1 });

    const lowerQuery = query.toLowerCase();
    const results: any[] = [];

    for (const msg of messages) {
      try {
        const decrypted = this.encryptionService.decryptMessage(
          msg.content,
          msg.iv,
          msg.authTag
        );
        if (decrypted.toLowerCase().includes(lowerQuery)) {
          const msgObj = msg.toObject();
          msgObj.content = decrypted;
          results.push(msgObj);
        }
      } catch (err) {
        // Skip messages that fail decryption
      }
    }

    return results;
  }

  /**
   * Delete a message (either for Me or for Everyone)
   */
  public async deleteMessage(
    messageId: string,
    userId: string,
    deleteType: 'me' | 'everyone'
  ): Promise<any> {
    const message = await Message.findById(messageId);
    if (!message) {
      throw new AppError('Message not found', 404);
    }

    // Check if the user is a participant in the conversation
    const conversation = await Conversation.findById(message.conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found', 404);
    }

    const isParticipant = conversation.participants.some(
      (id: any) => id.toString() === userId
    );
    if (!isParticipant) {
      throw new AppError(
        'Access denied: You are not a participant of this conversation',
        403
      );
    }

    if (deleteType === 'me') {
      // Add user to the deletedFor array if not already present
      const alreadyDeleted = message.deletedFor.some(
        (id: any) => id.toString() === userId
      );
      if (!alreadyDeleted) {
        message.deletedFor.push(new mongoose.Types.ObjectId(userId) as any);
        await message.save();
      }
      return { status: 'success', deleteType: 'me' };
    } else {
      // Enforce that only the sender can delete for everyone
      if (message.senderId.toString() !== userId) {
        throw new AppError(
          'Access denied: Only the sender can delete this message for everyone',
          403
        );
      }

      // Enforce the 2-minute time window
      const timeElapsed = Date.now() - new Date(message.createdAt).getTime();
      if (timeElapsed > 2 * 60 * 1000) {
        throw new AppError(
          'Access denied: Messages can only be deleted for everyone within 2 minutes of sending',
          400
        );
      }

      // Update the message state
      message.isDeleted = true;
      // Also clear/obfuscate the content fields for security
      message.content = 'This message was deleted';
      message.iv = '00000000000000000000000000000000';
      message.authTag = '00000000000000000000000000000000';
      await message.save();

      // Emit deletion event to WebSocket listeners via eventEmitter
      eventEmitter.emit('message:delete', {
        messageId: message._id.toString(),
        conversationId: message.conversationId.toString(),
      });

      return { status: 'success', deleteType: 'everyone' };
    }
  }
}
