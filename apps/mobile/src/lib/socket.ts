import { io } from 'socket.io-client';

/**
 * Shared socket.io client pointing at the API.
 *
 * Placeholder: the instance is exported but does not join any room yet.
 * Room/event logic (live challenges) comes in a future task.
 */
export const socket = io(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000', {
  autoConnect: false,
  transports: ['websocket'],
});