import { toZonedTime, format } from 'date-fns-tz';
import { addDays as fnsAddDays, startOfDay as fnsStartOfDay, isSameDay as fnsIsSameDay } from 'date-fns';

export const TIMEZONE = 'America/Sao_Paulo';

/**
 * Returns the current date/time in Brazil timezone
 */
export function getBrazilTime(date: Date = new Date()): Date {
  return toZonedTime(date, TIMEZONE);
}

/**
 * Returns the current date string (YYYY-MM-DD) in Brazil timezone
 */
export function getBrazilDateString(date: Date = new Date()): string {
  const zonedDate = toZonedTime(date, TIMEZONE);
  return format(zonedDate, 'yyyy-MM-dd', { timeZone: TIMEZONE });
}

/**
 * Returns the current time string (HH:mm) in Brazil timezone
 */
export function getBrazilTimeString(date: Date = new Date()): string {
  const zonedDate = toZonedTime(date, TIMEZONE);
  return format(zonedDate, 'HH:mm', { timeZone: TIMEZONE });
}

/**
 * Checks if a given date (string or Date object) is "Today" in Brazil
 */
export function isBrazilToday(date: Date | string): boolean {
  const checkDateStr = typeof date === 'string' 
    ? date.split('T')[0] 
    : getBrazilDateString(date);
    
  const todayStr = getBrazilDateString(new Date());
  return checkDateStr === todayStr;
}

/**
 * Checks if a given date (string or Date object) is "Tomorrow" in Brazil
 */
export function isBrazilTomorrow(date: Date | string): boolean {
  const checkDateStr = typeof date === 'string' 
    ? date.split('T')[0] 
    : getBrazilDateString(date);

  // Calculate tomorrow in Brazil
  const today = toZonedTime(new Date(), TIMEZONE);
  const tomorrow = fnsAddDays(today, 1);
  const tomorrowStr = format(tomorrow, 'yyyy-MM-dd', { timeZone: TIMEZONE });
  
  return checkDateStr === tomorrowStr;
}

/**
 * Helper to get the current hour in Brazil (0-23)
 */
export function getBrazilHour(date: Date = new Date()): number {
  const timeStr = getBrazilTimeString(date);
  return parseInt(timeStr.split(':')[0], 10);
}

/**
 * Helper to get the current minute in Brazil (0-59)
 */
export function getBrazilMinute(date: Date = new Date()): number {
  const timeStr = getBrazilTimeString(date);
  return parseInt(timeStr.split(':')[1], 10);
}
