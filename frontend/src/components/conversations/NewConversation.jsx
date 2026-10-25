import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, Hash, LockKeyhole, MessageCircle, Users, Search } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Avatar } from '../common/Avatar';
import { api } from '../../services/api';
import { queryClient } from '../../lib/query';
import { useAuth } from '../../stores/auth';
export function NewConversation({ initialType = 'channel', onClose }) {
  const [type, setType] = useState(initialType),
    [q, setQ] = useState(''),
    [selected, setSelected] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const user = useAuth((s) => s.user),
    navigate = useNavigate();
  const results = useQuery({
    queryKey: ['users', q],
    queryFn: () => api(`/users/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  });
  async function submit(e) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      const result = await api('/conversations', {
        method: 'POST',
        body: {
          type,
          ...(type !== 'direct'
            ? { name: data.get('name'), description: data.get('description') || '' }
            : {}),
          is_private: data.get('is_private') === 'on',
          member_ids: selected.map((u) => u.id),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      navigate(`/app/${result.conversation.id}`);
      toast.success('Your conversation is ready');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Start a conversation" onClose={onClose}>
      <div className="type-tabs">
        {[
          ['channel', Hash, 'Channel'],
          ['direct', MessageCircle, 'Direct'],
          ['group', Users, 'Group'],
        ].map(([value, Icon, label]) => (
          <button
            key={value}
            className={type === value ? 'selected' : ''}
            onClick={() => {
              setType(value);
              setSelected([]);
            }}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      <form onSubmit={submit}>
        {type !== 'direct' && (
          <>
            <label>
              Name
              <input
                name="name"
                placeholder={type === 'channel' ? 'e.g. design-feedback' : 'e.g. Launch crew'}
                required
                maxLength={80}
              />
            </label>
            <label>
              Description
              <textarea
                name="description"
                placeholder="What’s this space for?"
                maxLength={500}
                rows={2}
              />
            </label>
          </>
        )}
        <label>
          {type === 'direct' ? 'Find a teammate' : 'Invite teammates'}
          <div className="search-input">
            <Search size={16} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or username"
              autoComplete="off"
            />
          </div>
        </label>
        {selected.length > 0 && (
          <div className="selected-users">
            {selected.map((u) => (
              <button
                type="button"
                key={u.id}
                onClick={() => setSelected(selected.filter((p) => p.id !== u.id))}
              >
                {u.display_name} ×
              </button>
            ))}
          </div>
        )}
        {q.length >= 2 && (
          <div className="user-results">
            {results.isPending ? (
              <p>Finding teammates…</p>
            ) : results.isError ? (
              <p role="alert">{results.error.message}</p>
            ) : (
              results.data?.users
                .filter((u) => u.id !== user.id)
                .map((u) => (
                  <button
                    type="button"
                    key={u.id}
                    onClick={() =>
                      setSelected(
                        type === 'direct'
                          ? [u]
                          : selected.some((p) => p.id === u.id)
                            ? selected.filter((p) => p.id !== u.id)
                            : [...selected, u],
                      )
                    }
                  >
                    <Avatar user={u} size="sm" />
                    <span>
                      {u.display_name}
                      <small>@{u.username}</small>
                    </span>
                    {selected.some((p) => p.id === u.id) && <Check size={17} />}
                  </button>
                ))
            )}
            {results.data?.users.filter((u) => u.id !== user.id).length === 0 && (
              <p>No teammates found. Try another name.</p>
            )}
          </div>
        )}
        {type === 'channel' && (
          <label className="checkbox-label">
            <input type="checkbox" name="is_private" />
            <LockKeyhole size={17} />
            <span>
              Make this channel private<small>Only invited members can see it.</small>
            </span>
          </label>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <button
          className="button primary"
          disabled={busy || (type === 'direct' && selected.length !== 1)}
        >
          {busy ? 'Creating…' : 'Let’s talk'}
        </button>
      </form>
    </Modal>
  );
}
