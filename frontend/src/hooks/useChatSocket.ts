import { useEffect } from 'react';
import { useSocketStore } from '../store/socketStore';
import { useChatStore } from '../store/chatStore';
import type { Conversation, Message } from '../store/chatStore';

export const useChatSocket = () => {
  const { socket, connectSocket, isConnected } = useSocketStore();
  const {
    addMessageReceived,
    setUserTyping,
    deleteMessageReceived,
    updateGroupConversation,
    upsertGroupConversation,
  } = useChatStore();

  useEffect(() => {
    // Establish connection on mount
    connectSocket();
  }, [connectSocket]);

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Listen to real-time incoming messages
    socket.on('message:receive', (message: Message) => {
      addMessageReceived(message);
    });

    // Listen to real-time message deletion
    socket.on('message:delete', (data: { messageId: string; conversationId: string }) => {
      deleteMessageReceived(data.messageId);
    });

    // Listen to typing start indicators
    socket.on('typing:start', (data: { conversationId: string; userId: string; username: string }) => {
      setUserTyping(data.userId, data.username, true);
    });

    // Listen to typing stop indicators
    socket.on('typing:stop', (data: { conversationId: string; userId: string }) => {
      setUserTyping(data.userId, '', false);
    });

    // Helper to update presence on conversation participant objects
    const updatePresence = (userId: string, isOnline: boolean, lastSeen?: string) => {
      useChatStore.setState((state) => {
        const conversations = state.conversations.map((conv) => {
          const participants = conv.participants.map((p) => {
            if (p._id === userId || p.id === userId) {
              return { ...p, isOnline, lastSeen };
            }
            return p;
          });
          return { ...conv, participants };
        });

        let activeConversation = state.activeConversation;
        if (activeConversation) {
          const participants = activeConversation.participants.map((p) => {
            if (p._id === userId || p.id === userId) {
              return { ...p, isOnline, lastSeen };
            }
            return p;
          });
          activeConversation = { ...activeConversation, participants };
        }

        return { conversations, activeConversation };
      });
    };

    // Presence listeners
    socket.on('user:online', (data: { userId: string }) => {
      updatePresence(data.userId, true);
    });

    socket.on('user:offline', (data: { userId: string; lastSeen: string }) => {
      updatePresence(data.userId, false, data.lastSeen);
    });

    const handleGroupUpdate = (group: Conversation) => {
      updateGroupConversation(group);
    };

    socket.on('group:updated', handleGroupUpdate);
    socket.on('group:notification_update', handleGroupUpdate);
    socket.on('group:created', (group: Conversation) => {
      upsertGroupConversation(group);
    });

    // Clean up listeners on unmount or socket reset
    return () => {
      socket.off('message:receive');
      socket.off('message:delete');
      socket.off('typing:start');
      socket.off('typing:stop');
      socket.off('user:online');
      socket.off('user:offline');
      socket.off('group:updated');
      socket.off('group:notification_update');
      socket.off('group:created');
    };
  }, [
    socket,
    isConnected,
    addMessageReceived,
    setUserTyping,
    deleteMessageReceived,
    updateGroupConversation,
    upsertGroupConversation,
  ]);
};
