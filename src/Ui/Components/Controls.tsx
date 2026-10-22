// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Controls.tsx — form primitives with Duolingo proportions.
 */
import type { ChangeEvent, ReactNode } from 'react';
import { cx } from '../Utils/Cx';

/* --------------------------------- Toggle --------------------------------- */

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cx('toggle-row', disabled && 'is-disabled')}>
      <span className="toggle-row__text">
        <span className="toggle-row__label">{label}</span>
        {hint ? <span className="toggle-row__hint">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={cx('switch', checked && 'switch--on')}
        onClick={() => onChange(!checked)}
      >
        <span className="switch__knob" />
      </button>
    </label>
  );
}

/* -------------------------------- Stepper -------------------------------- */

export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  hint?: string;
  onChange: (next: number) => void;
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  return (
    <div className="stepper">
      <div className="stepper__text">
        <span className="stepper__label">{label}</span>
        {hint ? <span className="stepper__hint">{hint}</span> : null}
      </div>
      <div className="stepper__control">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(clamp(value - step))} disabled={value <= min}>
          −
        </button>
        <span className="stepper__value">
          {value}
          {suffix ? <em>{suffix}</em> : null}
        </span>
        <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(clamp(value + step))} disabled={value >= max}>
          +
        </button>
      </div>
    </div>
  );
}

/* ------------------------------- Segmented ------------------------------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
  value: T;
  onChange: (next: T) => void;
  label?: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={cx('segmented__item', option.value === value && 'is-active')}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------- Field --------------------------------- */

export function Field({
  label,
  hint,
  value,
  placeholder,
  onChange,
  type = 'text',
  mono,
  action,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  type?: 'text' | 'password' | 'number' | 'date';
  mono?: boolean;
  action?: ReactNode;
  onChange: (next: string) => void;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <div className="field__row">
        <input
          className={cx('field__input', mono && 'field__input--mono')}
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        {action}
      </div>
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

/* --------------------------------- Select -------------------------------- */

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
  hint?: string;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <select className="field__input field__select" value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}
