import React from 'react';

interface HotstarLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export const HotstarLogo: React.FC<HotstarLogoProps> = ({ size = 'md', showText = true }) => {
  const iconSize = size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-11 w-11' : 'h-9 w-9';
  const textSize = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-3xl' : 'text-xl';

  return (
    <div className="flex items-center gap-2.5">
      <div className={`${iconSize} hs-logo-icon flex items-center justify-center rounded-lg shrink-0`}>
        <svg viewBox="0 0 24 24" className="h-[58%] w-[58%]" fill="none" aria-hidden>
          <path
            d="M12 2L14.09 8.26L20 9.27L15.45 13.97L16.82 20L12 16.9L7.18 20L8.55 13.97L4 9.27L9.91 8.26L12 2Z"
            fill="currentColor"
          />
        </svg>
      </div>
      {showText && (
        <div className="flex flex-col leading-none">
          <span className={`${textSize} font-extrabold tracking-tight hs-gradient-text`}>
            Chatly
          </span>
          <span className="text-[9px] uppercase tracking-[0.2em] hs-text-muted font-semibold mt-0.5">
            Premium Chat
          </span>
        </div>
      )}
    </div>
  );
};
