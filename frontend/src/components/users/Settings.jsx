import { getSocket } from '../../services/socket';
import { useState } from 'react';
import { Moon, Sun, LogOut, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../common/Modal';
import { Avatar } from '../common/Avatar';
import { useAuth } from '../../stores/auth';
import { useUI } from '../../stores/ui';
import { api } from '../../services/api';
import { queryClient } from '../../lib/query';
export function Settings({ onClose }) {
  const user = useAuth((s) => s.user),
    theme = useUI((s) => s.theme),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(e.currentTarget);
    try {
      const result = await api('/users/me', {
        method: 'PATCH',
        body: {
          display_name: data.get('display_name'),
          avatar_url: data.get('avatar_url') || null,
          status: data.get('status'),
        },
      });
      useAuth.getState().updateUser(result.user);
      getSocket()?.emit('presence:update', { status: result.user.status });
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Profile updated');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await api('/auth/logout', { method: 'POST' });
      queryClient.clear();
      useAuth.getState().clear();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Your corner of PulseChat" onClose={onClose}>
      <div className="settings-profile">
        <Avatar user={user} size="lg" />
        <div>
          <strong>{user.display_name}</strong>
          <p>{user.email}</p>
        </div>
      </div>
      <form onSubmit={save}>
        <label>
          Display name
          <input name="display_name" defaultValue={user.display_name} required maxLength={80} />
        </label>
        <label>
          Avatar image URL
          <input
            name="avatar_url"
            type="url"
            defaultValue={user.avatar_url || ''}
            placeholder="https://…"
          />
          <small className="text-muted font-normal">Use an HTTPS link to your profile image.</small>
        </label>
        <label>
          Status
          <select name="status" defaultValue={user.status}>
            <option value="online">Available</option>
            <option value="away">Away</option>
            <option value="busy">Do not disturb</option>
            <option value="offline">Appear offline</option>
          </select>
        </label>
        <div className="settings-theme">
          <span>{theme === 'dark' ? <Moon size={17} /> : <Sun size={17} />} Appearance</span>
          <button
            type="button"
            className="button secondary small"
            onClick={useUI.getState().toggleTheme}
          >
            {theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          </button>
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <button className="button primary" disabled={busy}>
          Save changes
        </button>
      </form>
      <div className="settings-bottom">
        <span>
          <ShieldCheck size={14} /> Secure session
        </span>
        <button onClick={logout} disabled={busy}>
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </Modal>
  );
}
