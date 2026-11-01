/**
 * Shared UI building blocks used by every screen: Button, form fields (Field, Input, NumberInput, Textarea,
 * Select), Segmented toggle, Card, StatusBadge, Spinner, EmptyState, ErrorNote, PageHeader, Sheet (modal)
 * and the toast system (ToastProvider/useToast).
 * Pure presentation: no API calls. It only imports ApiError (lib/api.ts) so errorMessage() can read an API
 * error's message, and the strings in strings.ts. Colours and sizes come from tailwind.config.js and
 * index.css (the `tap` class guarantees a 44 px touch target).
 * Forms in this app show validation text by passing `error` to these fields (taken from ApiError.fields or
 * local checks).
 */

import clsx from 'clsx';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { t } from '@/strings';
import type { QuoteStatus } from '@/lib/types';
import { ApiError } from '@/lib/api';

// ---- Button -----------------------------------------------------------------------------------
// The five button looks. primary = main action (paprika; one per screen), gold = the same paprika (old name), secondary = outlined,
// ghost = text-only, danger = destructive (red).
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
// Tailwind classes per variant, including hover/active/disabled colours. Brand colours (forest, gold,
// cream) are defined in tailwind.config.js.
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-paprika text-white hover:bg-paprika-700 active:bg-paprika-800 disabled:bg-paprika-300',
  gold: 'bg-paprika text-white hover:bg-paprika-700 active:bg-paprika-800 disabled:bg-paprika-300',
  secondary: 'border border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-hover disabled:text-ink-placeholder',
  ghost: 'text-ink-secondary hover:bg-surface-hover hover:text-ink disabled:text-ink-placeholder',
  danger: 'bg-danger text-white hover:opacity-90 disabled:opacity-50',
};

/**
 * Standard button used on every screen (44 px minimum touch size via the `tap` class).
 * @param props.variant — 'primary' (default) | 'gold' | 'secondary' | 'ghost' | 'danger'.
 * @param props.loading — shows a spinner and DISABLES the button; screens pass it while a request is
 *   running so it cannot be double-clicked.
 * @param props.disabled — also disables it. All other button attributes (onClick, type, aria-label,
 *   className...) are passed through.
 * Gotcha: type defaults to "button" so a Button inside a <form> does NOT submit it; pass type="submit" for
 * the Save button (the {...rest} spread comes after the default, so it overrides it).
 */
