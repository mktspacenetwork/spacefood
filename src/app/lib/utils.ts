import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a string as a Brazilian phone number: (XX) XXXXX-XXXX or (XX) XXXX-XXXX.
 * Strips all non-digit characters first, then applies the mask.
 */
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11); // Max 11 digits
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/**
 * Strips phone mask, returning only digits.
 */
export function unformatPhone(value: string): string {
  return value.replace(/\D/g, "");
}