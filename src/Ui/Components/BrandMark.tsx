// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * BrandMark.tsx — the extension's own icon, reused as the in-app logo.
 * Using the shipped PNG keeps the toolbar icon and the UI mark identical.
 */
export function BrandMark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <img
      className={`brand-mark${className ? ` ${className}` : ''}`}
      src="icons/icon128.png"
      width={size}
      height={size}
      alt=""
      aria-hidden
      draggable={false}
    />
  );
}
