// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Card.tsx — the 2px-border, 4px-bottom container used everywhere.
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { cx } from '../Utils/Cx';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: 'default' | 'green' | 'blue' | 'gold' | 'purple' | 'red' | 'flat';
  padded?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}

export function Card({ tone = 'default', padded = true, className, children, ...rest }: CardProps) {
  return (
    <div className={cx('card', `card--${tone}`, padded && 'card--padded', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card__header">
      {icon ? <span className="card__icon">{icon}</span> : null}
      <div className="card__titles">
        <h3 className="card__title">{title}</h3>
        {subtitle ? <p className="card__subtitle">{subtitle}</p> : null}
      </div>
      {action ? <div className="card__action">{action}</div> : null}
    </div>
  );
}
