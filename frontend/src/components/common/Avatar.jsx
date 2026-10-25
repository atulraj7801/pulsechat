import { useRealtime } from '../../stores/realtime';
export function Avatar({ user, size = 'md', presence = false }) {
  const actualStatus = useRealtime((s) => s.presence[user?.id]) || 'offline';
  const name = user?.display_name || user?.username || '?';
  const initials = name
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const color = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 5;
  return (
    <span className={`avatar avatar-${size} avatar-color-${color}`} aria-label={name}>
      {user?.avatar_url ? <img src={user.avatar_url} alt="" /> : initials}
      {presence && <i className={`presence-dot ${actualStatus}`} />}
    </span>
  );
}
