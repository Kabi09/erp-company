import React from 'react';
import { ArrowUpRight, Heart } from 'lucide-react';

export const DEVELOPER_CREDIT_URL = 'https://www.ameyy.in/';

export const DeveloperCredit: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`flex items-center justify-center flex-wrap gap-1 text-center text-xs text-slate-400 dark:text-slate-500 ${className}`.trim()}
  >
    <span>Developed by</span>
    <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500 shrink-0" aria-hidden="true" />
    <a
      href={DEVELOPER_CREDIT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
    >
      <span>Ameyy Digital Services</span>
      <ArrowUpRight className="w-3 h-3 shrink-0" aria-hidden="true" />
    </a>
  </div>
);
