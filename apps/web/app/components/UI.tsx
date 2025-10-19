import React from 'react';

// Button Component
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', children, className = '', ...props }: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900';

  const variants = {
    primary: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20 hover:shadow-xl hover:shadow-indigo-500/30 focus:ring-indigo-500',
    secondary: 'bg-slate-700 hover:bg-slate-600 text-slate-100 border border-slate-600 hover:border-slate-500 focus:ring-slate-500',
    ghost: 'hover:bg-slate-800 text-slate-300 hover:text-slate-100 focus:ring-slate-600',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20 hover:shadow-xl hover:shadow-red-500/30 focus:ring-red-500',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// Input Component
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Input({ label, error, helperText, className = '', ...props }: InputProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-slate-300">
          {label}
        </label>
      )}
      <input
        className={`w-full px-4 py-2.5 bg-slate-800 border ${
          error ? 'border-red-500 focus:ring-red-500' : 'border-slate-600 focus:ring-indigo-500'
        } rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:border-transparent transition-all ${className}`}
        {...props}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      {helperText && !error && <p className="text-sm text-slate-400">{helperText}</p>}
    </div>
  );
}

// Textarea Component
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Textarea({ label, error, helperText, className = '', ...props }: TextareaProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-slate-300">
          {label}
        </label>
      )}
      <textarea
        className={`w-full px-4 py-2.5 bg-slate-800 border ${
          error ? 'border-red-500 focus:ring-red-500' : 'border-slate-600 focus:ring-indigo-500'
        } rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:border-transparent transition-all font-mono text-sm ${className}`}
        {...props}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      {helperText && !error && <p className="text-sm text-slate-400">{helperText}</p>}
    </div>
  );
}

// Card Component
interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export function Card({ children, className = '', hover = false }: CardProps) {
  return (
    <div
      className={`bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 ${
        hover ? 'hover:bg-slate-800/70 hover:border-slate-600 transition-all duration-200' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

// Badge Component
interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  className?: string;
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  const variants = {
    default: 'bg-slate-700 text-slate-200',
    success: 'bg-green-500/10 text-green-400 border border-green-500/20',
    warning: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
    error: 'bg-red-500/10 text-red-400 border border-red-500/20',
    info: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}

// Alert Component
interface AlertProps {
  children: React.ReactNode;
  variant?: 'info' | 'success' | 'warning' | 'error';
  className?: string;
}

export function Alert({ children, variant = 'info', className = '' }: AlertProps) {
  const variants = {
    info: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
    success: 'bg-green-500/10 text-green-300 border-green-500/30',
    warning: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
    error: 'bg-red-500/10 text-red-300 border-red-500/30',
  };

  const icons = {
    info: 'ℹ️',
    success: '✓',
    warning: '⚠️',
    error: '✕',
  };

  return (
    <div className={`flex items-start gap-3 p-4 rounded-lg border ${variants[variant]} ${className}`}>
      <span className="text-lg flex-shrink-0">{icons[variant]}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

// Checkbox Component
interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Checkbox({ label, className = '', ...props }: CheckboxProps) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <input
        type="checkbox"
        className={`w-4 h-4 rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-0 transition-all cursor-pointer ${className}`}
        {...props}
      />
      {label && (
        <span className="text-sm text-slate-300 group-hover:text-slate-100 transition-colors">
          {label}
        </span>
      )}
    </label>
  );
}

// Divider Component
export function Divider({ className = '' }: { className?: string }) {
  return <div className={`border-t border-slate-700 ${className}`} />;
}
