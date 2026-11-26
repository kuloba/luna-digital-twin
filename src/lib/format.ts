import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { clockNow } from "@/lib/clock";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatClock = (ms: number, seconds = false) =>
  new Date(ms).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: seconds ? "2-digit" : undefined, hour12: false });

export const formatNumber = (v: number, digits = 0) =>
  v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const formatKg = (kg: number) => (kg >= 10_000 ? `${formatNumber(kg / 1000, 1)} t` : `${formatNumber(kg)} kg`);

export function formatAgo(ms: number, now = clockNow()) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} h ago`;
}

export function formatEta(iso: string, now = clockNow()) {
  const t = new Date(iso).getTime();
  const diff = t - now;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  let rel: string;
  if (mins < 60) rel = `${mins} min`;
  else if (mins < 60 * 36) rel = `${Math.round(mins / 60)} h`;
  else rel = `${Math.round(mins / 1440)} d`;
  return diff >= 0 ? `in ${rel}` : `${rel} ago`;
}

export const formatDayTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
