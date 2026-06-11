import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../config/runtime';

interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  connectSocket: () => void;
  disconnectSocket: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,

  connectSocket: () => {
    const currentSocket = get().socket;
    if (currentSocket?.connected) return;

    // Connect to WebSockets passing credentials for handshake auth
    const socketInstance = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket'],
      autoConnect: true,
    });

    socketInstance.on('connect', () => {
      set({ isConnected: true });
    });

    socketInstance.on('disconnect', () => {
      set({ isConnected: false });
    });

    set({ socket: socketInstance });
  },

  disconnectSocket: () => {
    const activeSocket = get().socket;
    if (activeSocket) {
      activeSocket.disconnect();
      set({ socket: null, isConnected: false });
    }
  },
}));
