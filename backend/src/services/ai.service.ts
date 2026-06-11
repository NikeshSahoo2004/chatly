import { GoogleGenerativeAI } from '@google/generative-ai';
import { Server } from 'socket.io';
import { Conversation } from '../modules/chat/conversation.model';
import { Message } from '../modules/chat/message.model';
import { User } from '../modules/user/user.model';
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
      // Don't respond to messages sent by the AI Bot itself
      const senderIdStr = typeof message.senderId === 'object' && message.senderId
        ? (message.senderId._id?.toString() || message.senderId.id?.toString())
        : message.senderId?.toString();

      // Find the AI Bot user to compare IDs and get its details
      const aiBot = await User.findOne({ username: 'chatly_ai' });
      if (!aiBot) return;

      const aiBotUserId = aiBot._id.toString();

      if (senderIdStr === aiBotUserId) {
        return;
      }

      // Check if conversation exists
      const conversationId = message.conversationId.toString();
      const conversation = await Conversation.findById(conversationId)
        .populate('participants', 'username name');
      if (!conversation) return;

      // Check if the AI Bot is a participant
      const isAIBotInConversation = conversation.participants.some(
        (p: any) => p._id.toString() === aiBotUserId
      );
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

      if (!shouldRespond) return;

      // Broadcast typing indicator to the conversation
      io.to(`conversation:${conversationId}`).emit('typing:start', {
        conversationId,
        userId: aiBotUserId,
        username: 'chatly_ai',
      });

      // Gather recent messages for context (last 15 messages)
      const rawMessages = await Message.find({ conversationId })
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
      const botMessage = await Message.create({
        conversationId,
        senderId: aiBotUserId,
        content: encryptedContent,
        iv,
        authTag,
      });

      // Update last message pointer in conversation
      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: botMessage._id,
      });

      // Populate AI message object
      const populatedBotMsg = await Message.findById(botMessage._id)
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
        const aiBot = await User.findOne({ username: 'chatly_ai' });
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
