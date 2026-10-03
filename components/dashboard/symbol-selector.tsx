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
 * Symbol picker. Shows the configured Persian label for known symbols and the
 * raw key for unknown/future indicators (which are still fully collected).
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
            <span className="ltr mr-2 text-xs text-muted-foreground">({option.symbol})</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
