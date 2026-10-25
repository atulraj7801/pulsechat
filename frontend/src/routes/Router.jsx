import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../stores/auth';
import { AuthPage } from '../pages/AuthPage';
import { Workspace } from '../pages/Workspace';
import { NotFound } from '../pages/NotFound';
export function Router() {
  const user = useAuth((s) => s.user);
  return (
    <Routes>
      <Route path="/" element={<Navigate to={user ? '/app' : '/login'} replace />} />
      <Route
        path="/login"
        element={user ? <Navigate to="/app" replace /> : <AuthPage key="login" />}
      />
      <Route
        path="/register"
        element={
          user ? <Navigate to="/app" replace /> : <AuthPage key="register" mode="register" />
        }
      />
      <Route
        path="/app/:conversationId?"
        element={user ? <Workspace /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
