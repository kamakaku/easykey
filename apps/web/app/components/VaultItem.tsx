'use client';

import { Badge } from './UI';

interface VaultItemProps {
  item: {
    id: number;
    title: string;
    username?: string;
    password: string;
    url?: string;
    notes?: string;
    category?: string; // ID der Kategorie
    createdAt: string;
    updatedAt?: string;
    expiresAt?: string;
    passwordHistory?: { value: string; changedAt: string }[];
  };
  onClick: (item: any) => void;
}

function getExpirationMeta(expiresAt?: string) {
  if (!expiresAt) return null;
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return null;
  const diffMs = expiry.getTime() - Date.now();
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return {
    isExpired: diffMs < 0,
    daysLeft,
  };
}

export default function VaultItem({ item, onClick }: VaultItemProps) {
  const expirationMeta = getExpirationMeta(item.expiresAt);

  return (
    <div
      onClick={() => onClick(item)}
      className="flex items-center gap-3 p-3 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 hover:border-slate-600 rounded-lg cursor-pointer transition-all group"
    >
      {/* Icon */}
      <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/30 transition-shadow">
        <span className="text-white text-lg font-bold">
          {item.title.charAt(0).toUpperCase()}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-base font-semibold text-slate-100 truncate group-hover:text-white transition-colors">
            {item.title}
          </h3>
          {item.category && (
            <span className={`px-2 py-0.5 rounded text-xs ${
              item.category === 'login' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
              item.category === 'email' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
              item.category === 'bank' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
              item.category === 'card' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
              item.category === 'social' ? 'bg-pink-500/10 text-pink-400 border border-pink-500/20' :
              item.category === 'work' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
              // For custom categories, use a generic color
              'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
            }`}>
              {item.category === 'login' ? 'Login' :
               item.category === 'email' ? 'E-Mail' :
               item.category === 'bank' ? 'Bank' :
               item.category === 'card' ? 'Kreditkarte' :
               item.category === 'social' ? 'Social Media' :
               item.category === 'work' ? 'Arbeit' :
               // For custom categories, display the ID as label since we don't have the label here
              item.category.charAt(0).toUpperCase() + item.category.slice(1)}
            </span>
          )}
          {expirationMeta && (
            <Badge
              variant={
                expirationMeta.isExpired
                  ? 'error'
                  : expirationMeta.daysLeft <= 7
                    ? 'warning'
                    : 'success'
              }
            >
              {expirationMeta.isExpired
                ? 'Abgelaufen'
                : expirationMeta.daysLeft <= 0
                  ? 'Läuft heute ab'
                  : `Noch ${expirationMeta.daysLeft} ${expirationMeta.daysLeft === 1 ? 'Tag' : 'Tage'}`}
            </Badge>
          )}
        </div>
        {item.username && (
          <p className="text-sm text-slate-400 truncate">{item.username}</p>
        )}
        {!item.username && item.url && (
          <p className="text-sm text-slate-400 truncate">{item.url}</p>
        )}
        {item.rotationIntervalDays && (
          <p className="text-xs text-slate-500">
            Rotation: alle {item.rotationIntervalDays}{' '}
            {item.rotationIntervalDays === 1 ? 'Tag' : 'Tage'}
          </p>
        )}
      </div>

      {/* Arrow */}
      <svg className="w-5 h-5 text-slate-500 group-hover:text-slate-300 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </div>
  );
}
