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
      <h1 className="mb-1 text-3xl font-extrabold">
        <span className="text-gradient">System status</span>
      </h1>
      <p className="mb-6 text-slate-600">Foundation check: REST API and Socket.IO connectivity.</p>

      <ul className="stagger space-y-3">
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
        className="btn-gradient mt-6 rounded-xl px-4 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2"
      >
        {socket.connected ? 'Disconnect socket' : 'Connect socket'}
      </button>
    </section>
  );
}