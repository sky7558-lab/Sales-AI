import { format, startOfWeek } from "date-fns";

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function weekStartISO(d: Date = new Date()): string {
  // ISO week, Monday start
  return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return format(new Date(iso), "M월 d일");
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return format(new Date(iso), "M월 d일 HH:mm");
}
