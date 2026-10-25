import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { queryClient } from '../../lib/query';
import { Modal } from '../../components/common/Modal';
import { Empty, ErrorState, Loading } from '../../components/common/States';
export const useNotifications = () =>
  useQuery({
    queryKey: ['notifications'],
    queryFn: () => api('/notifications').then((r) => r.notifications),
  });
export function Notifications({ onClose }) {
  const query = useNotifications(),
    navigate = useNavigate();
  async function readAll() {
    try {
      await api('/notifications/read', { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch (err) {
      toast.error(err.message);
    }
  }
  return (
    <Modal title="Your activity" onClose={onClose}>
      <div className="notification-heading">
        <span>Keep up with your team.</span>
        <button onClick={readAll} className="button secondary small">
          <CheckCheck size={14} /> Mark all read
        </button>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : query.data.length === 0 ? (
        <Empty
          title="You’re all caught up."
          description="New messages from your conversations will appear here."
        />
      ) : (
        <div className="notification-list">
          {query.data.map((n) => (
            <button
              key={n.id}
              className={n.read_at ? '' : 'unread'}
              onClick={() => {
                navigate(`/app/${n.conversation_id}`);
                onClose();
              }}
            >
              <span className="notification-icon">
                <Bell size={16} />
              </span>
              <span>
                <strong>{n.title}</strong>
                <small>
                  {new Date(n.created_at).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </small>
              </span>
              {!n.read_at && <i />}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
