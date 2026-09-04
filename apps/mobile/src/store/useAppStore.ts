import { create } from 'zustand';

type SocketStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

interface AppState {
  socketStatus: SocketStatus;
  setSocketStatus: (status: SocketStatus) => void;
}

/**
 * Placeholder app store. Socket connection state is tracked here so future
 * realtime features can react to connectivity without prop drilling.
 */
export const useAppStore = create<AppState>((set) => ({
  socketStatus: 'idle',
  setSocketStatus: (socketStatus) => set({ socketStatus }),
}));