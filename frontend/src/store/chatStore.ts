import { create } from 'zustand';
import { api } from '../services/api';
import { useSocketStore } from './socketStore';
import type { User } from './authStore';

export interface Message {
  _id: string;
  conversationId: string;
  senderId: User;
  content: string;
  isDeleted: boolean;
  isPinned: boolean;
  replyTo?: Message;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  _id: string;
  name?: string;
  isGroup: boolean;
  participants: User[];
  admins: string[];
  owner?: string;
  avatar?: string;
  lastMessage?: Message;
  createdAt: string;
  updatedAt: string;
}

interface ChatState {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: Message[];
  nextCursor: string | null;
  typingUsers: Record<string, { username: string; timeoutId?: any }>;
  isConversationsLoading: boolean;
  isMessagesLoading: boolean;
  error: string | null;

  fetchConversations: () => Promise<void>;
  selectConversation: (conversation: Conversation | null) => Promise<void>;
  fetchMessages: (loadMore?: boolean) => Promise<void>;
  sendMessage: (content: string, replyTo?: string) => Promise<void>;
  addMessageReceived: (message: Message) => void;
  setUserTyping: (userId: string, username: string, isTyping: boolean) => void;
  createGroup: (name: string, participants: string[]) => Promise<Conversation>;
  addGroupMembers: (conversationId: string, participantIds: string[]) => Promise<Conversation>;
  updateGroupConversation: (conversation: Conversation) => void;
  upsertGroupConversation: (conversation: Conversation) => void;
  deleteMessage: (messageId: string, type: 'me' | 'everyone') => Promise<void>;
  deleteMessageReceived: (messageId: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversation: null,
  messages: [],
  nextCursor: null,
  typingUsers: {},
  isConversationsLoading: false,
  isMessagesLoading: false,
  error: null,

  fetchConversations: async () => {
    set({ isConversationsLoading: true, error: null });
    try {
      const response = await api.get('/conversations');
      const conversations = response.data.data.conversations;
      set({ conversations, isConversationsLoading: false });
    } catch (err: any) {
      set({ error: err.response?.data?.message || 'Failed to fetch conversations', isConversationsLoading: false });
    }
  },

  selectConversation: async (conversation) => {
    const previous = get().activeConversation;
    const socket = useSocketStore.getState().socket;

    // Handle WebSocket room transfers
    if (socket) {
      if (previous) {
        socket.emit('conversation:leave', { conversationId: previous._id });
      }
      if (conversation) {
        socket.emit('conversation:join', { conversationId: conversation._id });
      }
    }

    set({
      activeConversation: conversation,
      messages: [],
      nextCursor: null,
      typingUsers: {},
    });

    if (conversation) {
      await get().fetchMessages(false);
    }
  },

  fetchMessages: async (loadMore = false) => {
    const active = get().activeConversation;
    if (!active) return;

    const cursor = get().nextCursor;
    if (loadMore && !cursor) return; // No more pages to load

    set({ isMessagesLoading: !loadMore, error: null });
    try {
      const response = await api.get(`/messages/${active._id}`, {
        params: {
          limit: 20,
          cursor: loadMore ? cursor : undefined,
        },
      });

      const newMessages = response.data.data.messages;
      const nextCursor = response.data.data.nextCursor;

      set((state) => ({
        messages: loadMore ? [...newMessages.reverse(), ...state.messages] : newMessages.reverse(),
        nextCursor,
        isMessagesLoading: false,
      }));
    } catch (err: any) {
      set({ error: err.response?.data?.message || 'Failed to fetch messages', isMessagesLoading: false });
    }
  },

  sendMessage: async (content, replyTo) => {
    const active = get().activeConversation;
    if (!active) return;

    try {
      const response = await api.post('/messages', {
        conversationId: active._id,
        content,
        replyTo,
      });

      const message = response.data.data.message;

      // Update local message state list if not already added by socket
      set((state) => {
        if (state.messages.some((m) => m._id === message._id)) {
          return {};
        }
        return {
          messages: [...state.messages, message],
        };
      });

      // Update sidebar conversation preview status
      set((state) => {
        const updated = state.conversations.map((c) => {
          if (c._id === active._id) {
            return { ...c, lastMessage: message, updatedAt: new Date().toISOString() };
          }
          return c;
        });

        // Re-sort chats list placing the active chat at the top
        const sorted = [...updated].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );

        return { conversations: sorted };
      });
    } catch (err: any) {
      set({ error: err.response?.data?.message || 'Failed to send message' });
      throw err;
    }
  },