export function Button({ variant = 'primary', loading, className, children, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={clsx('tap inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-base font-semibold transition-colors disabled:cursor-not-allowed', VARIANTS[variant], className)}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

// ---- Form fields ------------------------------------------------------------------------------
// Shared Tailwind classes for text inputs, selects and textareas: full width, 44 px tall, gold focus ring,
// grey when disabled. The red border for errors is added by each component.
const fieldBase = 'w-full min-h-tap rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-fg placeholder:text-fg-placeholder hover:border-line-strong focus:border-paprika focus:outline-none focus:ring-2 focus:ring-paprika/20 disabled:bg-surface-muted disabled:text-fg-muted';

/**
 * Label + control + hint/error wrapper that every form control is built on.
 * @param props.label — visible label text, linked to the control with a generated id (useId) so clicking
 *   the label focuses it and screen readers announce it.
 * @param props.error — red message under the control (role="alert"); replaces the hint while present.
 * @param props.hint — small grey help text under the control.
 * @param props.optional — appends "(optional)" to the label.
 * @param props.children — render function that receives the generated id and must return the control:
 *   <Field ...>{(id) => <input id={id} />}</Field>.
 * @param props.className — class for the outer wrapper.
 */
export function Field({ label, error, hint, optional, children, className }:
  { label: string; error?: string; hint?: string; optional?: boolean; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-xs font-bold text-ink-secondary">
        {label}
        {optional && <span className="ml-1 font-normal text-fg-muted">({t.common.optional})</span>}
      </label>
      {children(id)}
      {hint && !error && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-danger-ink">{error}</p>}
    </div>
  );
}

// Props shared by Input, NumberInput, Textarea and Select (wrapperClassName styles the outer Field,
// className the control itself).
type FieldProps = { label: string; error?: string; hint?: string; optional?: boolean; wrapperClassName?: string };

/**
 * Labelled single-line text input (Field + <input>). Passes every normal input attribute through (type,
 * inputMode, autoComplete, maxLength...). With `error` it gets a red border and aria-invalid.
 * @param props.label / error / hint / optional — see Field. @param props.wrapperClassName — class for the
 *   outer wrapper.
 */
export function Input({ label, error, hint, optional, wrapperClassName, className, ...rest }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} error={error} hint={hint} optional={optional} className={wrapperClassName}>
      {(id) => <input id={id} className={clsx(fieldBase, error ? 'border-red-600' : 'border-forest-900/25', className)} aria-invalid={!!error} {...rest} />}
    </Field>
  );
}

/**
 * Labelled input for decimal numbers. Shows the numeric keypad on phones (inputMode="decimal") and keeps
 * the value as a TEXT string (so '12.50' never becomes a float; the API does the maths).
 * @param props.value — current text, e.g. '12.5' or ''.
 * @param props.onChange — receives the new text, only when it is a valid partial number: digits with at
 *   most `decimals` decimal places. A comma is converted to a dot first (some phone keyboards), and
 *   keystrokes that would make the text invalid are simply ignored. (With decimals = 0 a trailing '.' is
 *   still accepted while typing.)
 * @param props.decimals — maximum decimal places, default 2 (use 0 for whole numbers such as days, 3 for
 *   quantities).
 * Other props as Input. The number is right-aligned with tabular digits.
 */
export function NumberInput({ label, error, hint, optional, wrapperClassName, className, value, onChange, decimals = 2, ...rest }:
  FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & { value: string; onChange: (v: string) => void; decimals?: number }) {
  const re = new RegExp(`^\\d*(\\.\\d{0,${decimals}})?$`);
  return (
    <Field label={label} error={error} hint={hint} optional={optional} className={wrapperClassName}>
      {(id) => (
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => { const v = e.target.value.replace(',', '.'); if (re.test(v)) onChange(v); }}
          className={clsx(fieldBase, 'text-right tabular-nums', error ? 'border-red-600' : 'border-forest-900/25', className)}
          aria-invalid={!!error}
          {...rest}
        />
      )}
    </Field>
  );
}

/** Labelled multi-line text box (Field + <textarea>), 3 rows unless `rows` is passed. Props as Input. */
export function Textarea({ label, error, hint, optional, wrapperClassName, className, ...rest }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} error={error} hint={hint} optional={optional} className={wrapperClassName}>
      {(id) => <textarea id={id} rows={3} className={clsx(fieldBase, error ? 'border-red-600' : 'border-forest-900/25', className)} aria-invalid={!!error} {...rest} />}
    </Field>
  );
}

/**
 * Labelled native dropdown (Field + <select>); the <option> elements are passed as children. Props as
 * Input.
 */
export function Select({ label, error, hint, optional, wrapperClassName, className, children, ...rest }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} error={error} hint={hint} optional={optional} className={wrapperClassName}>
      {(id) => <select id={id} className={clsx(fieldBase, 'pr-8', error ? 'border-red-600' : 'border-forest-900/25', className)} aria-invalid={!!error} {...rest}>{children}</select>}
    </Field>
  );
}

/**
 * Big radio-style toggle with 2-3 options, used for Export / Domestic, type filters and the import entity.
 * Rendered as a radiogroup of buttons (aria-checked) so it works with a thumb and a screen reader.
 * @param props.value — the selected option's value.
 * @param props.onChange — called with the clicked option's value.
 * @param props.options — [{ value, label }] in display order.
 * @param props.label — optional heading above the toggle (also its aria-label).
 * @param props.disabled — greys out all options (e.g. while a request runs, or the buyer type is locked).
 */
