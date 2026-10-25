import { Link } from 'react-router-dom';
import { Empty } from '../components/common/States';
export function NotFound() {
  return (
    <main className="h-screen grid place-items-center">
      <Empty
        title="This conversation took a detour."
        description="The page you’re looking for doesn’t exist."
      >
        <Link className="button primary" to="/app">
          Back to your workspace
        </Link>
      </Empty>
    </main>
  );
}
