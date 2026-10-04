"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SymbolOption {
  symbol: string;
  label: string;
}

/**
 * Symbol picker. Renders only the configured Persian label for each option —
 * raw API field keys are never shown to the user.
 */
export function SymbolSelector({
  symbols,
  value,
  onChange,
  placeholder = "انتخاب نماد",
  ariaLabel = "انتخاب نماد",
  id,
}: {
  symbols: SymbolOption[];
  value: string;
  onChange: (symbol: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label={ariaLabel} className="h-8 w-[190px] text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {symbols.map((option) => (
          <SelectItem key={option.symbol} value={option.symbol}>
            <span>{option.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
