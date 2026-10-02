'use client';

import { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({ children, className = '', hover = false, padding = 'md', ...rest }: CardProps) {
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  return (
    <div
      {...rest}
      className={`
        bg-white rounded-xl shadow-soft border border-gray-100
        ${paddingClasses[padding]}
        ${hover ? 'shadow-hover cursor-pointer transition-all duration-300' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

