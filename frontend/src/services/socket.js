import { io } from 'socket.io-client';
let socket;
export function connectSocket(token) {
  socket?.disconnect();
  socket = io({
    auth: { token },
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
  return socket;
}
export const getSocket = () => socket;
export function emitAck(event, payload) {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error('Connection unavailable.'));
    socket.timeout(8000).emit(event, payload, (err, result) => {
      if (err) return reject(new Error('Delivery was not confirmed. Retry safely.'));
      if (!result?.ok) return reject(new Error(result?.error?.message || 'Request failed.'));
      resolve(result);
    });
  });
}
