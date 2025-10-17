import React from 'react';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' };

export const Button: React.FC<Props> = ({ variant = 'primary', children, ...rest }) => {
  const base = {
    borderRadius: 12,
    padding: '10px 16px',
    border: '1px solid rgba(255,255,255,0.12)',
    cursor: 'pointer',
    fontWeight: 600
  } as React.CSSProperties;
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: '#1a73e8', color: 'white' },
    ghost:   { background: 'transparent', color: 'white' }
  };
  return (
    <button style={{ ...base, ...styles[variant] }} {...rest}>
      {children}
    </button>
  );
};