  addMessageReceived: (message) => {
    const active = get().activeConversation;

    // If message is for the currently open conversation, append to list
    if (active && message.conversationId === active._id) {
      set((state) => {
        if (state.messages.some((m) => m._id === message._id)) {
          return {};
        }
        return {
          messages: [...state.messages, message],
        };
      });
    }

    // Update conversation state in sidebar list
    set((state) => {
      const updated = state.conversations.map((c) => {
        if (c._id === message.conversationId) {
          return { ...c, lastMessage: message, updatedAt: message.createdAt };
        }
        return c;
      });

      // Move updated conversation to top
      const sorted = [...updated].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      return { conversations: sorted };
    });
  },

  setUserTyping: (userId, username, isTyping) => {
    set((state) => {
      const typingUsers = { ...state.typingUsers };

      if (isTyping) {
        // Clear old timeout if exists
        if (typingUsers[userId]?.timeoutId) {
          clearTimeout(typingUsers[userId].timeoutId);
        }

        // Auto-remove indicator after 3s of inactivity
        const timeoutId = setTimeout(() => {
          get().setUserTyping(userId, username, false);
        }, 3000);

        typingUsers[userId] = { username, timeoutId };
      } else {
        if (typingUsers[userId]?.timeoutId) {
          clearTimeout(typingUsers[userId].timeoutId);
        }
        delete typingUsers[userId];
      }

      return { typingUsers };
    });
  },

  createGroup: async (name, participants) => {
    set({ isConversationsLoading: true, error: null });
    try {
      const response = await api.post('/conversations/group', {
        name,
        participants,
      });

      const conversation = response.data.data.conversation;

      set((state) => {
        const conversations = [conversation, ...state.conversations];
        return { conversations, isConversationsLoading: false };
      });

      return conversation;
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to create group';
      set({ error: msg, isConversationsLoading: false });
      throw new Error(msg);
    }
  },

  addGroupMembers: async (conversationId, participantIds) => {
    try {
      const response = await api.post(`/conversations/${conversationId}/participants`, {
        participantIds,
      });

      const conversation = response.data.data.conversation;
      get().updateGroupConversation(conversation);
      return conversation;
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to add members';
      set({ error: msg });
      throw new Error(msg);
    }
  },

  updateGroupConversation: (conversation) => {
    set((state) => {
      const conversations = state.conversations.map((c) =>
        c._id === conversation._id ? conversation : c
      );
      const activeConversation =
        state.activeConversation?._id === conversation._id
          ? conversation
          : state.activeConversation;

      return { conversations, activeConversation };
    });
  },

  upsertGroupConversation: (conversation) => {
    set((state) => {
      const exists = state.conversations.some((c) => c._id === conversation._id);
      const conversations = exists
        ? state.conversations.map((c) => (c._id === conversation._id ? conversation : c))
        : [conversation, ...state.conversations];

      return { conversations };
    });
  },

  deleteMessage: async (messageId, type) => {
    const normalizedId = String(messageId);
    try {
      await api.delete(`/messages/${messageId}`, {
        params: { type },
      });

      if (type === 'me') {
        set((state) => {
          const messages = state.messages.filter((m) => String(m._id) !== normalizedId);
          const conversations = state.conversations.map((c) => {
            if (c.lastMessage && String(c.lastMessage._id) === normalizedId) {
              return { ...c, lastMessage: undefined };
            }
            return c;
          });
          const activeConversation =
            state.activeConversation &&
            state.activeConversation.lastMessage &&
            String(state.activeConversation.lastMessage._id) === normalizedId
              ? { ...state.activeConversation, lastMessage: undefined }
              : state.activeConversation;

          return { messages, conversations, activeConversation };
        });
      } else {
        get().deleteMessageReceived(normalizedId);
      }
    } catch (err: any) {
      set({ error: err.response?.data?.message || 'Failed to delete message' });
      throw err;
    }
  },

  deleteMessageReceived: (messageId) => {
    const normalizedId = String(messageId);
    set((state) => {
      const updatedMessages = state.messages.map((m) => {
        if (String(m._id) === normalizedId) {
          return {
            ...m,
            isDeleted: true,
            content: 'This message was deleted',
          };
        }
        return m;
      });

      const deletedLastMessage = {
        isDeleted: true,
        content: 'This message was deleted',
      };

      const updatedConversations = state.conversations.map((c) => {
        if (c.lastMessage && String(c.lastMessage._id) === normalizedId) {
          return {
            ...c,
            lastMessage: { ...c.lastMessage, ...deletedLastMessage },
          };
        }
        return c;
      });

      const activeConversation =
        state.activeConversation &&
        state.activeConversation.lastMessage &&
        String(state.activeConversation.lastMessage._id) === normalizedId
          ? {
              ...state.activeConversation,
              lastMessage: {
                ...state.activeConversation.lastMessage,
                ...deletedLastMessage,
              },
            }
          : state.activeConversation;

      return {
        messages: updatedMessages,
        conversations: updatedConversations,
        activeConversation,
      };
    });
  },
}));
