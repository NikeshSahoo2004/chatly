import { GoogleGenerativeAI } from '@google/generative-ai';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import { EncryptionService } from './encryption.service';
import { eventEmitter } from '../events/emitter';
import { logger } from '../utils/logger';

const encryptionService = new EncryptionService();

let genAI: GoogleGenerativeAI | null = null;

export const initAIService = (io: Server) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.warn('[AI Service] GEMINI_API_KEY is not defined. AI Bot will be offline.');
    return;
  }

  genAI = new GoogleGenerativeAI(apiKey);
  logger.info('[AI Service] Gemini AI service initialized successfully');

  // Listen to new messages
  eventEmitter.on('message:new', async (message) => {
    try {
      const messageId = message?._id?.toString() || 'unknown';
      const senderIdStr = typeof message.senderId === 'object' && message.senderId
        ? (message.senderId._id?.toString() || message.senderId.id?.toString())
        : message.senderId?.toString();
      const conversationId = message?.conversationId?.toString();

      logger.info(`[AI Service] message:new event intercepted. MsgId: ${messageId}, SenderId: ${senderIdStr}, ConvId: ${conversationId}`);

      const UserModel = mongoose.model('User');
      const ConversationModel = mongoose.model('Conversation');
      const MessageModel = mongoose.model('Message');

      // Find the AI Bot user to compare IDs and get its details
      const aiBot = await UserModel.findOne({ username: 'chatly_ai' });
      if (!aiBot) {
        logger.warn('[AI Service] AI Bot user (chatly_ai) not found in database. Ignoring message.');
        return;
      }

      const aiBotUserId = aiBot._id.toString();
      logger.info(`[AI Service] AI Bot User ID: ${aiBotUserId}, Sender User ID: ${senderIdStr}`);

      if (senderIdStr === aiBotUserId) {
        logger.debug('[AI Service] Message was sent by the AI Bot itself. Ignoring.');
        return;
      }

      // Check if conversation exists
      if (!conversationId) {
        logger.warn('[AI Service] Conversation ID is missing in message object. Ignoring.');
        return;
      }
      const conversation = await ConversationModel.findById(conversationId)
        .populate('participants', 'username name');
      if (!conversation) {
        logger.warn(`[AI Service] Conversation ${conversationId} not found in database. Ignoring.`);
        return;
      }

      // Check if the AI Bot is a participant (supporting both populated and unpopulated participant arrays)
      const isAIBotInConversation = conversation.participants.some((p: any) => {
        const participantId = p._id ? p._id.toString() : p.toString();
        return participantId === aiBotUserId;
      });
      logger.info(`[AI Service] Is AI Bot a participant of this conversation? ${isAIBotInConversation}`);
      if (!isAIBotInConversation) return;

      // Determine if the AI bot should respond
      let shouldRespond = false;
      let promptText = message.content;

      if (!conversation.isGroup) {
        // Direct message: Respond to every user message
        shouldRespond = true;
      } else {
        // Group chat: Respond only if mentioned with @chatly_ai or @ai
        const mentionPattern = /@chatly_ai\b|@ai\b/i;
        if (mentionPattern.test(message.content)) {
          shouldRespond = true;
          // Clean the prompt by removing the mention tag
          promptText = message.content.replace(mentionPattern, '').trim();
        }
      }

      logger.info(`[AI Service] Conversation type: ${conversation.isGroup ? 'Group' : 'Direct'}, shouldRespond: ${shouldRespond}`);
      if (!shouldRespond) return;

      // Broadcast typing indicator to the conversation
      logger.info(`[AI Service] Emitting typing:start for AI Bot in room conversation:${conversationId}`);
      io.to(`conversation:${conversationId}`).emit('typing:start', {
        conversationId,
        userId: aiBotUserId,
        username: 'chatly_ai',
      });

      // Gather recent messages for context (last 15 messages)
      const rawMessages = await MessageModel.find({ conversationId })
        .sort({ createdAt: -1 })
        .limit(15)
        .populate('senderId', 'username name');

      // Decrypt messages and sort by oldest first
      const messagesContext = rawMessages.reverse().map((msg) => {
        let textContent = '';
        if (msg.isDeleted) {
          textContent = 'This message was deleted';
        } else {
          try {
            textContent = encryptionService.decryptMessage(msg.content, msg.iv, msg.authTag);
          } catch (err) {
            textContent = '[Decryption Failed]';
          }
        }
        
        const isBot = msg.senderId && (msg.senderId as any).username === 'chatly_ai';
        return {
          role: isBot ? 'model' : 'user',
          text: isBot ? textContent : `${(msg.senderId as any)?.name || 'User'}: ${textContent}`,
        };
      });

      // Format contents and merge consecutive roles to satisfy Gemini SDK specs
      const mergedContents: { role: string; parts: { text: string }[] }[] = [];
      for (const ctx of messagesContext) {
        const lastContent = mergedContents[mergedContents.length - 1];
        if (lastContent && lastContent.role === ctx.role) {
          lastContent.parts[0].text += `\n${ctx.text}`;
        } else {
          mergedContents.push({
            role: ctx.role,
            parts: [{ text: ctx.text }],
          });
        }
      }

      // Ensure the conversation starts with a 'user' role for Gemini
      while (mergedContents.length > 0 && mergedContents[0].role !== 'user') {
        mergedContents.shift();
      }

      if (mergedContents.length === 0) {
        mergedContents.push({
          role: 'user',
          parts: [{ text: promptText }],
        });
      }

      // Call Gemini API
      if (!genAI) {
        throw new Error('Generative AI client is not initialized');
      }

      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: 'You are Chatly AI, a helpful, witty, and friendly AI assistant integrated into Chatly, a real-time messaging application. Keep your responses conversational, concise, and helpful. You can format text with markdown (bold, lists, etc) but keep it clean. Do not add prefix metadata to your responses.',
      });

      const result = await model.generateContent({
        contents: mergedContents,
      });

      const aiResponseText = result.response.text() || 'Sorry, I encountered an issue processing your request.';

      // Stop typing indicator
      io.to(`conversation:${conversationId}`).emit('typing:stop', {
        conversationId,
        userId: aiBotUserId,
        username: 'chatly_ai',
      });

      // Encrypt the AI response content
      const { encryptedContent, iv, authTag } = encryptionService.encryptMessage(aiResponseText);

      // Save the AI message to DB
      const botMessage = await MessageModel.create({
        conversationId,
        senderId: aiBotUserId,
        content: encryptedContent,
        iv,
        authTag,
      });

      // Update last message pointer in conversation
      await ConversationModel.findByIdAndUpdate(conversationId, {
        lastMessage: botMessage._id,
      });

      // Populate AI message object
      const populatedBotMsg = await MessageModel.findById(botMessage._id)
        .populate('senderId', 'name username email avatar isOnline lastSeen');

      if (populatedBotMsg) {
        const botMsgObj = populatedBotMsg.toObject();
        botMsgObj.content = aiResponseText;

        // Emit new message event to the room
        io.to(`conversation:${conversationId}`).emit('message:receive', botMsgObj);
        
        // Also trigger notifications for other participants
        conversation.participants.forEach((participant: any) => {
          const participantId = participant._id.toString();
          if (participantId !== aiBotUserId) {
            io.to(`user:${participantId}`).emit('message:notification', {
              conversationId,
              message: botMsgObj,
            });
          }
        });
      }

    } catch (error) {
      logger.error('[AI Service] Error responding to message:', error);
      // Ensure typing is stopped on error
      try {
        const conversationId = message.conversationId.toString();
        const UserModel = mongoose.model('User');
        const aiBot = await UserModel.findOne({ username: 'chatly_ai' });
        if (aiBot) {
          io.to(`conversation:${conversationId}`).emit('typing:stop', {
            conversationId,
            userId: aiBot._id.toString(),
            username: 'chatly_ai',
          });
        }
      } catch (err) {}
    }
  });
};
