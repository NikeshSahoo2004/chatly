import React, { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import type { Conversation, Message } from '../store/chatStore';
import { useSocketStore } from '../store/socketStore';
import { useChatSocket } from '../hooks/useChatSocket';
import { api } from '../services/api';
import {
  LogOut,
  MessageSquare,
  Users,
  Search,
  Send,
  Plus,
  Loader2,
  X,
  MessageCircle,
  ChevronLeft,
  Paperclip,
  MoreVertical,
  Trash,
  UserPlus,
  Crown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { HotstarLogo } from '../components/HotstarLogo';
import { ThemeToggle } from '../components/ThemeToggle';

export const ChatDashboard: React.FC = () => {
  // Bind Socket.IO listeners
  useChatSocket();

  const { user, logout } = useAuthStore();
  const { socket } = useSocketStore();
  const {
    conversations,
    fetchConversations,
    activeConversation,
    selectConversation,
    messages,
    fetchMessages,
    sendMessage,
    typingUsers,
    createGroup,
    isConversationsLoading,
    isMessagesLoading,
    deleteMessage,
    addGroupMembers,
  } = useChatStore();

  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchUserQuery, setSearchUserQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<any[]>([]);
  const [groupName, setGroupName] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  // Add members to existing group
  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [addMemberSearchQuery, setAddMemberSearchQuery] = useState('');
  const [addMemberSearchResults, setAddMemberSearchResults] = useState<any[]>([]);
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);

  // Message history search state
  const [searchMessageQuery, setSearchMessageQuery] = useState('');
  const [isSearchingMessages, setIsSearchingMessages] = useState(false);
  const [messageSearchResults, setMessageSearchResults] = useState<Message[]>([]);

  // Message menu dropdown controls
  const [activeMenuMessageId, setActiveMenuMessageId] = useState<string | null>(null);

  const isWithinTwoMinutes = (createdAt: string) => {
    return (Date.now() - new Date(createdAt).getTime()) <= 2 * 60 * 1000;
  };

  const handleDeleteClick = async (
    e: React.MouseEvent,
    messageId: string,
    type: 'me' | 'everyone'
  ) => {
    e.stopPropagation();
    try {
      await deleteMessage(messageId, type);
      setActiveMenuMessageId(null);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete message');
    }
  };

  // Close message menu when clicking outside (without blocking menu clicks)
  useEffect(() => {
    if (!activeMenuMessageId) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-message-menu]')) {
        setActiveMenuMessageId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeMenuMessageId]);

  // Scroll controls
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [oldScrollHeight, setOldScrollHeight] = useState<number | null>(null);

  // typing emit handler
  const typingTimeoutRef = useRef<any>(null);

  // Attachment upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isFileUploading, setIsFileUploading] = useState(false);

  // Fetch inbox conversations on load
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Adjust scroll placement when messages change
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container && oldScrollHeight !== null) {
      // Restore scroll height offset after loading older paginated messages
      container.scrollTop = container.scrollHeight - oldScrollHeight;
      setOldScrollHeight(null);
    } else {
      // Auto scroll to bottom for new messages
      scrollToBottom();
    }
  }, [messages]);

  const scrollToBottom = () => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  // Listen to message scroll top for pagination load triggers
  const handleScroll = async () => {
    const container = scrollContainerRef.current;
    if (container && container.scrollTop === 0 && !isMessagesLoading) {
      // Save current scroll height offset before loading older page
      setOldScrollHeight(container.scrollHeight);
      await fetchMessages(true);
    }
  };

  // Handle input text changes with throttled typing triggers
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);

    if (!socket || !activeConversation) return;

    if (!isTyping) {
      setIsTyping(true);
      socket.emit('typing:start', { conversationId: activeConversation._id });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket.emit('typing:stop', { conversationId: activeConversation._id });
    }, 2000);
  };

  // Submit secure message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeConversation) return;

    // Send typing stop event immediately
    if (socket) {
      setIsTyping(false);
      socket.emit('typing:stop', { conversationId: activeConversation._id });
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    try {
      const content = inputText;
      setInputText('');
      await sendMessage(content);
    } catch (err) {
      // Handled by store
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConversation) return;

    // Enforce 50MB size limit
    if (file.size > 50 * 1024 * 1024) {
      alert('File size exceeds the 50MB limit.');
      return;
    }

    setIsFileUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await api.post('/chat/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const { url, resourceType } = response.data.data;
      const prefix = resourceType === 'video' ? '[VIDEO]:' : '[IMAGE]:';
      await sendMessage(`${prefix}${url}`);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to upload media file.');
    } finally {
      setIsFileUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Search users by email or username in backend lookup
  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      if (!searchUserQuery.trim()) {
        setUserSearchResults([]);
        return;
      }
      try {
        const response = await api.get(`/users/search?q=${searchUserQuery}`);
        setUserSearchResults(response.data.data.users);
      } catch (err) {
        setUserSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchUserQuery]);

  // Search message content in-memory inside the active conversation
  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      if (!searchMessageQuery.trim() || !activeConversation) {
        setMessageSearchResults([]);
        setIsSearchingMessages(false);
        return;
      }
      setIsSearchingMessages(true);
      try {
        const response = await api.get(`/messages/${activeConversation._id}/search?q=${searchMessageQuery}`);
        setMessageSearchResults(response.data.data.messages);
      } catch (err) {
        setMessageSearchResults([]);
      } finally {
        setIsSearchingMessages(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [searchMessageQuery, activeConversation]);

  // Create a 1-to-1 direct chat
  const handleStartDirectChat = async (recipientId: string) => {
    try {
      const response = await api.post('/conversations', { recipientId });
      const conversation = response.data.data.conversation;
      await fetchConversations();
      await selectConversation(conversation);
      setShowCreateModal(false);
      setSearchUserQuery('');
      setUserSearchResults([]);
    } catch (err) {
      // Fail silently or prompt error
    }
  };

  // Add user to group participant buffer
  const toggleGroupParticipant = (u: any) => {
    if (selectedParticipants.some((p) => p._id === u._id)) {
      setSelectedParticipants(selectedParticipants.filter((p) => p._id !== u._id));
    } else {
      setSelectedParticipants([...selectedParticipants, u]);
    }
  };

  // Create group chat session
  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedParticipants.length === 0) return;
    setIsCreatingGroup(true);
    try {
      const ids = selectedParticipants.map((p) => p._id);
      const conversation = await createGroup(groupName, ids);
      await selectConversation(conversation);
      setShowCreateModal(false);
      setGroupName('');
      setSelectedParticipants([]);
      setSearchUserQuery('');
    } catch (err) {
      // Prompt error
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const getDirectChatRecipient = (conv: Conversation) => {
    const currentUserId = user?.id || user?._id;
    return conv.participants.find((p) => {
      const participantId = p.id || p._id;
      return participantId !== currentUserId;
    });
  };

  const currentUserId = user?.id || user?._id;

  const isGroupAdmin = (conv: Conversation) => {
    if (!currentUserId || !conv.isGroup) return false;
    return conv.admins?.some((adminId) => String(adminId) === String(currentUserId));
  };

  const isParticipantInGroup = (conv: Conversation, userId: string) => {
    return conv.participants.some((p) => String(p._id || p.id) === String(userId));
  };

  // Search users to add to an existing group
  useEffect(() => {
    if (!showAddMembersModal) return;

    const delayDebounce = setTimeout(async () => {
      if (!addMemberSearchQuery.trim()) {
        setAddMemberSearchResults([]);
        return;
      }
      try {
        const response = await api.get(`/users/search?q=${addMemberSearchQuery}`);
        setAddMemberSearchResults(response.data.data.users);
      } catch {
        setAddMemberSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [addMemberSearchQuery, showAddMembersModal]);

  const handleAddMemberToGroup = async (memberId: string) => {
    if (!activeConversation?.isGroup) return;

    setIsAddingMembers(true);
    setAddMemberError(null);
    try {
      await addGroupMembers(activeConversation._id, [memberId]);
      setAddMemberSearchQuery('');
      setAddMemberSearchResults([]);
    } catch (err: any) {
      setAddMemberError(err.message || 'Failed to add member');
    } finally {
      setIsAddingMembers(false);
    }
  };

  const closeAddMembersModal = () => {
    setShowAddMembersModal(false);
    setAddMemberSearchQuery('');
    setAddMemberSearchResults([]);
    setAddMemberError(null);
  };

  return (
    <div className="relative flex h-[100dvh] w-screen flex-col overflow-hidden hs-app font-sans">
      <div className="absolute top-[-20%] left-[-10%] h-[60%] w-[60%] hs-bg-glow-1 glow-bg" />
      <div className="absolute bottom-[-20%] right-[-10%] h-[60%] w-[60%] hs-bg-glow-2 glow-bg" />

      {/* Top navigation bar */}
      <header className="hs-topbar relative z-30">
        <div className="flex items-center gap-3 min-w-0">
          {activeConversation && (
            <button
              onClick={() => selectConversation(null)}
              className="hs-btn-icon md:hidden"
              title="Back to Chats"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <HotstarLogo size="sm" showText={!activeConversation} />
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-[var(--hs-border)]">
            <div className="hs-avatar !h-8 !w-8 !rounded-full !text-xs">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <span className="text-sm font-semibold hs-text hidden md:block max-w-[120px] truncate">
              {user?.name}
            </span>
          </div>
          <button onClick={() => logout()} className="hs-btn-icon text-red-500 hover:text-red-400" title="Log Out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="relative z-10 flex flex-1 min-h-0 overflow-hidden">
        {/* Icon rail */}
        <div className={`hs-rail ${activeConversation ? 'hidden md:flex' : 'hidden md:flex'}`}>
          <nav className="flex flex-col gap-3">
            <button className="hs-rail-btn active" title="Chats">
              <MessageSquare className="h-5 w-5" />
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="hs-rail-btn"
              title="New Chat"
            >
              <Users className="h-5 w-5" />
            </button>
          </nav>
          <button onClick={() => logout()} className="hs-rail-btn text-red-400 hover:text-red-300" title="Log Out">
            <LogOut className="h-5 w-5" />
          </button>
        </div>

        {/* Conversations sidebar */}
        <div className={`hs-sidebar z-10 w-full md:w-80 flex-col ${activeConversation ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b border-[var(--hs-border)]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold tracking-tight hs-gradient-text">Chats</h2>
              <button
                onClick={() => setShowCreateModal(true)}
                className="hs-btn-icon border border-[var(--hs-border)]"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

        {/* Conversation List Feed */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {isConversationsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--hs-accent-from)' }} />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-10 text-xs hs-text-muted px-4">
              No conversations yet. Tap + to start chatting!
            </div>
          ) : (
            conversations.map((conv) => {
              const isSelected = activeConversation?._id === conv._id;
              const recipient = !conv.isGroup ? getDirectChatRecipient(conv) : null;
              const title = conv.isGroup
                ? conv.name
                : (recipient?.name || recipient?.username || 'Direct Message');
              let lastMsgText = 'No messages yet';
              if (conv.lastMessage) {
                if (conv.lastMessage.isDeleted) {
                  lastMsgText = 'This message was deleted';
                } else if (conv.lastMessage.content?.startsWith('[IMAGE]:')) {
                  lastMsgText = '📷 Image';
                } else if (conv.lastMessage.content?.startsWith('[VIDEO]:')) {
                  lastMsgText = '🎥 Video';
                } else {
                  lastMsgText = conv.lastMessage.content;
                }
              }
              const avatarInitials = conv.isGroup
                ? conv.name?.slice(0, 2).toUpperCase()
                : (recipient?.name || recipient?.username || 'DM').slice(0, 2).toUpperCase();

              const isOnline = !conv.isGroup && recipient?.isOnline;

              return (
                <div
                  key={conv._id}
                  onClick={() => selectConversation(conv)}
                  className={`hs-conv-card mx-1 ${isSelected ? 'selected' : ''}`}
                >
                  <div className="hs-avatar">
                    {avatarInitials}
                    {isOnline && <div className="hs-online-dot" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold truncate hs-text">{title}</span>
                      {conv.lastMessage && (
                        <span className="text-[10px] hs-text-muted shrink-0">
                          {new Date(conv.lastMessage.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs hs-text-muted truncate mt-0.5">{lastMsgText}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="hs-profile-footer flex items-center gap-3">
          <div className="hs-avatar !rounded-full">
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold truncate hs-text">{user?.name}</h4>
            <span className="text-xs hs-text-muted truncate block">@{user?.username}</span>
          </div>
        </div>
      </div>

      {/* Main chat panel */}
      <div className={`hs-chat-panel z-10 ${activeConversation ? 'flex' : 'hidden md:flex'}`}>
        {activeConversation ? (
          <>
            <div className="hs-chat-header flex-wrap gap-3 py-2 sm:flex-nowrap sm:py-0">
              <div className="flex flex-1 items-center min-w-0 gap-3">
                <div className="hs-avatar !h-10 !w-10 md:hidden">
                  {(activeConversation.isGroup
                    ? activeConversation.name
                    : getDirectChatRecipient(activeConversation)?.name || 'U'
                  )?.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold hs-text truncate">
                    {activeConversation.isGroup
                      ? activeConversation.name
                      : getDirectChatRecipient(activeConversation)?.name}
                  </h3>
                  <span className="text-xs hs-text-muted block">
                    {activeConversation.isGroup
                      ? `${activeConversation.participants.length} members`
                      : getDirectChatRecipient(activeConversation)?.isOnline
                        ? '● Online'
                        : 'Offline'}
                  </span>
                </div>
              </div>

              <div className="flex w-full items-center gap-1.5 sm:ml-2 sm:w-auto sm:gap-2">
                {activeConversation.isGroup && isGroupAdmin(activeConversation) && (
                  <button
                    type="button"
                    onClick={() => setShowAddMembersModal(true)}
                    className="hs-btn-icon border border-[var(--hs-border)]"
                    title="Add members"
                  >
                    <UserPlus className="h-4 w-4" />
                  </button>
                )}
                {activeConversation.isGroup && (
                  <button
                    type="button"
                    onClick={() => setShowAddMembersModal(true)}
                    className="hs-btn-icon border border-[var(--hs-border)]"
                    title="View members"
                  >
                    <Users className="h-4 w-4" />
                  </button>
                )}
                <div className="relative min-w-0 flex-1 sm:w-48 sm:flex-none">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 hs-text-muted">
                    <Search className="h-3.5 w-3.5" />
                  </span>
                  <input
                    type="text"
                    placeholder="Search messages..."
                    value={searchMessageQuery}
                    onChange={(e) => setSearchMessageQuery(e.target.value)}
                    className="hs-input py-1.5 pl-8 pr-3 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* In-Memory Search Results Overlay if active */}
            {searchMessageQuery.trim() ? (
              <div className="flex-1 overflow-y-auto p-3 space-y-4 z-20 sm:p-6" style={{ background: 'var(--hs-surface)' }}>
                <div className="flex items-center justify-between gap-3 mb-4 border-b border-[var(--hs-border)] pb-2">
                  <span className="text-sm font-bold hs-text-secondary">
                    Search Results ({messageSearchResults.length})
                  </span>
                  <button onClick={() => setSearchMessageQuery('')} className="hs-btn-icon">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {isSearchingMessages ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--hs-accent-from)' }} />
                  </div>
                ) : messageSearchResults.length === 0 ? (
                  <div className="text-center py-10 text-xs hs-text-muted">
                    No matching messages found.
                  </div>
                ) : (
                  messageSearchResults.map((msg) => {
                    const currentUserId = user?.id || user?._id;
                    const senderIdStr = typeof msg.senderId === 'object' && msg.senderId
                      ? (msg.senderId._id || msg.senderId.id)
                      : msg.senderId;
                    const isSelf = senderIdStr === currentUserId;
                    const senderName = isSelf
                      ? 'You'
                      : (typeof msg.senderId === 'object' && msg.senderId ? (msg.senderId.name || msg.senderId.username || 'User') : 'User');
                    return (
                      <div key={msg._id} className="border-b border-[var(--hs-border)] pb-3">
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs hs-text-muted mb-1">
                          <span className="font-bold" style={{ color: 'var(--hs-accent-from)' }}>{senderName}</span>
                          <span>{new Date(msg.createdAt).toLocaleString()}</span>
                        </div>
                        {msg.content.startsWith('[IMAGE]:') ? (
                          <p className="text-sm hs-text-muted italic">📷 Image message</p>
                        ) : msg.content.startsWith('[VIDEO]:') ? (
                          <p className="text-sm hs-text-muted italic">🎥 Video message</p>
                        ) : (
                          <p className="text-sm hs-text">{msg.content}</p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              /* Message Logs container scrolling feed */
              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-3 space-y-3 sm:p-6 sm:space-y-4"
              >
                {isMessagesLoading && (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--hs-accent-from)' }} />
                  </div>
                )}

                {messages.map((msg) => {
                  const currentUserId = user?.id || user?._id;
                  const senderIdStr = typeof msg.senderId === 'object' && msg.senderId
                    ? (msg.senderId._id || msg.senderId.id)
                    : msg.senderId;
                  const isSelf = senderIdStr === currentUserId;
                  const senderName = typeof msg.senderId === 'object' && msg.senderId
                    ? (msg.senderId.name || msg.senderId.username || 'User')
                    : 'User';

                  return (
                    <div
                      key={msg._id}
                      className={`group relative flex items-end gap-2 sm:gap-3 ${isSelf ? 'justify-end' : 'justify-start'}`}
                    >
                      {!isSelf && (
                        <div className="hs-avatar !h-8 !w-8 !rounded-full !text-[10px]">
                          {senderName.slice(0, 2)}
                        </div>
                      )}

                      {/* Message Option Menu trigger on the left of bubble if isSelf */}
                      {isSelf && !msg.isDeleted && (
                        <div
                          data-message-menu
                          className={`relative self-center transition-opacity duration-200 ${
                            activeMenuMessageId === msg._id
                              ? 'opacity-100 pointer-events-auto z-50'
                              : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuMessageId(activeMenuMessageId === msg._id ? null : msg._id);
                            }}
                            className="hs-btn-icon"
                            title="Message Options"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>

                          {activeMenuMessageId === msg._id && (
                            <div className="hs-menu-dropdown bottom-full right-0 mb-1">
                              <button
                                type="button"
                                onClick={(e) => handleDeleteClick(e, msg._id, 'me')}
                                className="hs-menu-item"
                              >
                                <Trash className="h-3.5 w-3.5" />
                                Delete for me
                              </button>
                              {isWithinTwoMinutes(msg.createdAt) && (
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteClick(e, msg._id, 'everyone')}
                                  className="hs-menu-item danger"
                                >
                                  <Trash className="h-3.5 w-3.5" />
                                  {activeConversation.isGroup ? 'Delete for everyone' : 'Delete for both'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      <div
                        className={`max-w-[min(78vw,28rem)] break-words p-3 text-sm sm:p-4 ${
                          msg.isDeleted
                            ? 'hs-bubble-deleted' + (isSelf ? ' rounded-br-sm' : ' rounded-bl-sm')
                            : isSelf
                              ? 'hs-bubble-self'
                              : 'hs-bubble-other'
                        }`}
                      >
                        {!isSelf && activeConversation.isGroup && !msg.isDeleted && (
                          <span className="block text-xs font-bold mb-1" style={{ color: 'var(--hs-accent-from)' }}>
                            {senderName}
                          </span>
                        )}
                        {msg.isDeleted ? (
                          <p className="leading-relaxed">This message was deleted</p>
                        ) : msg.content.startsWith('[IMAGE]:') ? (
                          <div className="mt-1">
                            <img
                              src={msg.content.substring(8)}
                              alt="Shared image"
                              className="h-auto max-w-full rounded-lg border border-white/10 transition-all hover:opacity-95 cursor-zoom-in"
                              onClick={() => window.open(msg.content.substring(8), '_blank')}
                            />
                          </div>
                        ) : msg.content.startsWith('[VIDEO]:') ? (
                          <div className="mt-1">
                            <video
                              src={msg.content.substring(8)}
                              controls
                              className="h-auto max-w-full rounded-lg border border-white/10"
                            />
                          </div>
                        ) : (
                          <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        )}
                        <span
                          className={`mt-1.5 block text-[9px] text-right ${
                            msg.isDeleted
                              ? 'hs-text-muted'
                              : isSelf
                                ? 'text-white/70'
                                : 'hs-text-muted'
                          }`}
                        >
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      {/* Message Option Menu trigger on the right of bubble if !isSelf */}
                      {!isSelf && !msg.isDeleted && (
                        <div
                          data-message-menu
                          className={`relative self-center transition-opacity duration-200 ${
                            activeMenuMessageId === msg._id
                              ? 'opacity-100 pointer-events-auto z-50'
                              : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuMessageId(activeMenuMessageId === msg._id ? null : msg._id);
                            }}
                            className="hs-btn-icon"
                            title="Message Options"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>

                          {activeMenuMessageId === msg._id && (
                            <div className="hs-menu-dropdown bottom-full left-0 mb-1">
                              <button
                                type="button"
                                onClick={(e) => handleDeleteClick(e, msg._id, 'me')}
                                className="hs-menu-item"
                              >
                                <Trash className="h-3.5 w-3.5" />
                                Delete for me
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Typing status bubble indicators */}
                {Object.keys(typingUsers).length > 0 && (
                  <div className="flex items-center gap-2 text-xs hs-text-muted italic px-2">
                    <div className="flex gap-1">
                      <span className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: 'var(--hs-accent-from)' }}></span>
                      <span className="h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:0.2s]" style={{ background: 'var(--hs-accent-mid)' }}></span>
                      <span className="h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:0.4s]" style={{ background: 'var(--hs-accent-to)' }}></span>
                    </div>
                    <span>
                      {Object.values(typingUsers)
                        .map((u) => u.username)
                        .join(', ')}{' '}
                      is typing...
                    </span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}

            <div className="p-3 border-t border-[var(--hs-border)] sm:p-4 md:p-6">
              <form onSubmit={handleSendMessage} className="hs-panel flex items-center gap-2 p-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*,video/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isFileUploading}
                  className="hs-btn-icon shrink-0 disabled:opacity-50"
                  title="Attach Image or Video"
                >
                  {isFileUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--hs-accent-from)' }} />
                  ) : (
                    <Paperclip className="h-4 w-4" />
                  )}
                </button>
                <input
                  type="text"
                  value={inputText}
                  onChange={handleInputChange}
                  placeholder="Type a message..."
                  className="min-w-0 flex-1 bg-transparent border-0 px-2 py-2 text-sm hs-text placeholder:hs-text-muted focus:outline-none focus:ring-0 sm:px-3"
                />
                <button type="submit" className="hs-btn-send shrink-0">
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="hs-empty-state">
            <div className="hs-logo-icon h-20 w-20 rounded-2xl mb-5 opacity-80">
              <MessageCircle className="h-10 w-10 text-white" />
            </div>
            <h3 className="text-xl font-extrabold hs-gradient-text">Start a conversation</h3>
            <p className="text-sm mt-2 hs-text-muted max-w-xs">
              Pick a chat from the sidebar or create a new one to get started.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="hs-btn-primary mt-6 px-6"
            >
              <Plus className="h-4 w-4" />
              New Chat
            </button>
          </div>
        )}
      </div>
      </div>

      {/* Add members to group modal */}
      <AnimatePresence>
        {showAddMembersModal && activeConversation?.isGroup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="hs-card w-full max-w-md p-4 max-h-[90dvh] overflow-y-auto sm:p-6"
            >
              <div className="flex items-center justify-between border-b border-[var(--hs-border)] pb-3 mb-4">
                <div>
                  <h3 className="text-lg font-extrabold hs-gradient-text">Group Members</h3>
                  <p className="text-xs hs-text-muted mt-0.5">{activeConversation.name}</p>
                </div>
                <button onClick={closeAddMembersModal} className="hs-btn-icon">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Current members */}
              <div className="mb-5">
                <p className="text-xs font-bold uppercase tracking-wider hs-text-muted mb-2">
                  {activeConversation.participants.length} Members
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1.5 rounded-xl border border-[var(--hs-border)] p-2" style={{ background: 'var(--hs-surface-2)' }}>
                  {activeConversation.participants.map((p) => {
                    const pid = p._id || p.id;
                    const isAdmin = activeConversation.admins?.some((id) => String(id) === String(pid));
                    const isOwner = String(activeConversation.owner) === String(pid);
                    const isSelf = String(pid) === String(currentUserId);
                    return (
                      <div key={pid} className="flex items-center justify-between gap-2 p-2 rounded-lg">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="hs-avatar !h-8 !w-8 !text-[10px] !rounded-full">
                            {(p.name || p.username || 'U').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm font-semibold hs-text truncate block">
                              {p.name}{isSelf ? ' (You)' : ''}
                            </span>
                            <span className="text-xs hs-text-muted">@{p.username}</span>
                          </div>
                        </div>
                        {(isOwner || isAdmin) && (
                          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide shrink-0" style={{ color: 'var(--hs-accent-from)' }}>
                            <Crown className="h-3 w-3" />
                            {isOwner ? 'Owner' : 'Admin'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add new members (admins only) */}
              {isGroupAdmin(activeConversation) && (
                <div className="space-y-3 border-t border-[var(--hs-border)] pt-4">
                  <p className="text-xs font-bold uppercase tracking-wider hs-text-muted">
                    Add New Members
                  </p>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 hs-text-muted">
                      <Search className="h-4 w-4" />
                    </span>
                    <input
                      type="text"
                      placeholder="Search by username or email..."
                      value={addMemberSearchQuery}
                      onChange={(e) => setAddMemberSearchQuery(e.target.value)}
                      className="hs-input py-2 pl-10 pr-4 text-sm"
                    />
                  </div>

                  {addMemberError && (
                    <p className="text-xs text-red-500">{addMemberError}</p>
                  )}

                  {addMemberSearchResults.length > 0 && (
                    <div className="max-h-36 overflow-y-auto border border-[var(--hs-border)] rounded-xl p-2 space-y-1" style={{ background: 'var(--hs-surface-2)' }}>
                      {addMemberSearchResults.map((u) => {
                        const alreadyMember = isParticipantInGroup(activeConversation, u._id);
                        return (
                          <div
                            key={u._id}
                            className="flex items-center justify-between p-2 rounded-lg"
                          >
                            <div className="min-w-0">
                              <span className="font-bold block hs-text text-sm">{u.name}</span>
                              <span className="text-xs hs-text-muted">@{u.username}</span>
                            </div>
                            {alreadyMember ? (
                              <span className="text-xs hs-text-muted px-2">Already in group</span>
                            ) : (
                              <button
                                onClick={() => handleAddMemberToGroup(u._id)}
                                disabled={isAddingMembers}
                                className="text-xs px-2.5 py-1 rounded-lg text-white cursor-pointer disabled:opacity-50"
                                style={{ background: 'linear-gradient(90deg, var(--hs-accent-from), var(--hs-accent-to))' }}
                              >
                                {isAddingMembers ? 'Adding...' : 'Add'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New chat / group modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="hs-card w-full max-w-md p-4 max-h-[90dvh] overflow-y-auto sm:p-6"
            >
              <div className="flex items-center justify-between border-b border-[var(--hs-border)] pb-3 mb-4">
                <h3 className="text-lg font-extrabold hs-gradient-text">Start Conversation</h3>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setSearchUserQuery('');
                    setUserSearchResults([]);
                    setSelectedParticipants([]);
                  }}
                  className="hs-btn-icon"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider hs-text-muted mb-2">
                    Search user (Username or Email)
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 hs-text-muted">
                      <Search className="h-4 w-4" />
                    </span>
                    <input
                      type="text"
                      placeholder="Type email/username..."
                      value={searchUserQuery}
                      onChange={(e) => setSearchUserQuery(e.target.value)}
                      className="hs-input py-2 pl-10 pr-4 text-sm"
                    />
                  </div>
                </div>

                {userSearchResults.length > 0 && (
                  <div className="max-h-36 overflow-y-auto border border-[var(--hs-border)] rounded-xl p-2 space-y-1" style={{ background: 'var(--hs-surface-2)' }}>
                    {userSearchResults.map((u) => {
                      const isSelected = selectedParticipants.some((p) => p._id === u._id);
                      return (
                        <div
                          key={u._id}
                          className="flex flex-col gap-3 p-2 hover:bg-[var(--hs-accent-soft)] rounded-lg text-sm sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <span className="font-bold block hs-text">{u.name}</span>
                            <span className="text-xs hs-text-muted">@{u.username}</span>
                          </div>
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <button
                              onClick={() => handleStartDirectChat(u._id)}
                              className="text-xs px-2.5 py-1 rounded-lg text-white cursor-pointer"
                              style={{ background: 'linear-gradient(90deg, var(--hs-accent-from), var(--hs-accent-to))' }}
                            >
                              Direct Chat
                            </button>
                            <button
                              onClick={() => toggleGroupParticipant(u)}
                              className={`text-xs px-2.5 py-1 rounded-lg border cursor-pointer ${
                                isSelected
                                  ? 'border-[var(--hs-accent-from)] bg-[var(--hs-accent-soft)]'
                                  : 'border-[var(--hs-border)] hs-text-secondary hover:bg-[var(--hs-surface-3)]'
                              }`}
                              style={isSelected ? { color: 'var(--hs-accent-from)' } : undefined}
                            >
                              {isSelected ? 'Selected' : 'Add to Group'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedParticipants.length > 0 && (
                  <div className="border-t border-[var(--hs-border)] pt-4 mt-2 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {selectedParticipants.map((p) => (
                        <span
                          key={p._id}
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-[var(--hs-border)] hs-text-secondary"
                          style={{ background: 'var(--hs-surface-2)' }}
                        >
                          {p.name}
                          <X
                            className="h-3 w-3 cursor-pointer hover:opacity-70"
                            onClick={() => toggleGroupParticipant(p)}
                          />
                        </span>
                      ))}
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider hs-text-muted mb-2">
                        Group Chat Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Design Team"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        className="hs-input py-2 px-3 text-sm"
                      />
                    </div>

                    <button
                      onClick={handleCreateGroup}
                      disabled={isCreatingGroup || !groupName.trim()}
                      className="hs-btn-primary w-full py-2.5"
                    >
                      {isCreatingGroup ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <span>Create Group Chat</span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
export default ChatDashboard;
