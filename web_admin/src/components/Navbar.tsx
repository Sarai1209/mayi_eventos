import React from 'react';
import { CalendarDays, Menu } from 'lucide-react';

interface NavbarProps {
  title: string;
  onMenuClick: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ title, onMenuClick }) => {
  const today = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          aria-label="Abrir menú"
          className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold tracking-tight text-white sm:text-lg">{title}</h1>
      </div>
      <div className="hidden items-center gap-2 text-xs capitalize text-slate-400 sm:flex">
        <CalendarDays className="h-3.5 w-3.5 text-cyan-400" />
        <span>{today}</span>
      </div>
    </header>
  );
};
