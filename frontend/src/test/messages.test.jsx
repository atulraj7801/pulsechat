import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mergeMessage } from '../features/messages/queries';
import { useRealtime } from '../stores/realtime';
import { Composer } from '../components/chat/Composer';
describe('message reliability', () => {
  it('rejects stale event versions and does not append edited unloaded history', () => {
    const newest = { id: 'm', client_message_id: 'key', version: 3, body: 'latest' };
    const cache = { pages: [{ messages: [newest] }], pageParams: [null] };
    expect(mergeMessage(cache, { ...newest, version: 2, body: 'stale' }).pages[0].messages[0].body).toBe('latest');
    expect(mergeMessage(cache, { id: 'older', version: 2 }, { insert: false }).pages[0].messages).toEqual([newest]);
  });
  it('merges acknowledgement and broadcast in either order without duplicates', () => {
    const optimistic = { id: 'client', client_message_id: 'same', body: 'hello', pending: true };
    const server = { ...optimistic, id: 'server', pending: false };
    const cache = { pages: [{ messages: [optimistic], next_cursor: null }], pageParams: [null] };
    const result = mergeMessage(mergeMessage(cache, server), server);
    expect(result.pages[0].messages).toEqual([server]);
    expect(cache.pages[0].messages[0].pending).toBe(true);
  });
  it('preserves failed outbox messages independently of history refetches', () => {
    useRealtime.getState().reset(); useRealtime.getState().putOutbox({ client_message_id: 'retry-id', failed: true, body: 'keep me' });
    useRealtime.getState().setStatus('reconnecting'); expect(useRealtime.getState().outbox['retry-id'].body).toBe('keep me');
    useRealtime.getState().removeOutbox('retry-id'); expect(useRealtime.getState().outbox).toEqual({});
  });
  it('sends on Enter, preserves Shift+Enter, and refuses whitespace messages', async () => {
    cleanup(); const send = vi.fn(), clear = vi.fn();
    render(<Composer conversation={{ id: 'c', type: 'channel' }} name="general" onSend={send} onClearReply={clear}/>);
    const text = screen.getByRole('textbox', { name: 'Message general' });
    await userEvent.type(text, 'Hello{Shift>}{Enter}{/Shift}team'); expect(send).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}'); expect(send).toHaveBeenCalledWith({ body: 'Hello\nteam', attachment_ids: [], reply_to_id: null }, undefined);
    await userEvent.type(text, '   '); expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });
});
