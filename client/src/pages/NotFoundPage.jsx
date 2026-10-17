import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="py-16 text-center">
      <p className="text-gradient animate-float text-7xl font-black">404</p>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-1 text-slate-500">The page you are looking for does not exist.</p>
      <Link to="/" className="btn-gradient mt-6 inline-block rounded-xl px-5 py-2.5 font-semibold">
        Back to home
      </Link>
    </div>
  );
}
