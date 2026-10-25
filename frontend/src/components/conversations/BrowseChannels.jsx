import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../common/Modal';
import { Empty } from '../common/States';
import { api } from '../../services/api';
import { queryClient } from '../../lib/query';
import { useAuth } from '../../stores/auth';
export function BrowseChannels({ conversations, onClose }) {
  const [busy, setBusy] = useState(null),
    navigate = useNavigate();
  async function join(c) {
    setBusy(c.id);
    try {
      if (!c.is_member)
        await api(`/conversations/${c.id}/members`, {
          method: 'POST',
          body: { user_id: useAuth.getState().user.id },
        });
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      navigate(`/app/${c.id}`);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  }
  const channels = conversations.filter((c) => c.type === 'channel' && !c.is_private);
  return (
    <Modal title="Find your people" onClose={onClose}>
      <p className="text-muted text-sm mb-5">
        A space for every idea. Explore your workspace’s public channels.
      </p>
      {channels.length ? (
        <div className="browse-list">
          {channels.map((c) => (
            <button key={c.id} disabled={busy === c.id} onClick={() => join(c)}>
              <span className="channel-symbol">
                <Hash size={20} />
              </span>
              <span>
                <strong>{c.name}</strong>
                <small>{c.description || 'A space for your team'}</small>
              </span>
              <span className="browse-action">
                {c.is_member ? 'Open' : 'Join'} <ArrowRight size={14} />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title="Room for something new"
          description="Create the first public channel for your team."
        />
      )}
    </Modal>
  );
}
