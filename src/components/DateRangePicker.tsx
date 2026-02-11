import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { startOfDay, endOfDay } from "date-fns";

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
            from: startOfDay(range.from),  // 00:00:00
            to: endOfDay(range.to),        // 23:59:59.999
          });
        }
      }}
      numberOfMonths={2}
      fixedWeeks
    />
  );
}