export function Segmented<T extends string>({ value, onChange, options, label, disabled }:
  { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label?: string; disabled?: boolean }) {
  return (
    <div>
      {label && <div className="mb-1 text-sm font-medium text-forest-900">{label}</div>}
      <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-cream-200 p-1">
        {options.map((o) => (
          <button
            key={o.value} type="button" role="radio" aria-checked={value === o.value} disabled={disabled}
            onClick={() => onChange(o.value)}
            className={clsx('tap rounded-md px-3 py-2 text-base font-semibold transition-colors disabled:opacity-60', value === o.value ? 'bg-forest-900 text-white shadow' : 'text-forest-900 hover:bg-brand-50')}
          >{o.label}</button>
        ))}
      </div>
    </div>
  );
}

// ---- Misc display -----------------------------------------------------------------------------
/**
 * White rounded panel with a thin border and shadow (the `.card` class from index.css). Wraps sections on
 * most screens.
 */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('card', className)}>{children}</div>;
}

// Badge colours per quote status: grey draft, blue sent, amber negotiating, green won, red lost, dark grey
// expired.
const STATUS_STYLE: Record<QuoteStatus, string> = {
  draft: 'bg-surface-muted text-fg-secondary',
  sent: 'bg-info-bg text-info-ink',
  negotiating: 'bg-warning-bg text-warning-ink',
  won: 'bg-success-bg text-success-ink',
  lost: 'bg-danger-bg text-danger-ink',
  expired: 'bg-surface-muted text-fg-muted',
};
/**
 * Small coloured pill showing a quote status in words (labels come from t.common.status). Used in quote
 * lists, the buyer's quote list and quote detail.
 * @param props.status — 'draft' | 'sent' | 'negotiating' | 'won' | 'lost' | 'expired'.
 */
export function StatusBadge({ status }: { status: QuoteStatus }) {
  return <span className={clsx('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold', STATUS_STYLE[status])}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />{t.common.status[status]}</span>;
}

/**
 * Centred spinning loader with text, shown while a query or the auth check is loading (role="status" so it
 * is announced).
 * @param props.label — text beside the spinner, default "Loading".
 */
export function Spinner({ label = t.common.loading }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 py-10 text-forest-800" role="status"><Loader2 className="h-5 w-5 animate-spin" aria-hidden />{label}</div>;
}

/**
 * Friendly "nothing here" block for empty lists.
 * @param props.title — the main sentence. @param props.children — optional smaller hint line below it.
 */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="px-4 py-10 text-center text-fg-secondary"><p className="font-medium text-forest-900">{title}</p>{children && <div className="mt-2 text-sm">{children}</div>}</div>;
}

/**
 * Turn any thrown value into text a user can read: ApiError and Error give their message, anything else
 * gives the generic "something went wrong". Used for toasts in mutation onError handlers.
 * @param e — whatever was caught.
 */
export function errorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : t.common.somethingWrong;
}

/**
 * Red inline error box for a failed load or save (role="alert"), with an optional Retry link.
 * @param props.error — the thrown value; shown through errorMessage(). If it is falsy the generic "could
 *   not load, check your connection" text is shown instead.
 * @param props.onRetry — when given, a Retry button appears that calls it (screens pass query.refetch).
 */
export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="flex-1">{error ? errorMessage(error) : t.common.loadFailed}</div>
      {onRetry && <button type="button" onClick={onRetry} className="tap font-semibold underline">{t.common.retry}</button>}
    </div>
  );
}

/**
 * Page title row: big serif heading, optional subtitle and a group of action buttons on the right (wraps
 * below on a phone).
 * @param props.title — page heading (the page's <h1>). @param props.subtitle — small grey line under it.
 * @param props.actions — nodes (usually a Button) shown at the right.
 */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-8 tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Elements a keyboard user can tab to. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Focus handling for a modal dialog (Sheet, the buyer drawer): while `active`, focus moves into the panel (the panel itself, which needs
 * tabIndex={-1}), Tab and Shift+Tab stay inside it, and when it closes focus returns to the element that opened it.
 * @param panelRef — ref of the dialog panel. @param active — true while the dialog is open.
 */
