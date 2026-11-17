import React from 'react';
import { statusLabels } from '../services/mayicService';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const palette: Record<string, string> = {
    WEB_REQUEST_PENDING: 'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-300',
    QUOTE_PENDING: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300',
    PAYMENT_REVIEW: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
    DEPOSIT_CONFIRMED: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
    PAID_DELIVERED: 'border-violet-500/20 bg-violet-500/10 text-violet-300',
    EXPIRED: 'border-slate-500/20 bg-slate-500/10 text-slate-400',
  };
  const label = statusLabels[status] || status.replace(/_/g, ' ');
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${palette[status] || palette.EXPIRED} ${className}`}>
      {label}
    </span>
  );
};
