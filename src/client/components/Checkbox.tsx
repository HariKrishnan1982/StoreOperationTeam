import type { InputHTMLAttributes } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

export function Checkbox({ label, id, className = '', ...rest }: CheckboxProps) {
  return (
    <label className={`checkbox-row ${className}`.trim()} htmlFor={id}>
      <input id={id} type="checkbox" className="checkbox-input" {...rest} />
      <span>{label}</span>
    </label>
  );
}
