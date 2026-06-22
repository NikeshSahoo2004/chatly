import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { app, server } from '../../../server';
import { User } from '../../user/user.model';
import { Conversation } from '../conversation.model';
import { Message } from '../message.model';
import { redisClient } from '../../../database/redis';
import { config } from '../../../config';
import { EncryptionService } from '../../../services/encryption.service';

// Mock models and connections
jest.mock('../../user/user.model', () => ({
  User: {
    findById: jest.fn(),
  },
}));

jest.mock('../conversation.model', () => ({
  Conversation: {
    findOne: jest.fn(),
    findById: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  },
}));

jest.mock('../message.model', () => ({
  Message: {
    create: jest.fn(),
    findById: jest.fn(),
    find: jest.fn(),
  },
}));

jest.mock('../../../database/index', () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
  disconnectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../database/redis', () => ({
  redisClient: {
    isOpen: false,
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    setEx: jest.fn().mockResolvedValue('OK'),
    get: jest.fn(),
  },
  subClient: {
    isOpen: false,
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
  },
  connectRedis: jest.fn().mockResolvedValue(undefined),
  disconnectRedis: jest.fn().mockResolvedValue(undefined),
}));

describe('Chat Endpoints Integration Tests', () => {
  let userToken1: string;
  let userToken2: string;
  const userId1 = '60c72b2f9b1d8e25a8f4c201';
  const userId2 = '60c72b2f9b1d8e25a8f4c202';
  const convId = '60c72b2f9b1d8e25a8f4c210';
  const encryptionService = new EncryptionService();

  // Helper to mock chainable query methods (populate, sort, limit, etc)
  const mockQuery = (resolveValue: any) => {
    const query: any = {
      populate: jest.fn().mockImplementation(() => query),
      sort: jest.fn().mockImplementation(() => query),
      limit: jest.fn().mockImplementation(() => query),
      then: (resolve: any) => resolve(resolveValue),
    };
    return query;
  };

  beforeAll((done) => {
    // Generate valid tokens
    userToken1 = jwt.sign(
      {
        userId: userId1,
        username: 'user1',
        email: 'user1@example.com',
        role: 'user',
      },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
    userToken2 = jwt.sign(
      {
        userId: userId2,
        username: 'user2',
        email: 'user2@example.com',
        role: 'user',
      },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    if (!server.listening) {
      server.listen(5050, () => done());
    } else {
      done();
    }
  });

  afterAll((done) => {
    server.close(() => done());
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (redisClient.get as jest.Mock).mockResolvedValue(null);
  });

  describe('POST /api/conversations', () => {
    it('should successfully create a new direct conversation if none exists', async () => {
      // Mock User exists
      (User.findById as jest.Mock).mockResolvedValue({
        _id: userId2,
        name: 'Recipient User',
      });

      // No existing conversation
      (Conversation.findOne as jest.Mock).mockImplementation(() =>
        mockQuery(null)
      );

      // Mock creation returning conversation
      const newConv = {
        _id: convId,
        isGroup: false,
        participants: [userId1, userId2],
        admins: [userId1, userId2],
      };
      (Conversation.create as jest.Mock).mockResolvedValue(newConv);
      (Conversation.findById as jest.Mock).mockImplementation(() =>
        mockQuery(newConv)
      );

      const res = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${userToken1}`)
        .send({ recipientId: userId2 });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.conversation).toBeDefined();
      expect(res.body.data.conversation._id).toBe(convId);
      expect(Conversation.create).toHaveBeenCalled();
    });

    it('should return existing conversation if one already exists', async () => {
      // Mock User exists
      (User.findById as jest.Mock).mockResolvedValue({
        _id: userId2,
        name: 'Recipient User',
      });

      // Existing conversation found
      const existingConv = {
        _id: convId,
        isGroup: false,
        participants: [userId1, userId2],
        admins: [userId1, userId2],
      };
      (Conversation.findOne as jest.Mock).mockImplementation(() =>
        mockQuery(existingConv)
      );

      const res = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${userToken1}`)
        .send({ recipientId: userId2 });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.conversation._id).toBe(convId);
      expect(Conversation.create).not.toHaveBeenCalled();
    });

    it('should fail if attempting to create a conversation with yourself', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${userToken1}`)
        .send({ recipientId: userId1 });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain(
        'You cannot start a conversation with yourself'
      );
    });

    it('should fail if recipientId is not found', async () => {
      (User.findById as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${userToken1}`)
        .send({ recipientId: userId2 });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Recipient user not found');
    });
  });

  describe('GET /api/conversations', () => {
    it('should fetch the list of conversations for the user', async () => {
      const conversations = [
        { _id: convId, participants: [userId1, userId2], isGroup: false },
      ];
      (Conversation.find as jest.Mock).mockImplementation(() =>
        mockQuery(conversations)
      );

      const res = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${userToken1}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.results).toBe(1);
      expect(res.body.data.conversations[0]._id).toBe(convId);
    });
  });

  describe('GET /api/conversations/:id', () => {
    it('should return conversation details if requesting user is a participant', async () => {
      const conv = {
        _id: convId,
        participants: [{ _id: userId1 }, { _id: userId2 }],
        isGroup: false,
      };
      (Conversation.findById as jest.Mock).mockImplementation(() =>
        mockQuery(conv)
      );

      const res = await request(app)
        .get(`/api/conversations/${convId}`)
        .set('Authorization', `Bearer ${userToken1}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.conversation._id).toBe(convId);
    });

    it('should return 403 access denied if requesting user is not a participant', async () => {
      const conv = {
        _id: convId,
        participants: [{ _id: userId2 }], // userId1 is not here
        isGroup: false,
      };
      (Conversation.findById as jest.Mock).mockImplementation(() =>
        mockQuery(conv)
      );

      const res = await request(app)
        .get(`/api/conversations/${convId}`)
        .set('Authorization', `Bearer ${userToken1}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });
  });

  describe('POST /api/messages', () => {
    it('should encrypt message content and save to database, then emit locally decrypted message', async () => {
      const conv = {
        _id: convId,
        participants: [userId1, userId2],
        isGroup: false,
      };
      (Conversation.findById as jest.Mock).mockResolvedValue(conv);

      const plaintext = 'Secret handshake details';
      const encrypted = encryptionService.encryptMessage(plaintext);

      const savedMessage = {
        _id: 'msg_123',
        conversationId: convId,
        senderId: userId1,
        content: encrypted.encryptedContent,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        toObject: function () {
          return { ...this };
        },
      };

      (Message.create as jest.Mock).mockResolvedValue(savedMessage);
      (Message.findById as jest.Mock).mockImplementation(() =>
        mockQuery(savedMessage)
      );
      (Conversation.findByIdAndUpdate as jest.Mock).mockResolvedValue(conv);

      const res = await request(app)
        .post('/api/messages')
        .set('Authorization', `Bearer ${userToken1}`)
        .send({
          conversationId: convId,
          content: plaintext,
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.message.content).toBe(plaintext); // Returned value should be plaintext decrypted
      expect(Message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: convId,
          senderId: userId1,
          content: expect.any(String),
          iv: expect.any(String),
          authTag: expect.any(String),
        })
      );
    });
  });

  describe('GET /api/messages/:conversationId', () => {
    it('should retrieve conversation messages, decrypt them, and support pagination', async () => {
      const conv = {
        _id: convId,
        participants: [userId1, userId2],
        isGroup: false,
      };
      (Conversation.findById as jest.Mock).mockResolvedValue(conv);

      const text1 = 'Hello user2';
      const text2 = 'How are you?';
      const enc1 = encryptionService.encryptMessage(text1);
      const enc2 = encryptionService.encryptMessage(text2);

      const messages = [
        {
          _id: 'msg_2',
          conversationId: convId,
          senderId: userId1,
          content: enc2.encryptedContent,
          iv: enc2.iv,
          authTag: enc2.authTag,
          createdAt: new Date().toISOString(),
          toObject: function () {
            return { ...this };
          },
        },
        {
          _id: 'msg_1',
          conversationId: convId,
          senderId: userId1,
          content: enc1.encryptedContent,
          iv: enc1.iv,
          authTag: enc1.authTag,
          createdAt: new Date(Date.now() - 5000).toISOString(),
          toObject: function () {
            return { ...this };
          },
        },
      ];

      (Message.find as jest.Mock).mockImplementation(() => mockQuery(messages));

      const res = await request(app)
        .get(`/api/messages/${convId}`)
        .set('Authorization', `Bearer ${userToken1}`)
        .query({ limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.results).toBe(2);
      expect(res.body.data.messages[0].content).toBe(text2);
      expect(res.body.data.messages[1].content).toBe(text1);
      expect(res.body.data.nextCursor).toBeDefined();
    });
  });

  describe('GET /api/messages/:conversationId/search', () => {
    it('should search through conversation message content in-memory after decrypting', async () => {
      const conv = {
        _id: convId,
        participants: [userId1, userId2],
        isGroup: false,
      };
      (Conversation.findById as jest.Mock).mockResolvedValue(conv);

      const encMatch = encryptionService.encryptMessage(
        'Lets match standard search'
      );
      const encOther = encryptionService.encryptMessage('Nothing to see here');

      const messages = [
        {
          _id: 'msg_1',
          conversationId: convId,
          senderId: userId1,
          content: encMatch.encryptedContent,
          iv: encMatch.iv,
          authTag: encMatch.authTag,
          toObject: function () {
            return { ...this };
          },
        },
        {
          _id: 'msg_2',
          conversationId: convId,
          senderId: userId1,
          content: encOther.encryptedContent,
          iv: encOther.iv,
          authTag: encOther.authTag,
          toObject: function () {
            return { ...this };
          },
        },
      ];

      (Message.find as jest.Mock).mockImplementation(() => mockQuery(messages));

      const res = await request(app)
        .get(`/api/messages/${convId}/search`)
        .set('Authorization', `Bearer ${userToken1}`)
        .query({ q: 'match' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.results).toBe(1);
      expect(res.body.data.messages[0].content).toBe(
        'Lets match standard search'
      );
    });
  });

  describe('DELETE /api/messages/:id', () => {
    const msgId = '60c72b2f9b1d8e25a8f4c220';

    it('should delete a message for the requesting user only', async () => {
      const conv = {
        _id: convId,
        participants: [userId1, userId2],
        isGroup: false,
      };
      const message = {
        _id: msgId,
        conversationId: convId,
        senderId: userId2,
        deletedFor: [],
        save: jest.fn().mockResolvedValue(undefined),
      };

      (Message.findById as jest.Mock).mockResolvedValue(message);
      (Conversation.findById as jest.Mock).mockResolvedValue(conv);

      const res = await request(app)
        .delete(`/api/messages/${msgId}`)
        .set('Authorization', `Bearer ${userToken1}`)
        .query({ type: 'me' });

      expect(res.status).toBe(200);
      expect(res.body.data.deleteType).toBe('me');
      expect(message.deletedFor).toHaveLength(1);
      expect(message.save).toHaveBeenCalled();
    });

    it('should delete a message for both participants when sender requests it', async () => {
      const conv = {
        _id: convId,
        participants: [userId1, userId2],
        isGroup: false,
      };
      const message = {
        _id: msgId,
        conversationId: convId,
        senderId: userId1,
        createdAt: new Date(),
        isDeleted: false,
        content: 'encrypted-content',
        iv: 'iv',
        authTag: 'tag',
        deletedFor: [],
        save: jest.fn().mockResolvedValue(undefined),
      };

      (Message.findById as jest.Mock).mockResolvedValue(message);
      (Conversation.findById as jest.Mock).mockResolvedValue(conv);

      const res = await request(app)
        .delete(`/api/messages/${msgId}`)
        .set('Authorization', `Bearer ${userToken1}`)
        .query({ type: 'everyone' });

      expect(res.status).toBe(200);
      expect(res.body.data.deleteType).toBe('everyone');
      expect(message.isDeleted).toBe(true);
      expect(message.content).toBe('This message was deleted');
      expect(message.save).toHaveBeenCalled();
    });

    it('should reject delete for both when requester is not the sender', async () => {
      const conv = {
        _id: convId,
        participants: [userId1, userId2],
        isGroup: false,
      };
      const message = {
        _id: msgId,
        conversationId: convId,
        senderId: userId2,
        createdAt: new Date(),
        isDeleted: false,
        deletedFor: [],
      };

      (Message.findById as jest.Mock).mockResolvedValue(message);
      (Conversation.findById as jest.Mock).mockResolvedValue(conv);

      const res = await request(app)
        .delete(`/api/messages/${msgId}`)
        .set('Authorization', `Bearer ${userToken1}`)
        .query({ type: 'everyone' });

      expect(res.status).toBe(403);
    });
  });
});
