import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, CakeSlice, LockKeyhole, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/admin');
    } catch (requestError: any) {
      setError(
        requestError.response?.data?.message ||
          'No fue posible iniciar sesión. Revisa la conexión y tus credenciales.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-theme relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4">
      <div className="pointer-events-none absolute left-1/2 top-1/4 h-96 w-96 -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-cyan-300">
            <CakeSlice className="h-10 w-10" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">MAYI</h1>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
            Gestión de eventos y pastelería
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-8">
          <h2 className="mb-2 text-lg font-semibold text-white">Iniciar sesión</h2>
          <p className="mb-6 text-sm text-slate-400">Accede al panel de administración de Mayi.</p>
          {error && (
            <div className="mb-5 flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-sm text-slate-300">
              Correo electrónico
              <span className="relative mt-1.5 block">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="username"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 py-3 pl-10 pr-4 text-sm text-white outline-none transition focus:border-cyan-500"
                  placeholder="admin@mayic.com"
                />
              </span>
            </label>
            <label className="block text-sm text-slate-300">
              Contraseña
              <span className="relative mt-1.5 block">
                <LockKeyhole className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 py-3 pl-10 pr-4 text-sm text-white outline-none transition focus:border-cyan-500"
                  placeholder="Contraseña"
                />
              </span>
            </label>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60"
            >
              {loading ? 'Verificando…' : 'Ingresar'}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-slate-600">Mayi · Girardot, Cundinamarca</p>
      </div>
    </div>
  );
};
