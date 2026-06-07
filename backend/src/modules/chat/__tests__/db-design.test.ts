import mongoose from 'mongoose';
import { Conversation } from '../conversation.model';
import { Message } from '../message.model';
import { MessageReaction } from '../reaction.model';
import { Notification } from '../notification.model';

describe('Database Schema Validation Tests', () => {
  const mockUserId1 = new mongoose.Types.ObjectId();
  const mockUserId2 = new mongoose.Types.ObjectId();
  const mockConvId = new mongoose.Types.ObjectId();
  const mockMessageId = new mongoose.Types.ObjectId();

  describe('Conversation Model Schema', () => {
    it('should validate successfully with correct parameters', async () => {
      const conv = new Conversation({
        isGroup: false,
        participants: [mockUserId1, mockUserId2],
      });

      const err = conv.validateSync();
      expect(err).toBeUndefined();
    });

    it('should fail validation when participants are missing', async () => {
      const conv = new Conversation({
        isGroup: true,
      });

      const err = conv.validateSync();
      expect(err).toBeDefined();
      expect(err?.errors['participants']).toBeDefined();
    });
  });

  describe('Message Model Schema', () => {
    it('should validate successfully with cryptographic parameters', async () => {
      const msg = new Message({
        conversationId: mockConvId,
        senderId: mockUserId1,
        content: 'encrypted_ciphertext_data',
        iv: '0123456789abcdef0123456789abcdef',
        authTag: 'abcdef0123456789',
      });

      const err = msg.validateSync();
      expect(err).toBeUndefined();
    });

    it('should fail validation when cryptographic parameters are missing', async () => {
      const msg = new Message({
        conversationId: mockConvId,
        senderId: mockUserId1,
        content: 'plain',
        // iv and authTag are missing
      });

      const err = msg.validateSync();
      expect(err).toBeDefined();
      expect(err?.errors['iv']).toBeDefined();
      expect(err?.errors['authTag']).toBeDefined();
    });
  });

  describe('MessageReaction Model Schema', () => {
    it('should validate successfully with message, user, and emoji reaction parameters', async () => {
      const react = new MessageReaction({
        messageId: mockMessageId,
        userId: mockUserId1,
        reaction: '🔥',
      });

      const err = react.validateSync();
      expect(err).toBeUndefined();
    });

    it('should fail validation when emoji reaction parameter is missing', async () => {
      const react = new MessageReaction({
        messageId: mockMessageId,
        userId: mockUserId1,
      });

      const err = react.validateSync();
      expect(err).toBeDefined();
      expect(err?.errors['reaction']).toBeDefined();
    });
  });

  describe('Notification Model Schema', () => {
    it('should validate successfully and default isRead to false', async () => {
      const notif = new Notification({
        recipientId: mockUserId1,
        type: 'message',
        conversationId: mockConvId,
        messageId: mockMessageId,
      });

      const err = notif.validateSync();
      expect(err).toBeUndefined();
      expect(notif.isRead).toBe(false);
    });

    it('should fail validation with an invalid notification type', async () => {
      const notif = new Notification({
        recipientId: mockUserId1,
        type: 'invalid_notification_type_value',
      });

      const err = notif.validateSync();
      expect(err).toBeDefined();
      expect(err?.errors['type']).toBeDefined();
    });
  });
});
