/**
 * Button.tsx — Duolingo's signature control: uppercase, bold, 4px bottom edge
 * that compresses when pressed.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../Utils/Cx';

export type ButtonVariant = 'primary' | 'blue' | 'danger' | 'purple' | 'gold' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  trailing?: ReactNode;
  full?: boolean;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  trailing,
  full,
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cx('btn', `btn--${variant}`, `btn--${size}`, full && 'btn--full', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="btn__spinner" aria-hidden /> : icon ? <span className="btn__icon">{icon}</span> : null}
      <span className="btn__label">{children}</span>
      {trailing ? <span className="btn__icon">{trailing}</span> : null}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button type="button" className={cx('icon-btn', className)} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}
