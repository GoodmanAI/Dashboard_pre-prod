// components/DateRangePicker.tsx
"use client";

import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { addDays, startOfDay } from "date-fns";

export type DateRange = {
  from: Date;
  to: Date;
};

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export default function DateRangePicker({ value, onChange }: Props) {
  return (
    <DayPicker
      mode="range"
      selected={value}
      onSelect={(range) => {
        if (range?.from && range?.to) {
          onChange({
            from: startOfDay(range.from),
            to: startOfDay(range.to),
          });
        }
      }}
      numberOfMonths={2}
      fixedWeeks
    />
  );
}
