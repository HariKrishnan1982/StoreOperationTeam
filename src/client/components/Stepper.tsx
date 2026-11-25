import { Minus, Plus } from 'lucide-react';
import { IconButton } from './IconButton';

export interface StepperProps {
  value: number;
  min?: number;
  max?: number;
  itemName: string;
  onChange: (next: number) => void;
}

export function Stepper({ value, min = 0, max = 999, itemName, onChange }: StepperProps) {
  return (
    <div className="stepper">
      <IconButton
        label={`Decrease quantity for ${itemName}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus size={16} aria-hidden="true" />
      </IconButton>
      <span className="stepper-val" aria-live="polite">
        {value}
      </span>
      <IconButton
        label={`Increase quantity for ${itemName}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus size={16} aria-hidden="true" />
      </IconButton>
    </div>
  );
}
