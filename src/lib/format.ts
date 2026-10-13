/**
 * Display helpers only: turn the API's strings (decimal money, dates, phone numbers) into readable text.
 * All arithmetic happens in the API (money values stay decimal strings so nothing is lost to floating
 * point); these functions only group digits, trim zeros and format dates.
 * All dates are shown in India time (NFR-12). Used by almost every screen: money/qty/date/dateTime for
 * display, todayIST/addDays for follow-ups, digits/waLink for WhatsApp and phone links (BuyerDetail, quote
 * sharing).
 * Calls no API and no react-query keys.
 */

/**
 * Format a decimal STRING from the API for display, using exact string work (no floating point).
 * @param value — e.g. '1234567.5' or '-12.30'. null, undefined or '' give '—' (em dash).
 * @param currency — an ISO code such as 'INR'. INR groups digits Indian-style (12,34,567.00); every other
 *   currency, and an unknown one, uses western grouping (1,234,567.00).
 * @param opts.symbol — set to false to drop the currency prefix and get just the number. Note that the
 *   "symbol" is the ISO code ('USD 1,200.00'), not a sign like $ or ₹. With no currency the prefix is
 *   omitted too.
 * @returns the formatted text. The fraction is padded or CUT to exactly 2 decimals (it never rounds,
 *   because the API already sends 2 dp). A leading '-' is kept.
 */
export function money(value: string | null | undefined, currency?: string | null, opts: { symbol?: boolean } = {}): string {
  if (value === null || value === undefined || value === '') return '—';
  const neg = value.startsWith('-');
  const [i = '0', f = '00'] = (neg ? value.slice(1) : value).split('.');
  const indian = currency === 'INR';
  const grouped = indian && i.length > 3
    ? `${i.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${i.slice(-3)}`
    : i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = `${neg ? '-' : ''}${grouped}.${f.padEnd(2, '0').slice(0, 2)}`;
  return opts.symbol === false || !currency ? body : `${currency} ${body}`;
}

/** Quantity without trailing zeros. */
/**
 * Show a quantity without needless trailing zeros: '10.500' -> '10.5', '10.000' -> '10', '25' stays '25'.
 * null, undefined and '' give ''. Used for quantities and GST percentages.
 */
export function qty(v: string | null | undefined): string {
  if (!v) return '';
  return v.includes('.') ? v.replace(/\.?0+$/, '') : v;
}

// English month abbreviations for date(). Not locale-dependent on purpose, so the output is the same on
// every device.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format a date for display as '09 Oct 2026'.
 * @param v — either a plain 'YYYY-MM-DD' (used as-is, no timezone shift, e.g. valid_until, next_followup)
 *   or a full ISO timestamp (e.g. issued_at, happened_at), which is first converted to the calendar date in
 *   India (Asia/Kolkata, NFR-12). null/undefined/'' give '—'.
 */
export function date(v: string | null | undefined): string {
  if (!v) return '—';
  const ymd = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Date(v).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [y, m, d] = ymd.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

/**
 * Format a full ISO timestamp as '09 Oct 2026, 03:45 pm' in India time (date() plus a 12-hour time).
 * Expects a real timestamp, not a bare YYYY-MM-DD.
 * @param v — ISO timestamp string such as an activity's happened_at.
 */
export function dateTime(v: string): string {
  const t = new Date(v).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
  return `${date(v)}, ${t}`;
}

/**
 * Today's calendar date in India as 'YYYY-MM-DD' (NFR-12), regardless of the device's own timezone. Used to
 * compare against next_followup / valid_until strings (a plain string comparison works for this format).
 */
export const todayIST = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/**
 * Add whole days to a 'YYYY-MM-DD' date and return 'YYYY-MM-DD'. Calculated in UTC so daylight saving or
 * the device timezone can never shift the result. `days` may be negative. Used by the follow-up quick-pick
 * buttons.
 * @param ymd — start date.
 * @param days — number of days to add.
 */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/**
 * Keep only the digits of a phone number, for wa.me and tel: links ('+91 98765-43210' -> '919876543210').
 * null/undefined give ''.
 */
export const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
/**
 * Build a WhatsApp click-to-chat URL: https://wa.me/<digits>, plus ?text=<URL-encoded message> if a message
 * is given. The stored number must include the country code, since wa.me does not guess one (the Buyer form
 * hints "With country code, e.g. +971…").
 * @param phone — buyer's WhatsApp or phone number in any format.
 * @param text — optional pre-filled message.
 */
export const waLink = (phone: string | null | undefined, text?: string) =>
  `https://wa.me/${digits(phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
