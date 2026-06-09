import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useThemeStore } from '../store/themeStore';

interface ThemeToggleProps {
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '' }) => {
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`hs-theme-toggle ${className}`}
      title={isDark ? 'Switch to day mode' : 'Switch to night mode'}
      aria-label={isDark ? 'Switch to day mode' : 'Switch to night mode'}
    >
      <span className="hs-theme-toggle-track">
        <span className={`hs-theme-toggle-thumb ${isDark ? 'is-dark' : 'is-light'}`}>
          {isDark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
        </span>
      </span>
      <span className="hidden sm:inline text-xs font-medium hs-text-muted">
        {isDark ? 'Night' : 'Day'}
      </span>
    </button>
  );
};
