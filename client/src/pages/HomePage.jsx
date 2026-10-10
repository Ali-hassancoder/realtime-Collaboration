import { useQuery } from '@tanstack/react-query';
import { getHealth } from '../services/api';
import { useSocketStatus } from '../hooks/useSocketStatus';
import StatusRow from '../components/StatusRow';

export default function HomePage() {
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth, retry: false });
  const socket = useSocketStatus();

  const apiState = health.isLoading ? 'loading' : health.isError ? 'error' : 'ok';
  const apiDetail = health.isLoading
    ? 'Checking...'
    : health.isError
      ? health.error.message
      : health.data.message;

  return (
    <section>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">System status</h1>
      <p className="mb-6 text-slate-600">Foundation check: REST API and Socket.IO connectivity.</p>

      <ul className="space-y-3">
        <StatusRow label="REST API" state={apiState} detail={apiDetail} />
        <StatusRow
          label="Socket.IO"
          state={socket.connected ? 'ok' : socket.error ? 'error' : 'loading'}
          detail={
            socket.connected
              ? `Connected (${socket.id})`
              : socket.error
                ? socket.error
                : 'Disconnected'
          }
        />
      </ul>

      <button
        onClick={socket.toggle}
        className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
      >
        {socket.connected ? 'Disconnect socket' : 'Connect socket'}
      </button>
    </section>
  );
}