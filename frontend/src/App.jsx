import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { Router } from './routes/Router';
import { refreshSession } from './services/api';
import { useAuth } from './stores/auth';
import { Loading } from './components/common/States';
export default function App() {
  const ready = useAuth((s) => s.ready);
  useEffect(() => {
    refreshSession().catch(() => useAuth.getState().clear());
  }, []);
  return (
    <>
      <Toaster position="top-right" richColors />
      {ready ? <Router /> : <Loading text="Opening your workspace…" />}
    </>
  );
}
