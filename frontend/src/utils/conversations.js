export function conversationName(conversation, userId) {
  if (!conversation) return '';
  return conversation.type === 'direct'
    ? conversation.members?.find((m) => m.id !== userId)?.display_name || 'Direct message'
    : conversation.name;
}
export function conversationPeer(conversation, userId) {
  return conversation?.members?.find((m) => m.id !== userId);
}