export function useDialogFocus(panelRef: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const panel = panelRef.current;
    if (!panel) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const here = document.activeElement;
      // another dialog opened on top of this one owns the keyboard
      if (here && !panel.contains(here) && here !== document.body) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === here);
      if (items.length === 0) { e.preventDefault(); panel.focus(); return; }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && (here === first || here === panel || !panel.contains(here))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (here === last || !panel.contains(here))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [active, panelRef]);
}

/**
 * Modal panel: a bottom sheet on a phone and a centred dialog from md width up. Used for forms (new buyer,
 * edit product, user editor), pickers (SearchSelect) and quote actions.
 * @param props.open — whether it is shown; when false nothing is rendered, so the contents unmount and lose
 *   their state (reopening shows a fresh form).
 * @param props.onClose — called by the X button, a click on the dark backdrop, or the Escape key. NOTE:
 *   closing does not warn about unsaved typing.
 * @param props.title — heading (also the dialog's aria-label).
 * @param props.children — scrollable body. @param props.footer — optional fixed area at the bottom
 *   (buttons).
 * @param props.wide — a wider dialog (about 768 px instead of 512 px) from md width up, for long forms such as
 *   the buyer and product forms; on a phone every sheet is full width anyway.
 * While open the page behind cannot scroll (body overflow is locked and restored on close). Focus moves into the dialog, Tab is trapped
 * inside it and focus returns to the opener on close (useDialogFocus).
 */
export function Sheet({ open, onClose, title, children, footer, wide, huge }:
  { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean; huge?: boolean }) {
  // While open: close on Escape and lock page scrolling. The cleanup (on close or unmount) removes the key
  // listener and restores the previous overflow value. Re-runs if onClose changes identity, which is
  // harmless.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(panelRef, open);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-950/35 " onClick={onClose} />
      <div ref={panelRef} tabIndex={-1} className={`glass-panel-strong relative focus:outline-none flex max-h-[92dvh] w-full flex-col rounded-t-2xl md:rounded-2xl ${huge ? 'md:max-w-6xl' : wide ? 'md:max-w-3xl' : 'md:max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3">
          <h2 className="font-sans text-xl font-semibold tracking-tight text-crm-ink md:text-2xl">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t.common.close} className="tap -mr-2 rounded-lg text-slate-600 hover:bg-slate-100"><X className="mx-auto h-5 w-5" /></button>
        </div>
        <div className={`flex-1 overflow-y-auto px-4 py-4 ${wide || huge ? 'md:px-6' : ''}`}>{children}</div>
        {footer && <div className="safe-bottom border-t border-slate-200/80 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ---- Toasts -----------------------------------------------------------------------------------
// One visible toast message. tone 'ok' = dark green (3 s), 'error' = red (6 s).
interface ToastItem { id: number; text: string; tone: 'ok' | 'error' }
// Context holding the push function; the default is a no-op, so useToast() outside a ToastProvider silently
// does nothing.
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'error') => void>(() => undefined);
/**
 * Get the function that shows a toast: toast('Saved') for a green success message or toast('Failed',
 * 'error') for a red one. Used by every screen after a save, archive, copy etc.
 */
export const useToast = () => useContext(ToastCtx);

/**
 * Provider (mounted once in main.tsx) that keeps the list of toasts and renders them at the top centre of
 * the screen, above everything (aria-live so they are announced). The overlay does not block clicks
 * (pointer-events-none except on the messages).
 * @param props.children — the app.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  // Add a toast with a unique id and schedule its removal (3 s for ok, 6 s for errors so there is time to
  // read them). Stable via useCallback.
  const push = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, text, tone }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className={clsx('pointer-events-auto max-w-md rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg', i.tone === 'ok' ? 'bg-forest-900' : 'bg-red-700')}>{i.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
