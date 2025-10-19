'use client';

interface VaultItemProps {
  item: {
    id: number;
    title: string;
    username?: string;
    password: string;
    url?: string;
    notes?: string;
    createdAt: string;
    updatedAt?: string;
  };
  onClick: (item: any) => void;
}

export default function VaultItem({ item, onClick }: VaultItemProps) {
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
        <h3 className="text-base font-semibold text-slate-100 truncate group-hover:text-white transition-colors">
          {item.title}
        </h3>
        {item.username && (
          <p className="text-sm text-slate-400 truncate">{item.username}</p>
        )}
        {!item.username && item.url && (
          <p className="text-sm text-slate-400 truncate">{item.url}</p>
        )}
      </div>

      {/* Arrow */}
      <svg className="w-5 h-5 text-slate-500 group-hover:text-slate-300 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </div>
  );
}
