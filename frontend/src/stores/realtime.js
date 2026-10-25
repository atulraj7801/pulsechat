import { create } from 'zustand';
export const useRealtime = create((set) => ({
  status: 'connecting',
  presence: {},
  typing: {},
  delivered: {},
  outbox: {},
  setStatus: (status) => set({ status }),
  setPresence: (rows) =>
    set((s) => ({
      presence: { ...s.presence, ...Object.fromEntries(rows.map((r) => [r.user_id, r.status])) },
    })),
  setTyping: (event) =>
    set((s) => ({ typing: { ...s.typing, [`${event.conversation_id}:${event.user_id}`]: event } })),
  markDelivered: (id) => set((s) => ({ delivered: { ...s.delivered, [id]: true } })),
  putOutbox: (message) =>
    set((s) => ({ outbox: { ...s.outbox, [message.client_message_id]: message } })),
  removeOutbox: (id) =>
    set((s) => {
      const outbox = { ...s.outbox };
      delete outbox[id];
      return { outbox };
    }),
  reset: () => set({ status: 'offline', presence: {}, typing: {}, delivered: {}, outbox: {} }),
}));
