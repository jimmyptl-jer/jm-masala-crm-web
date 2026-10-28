/**
 * Tailwind CSS configuration: which files to scan, the colour tokens, fonts and the 44 px touch-target size.
 * Processed through postcss.config.js; the generated styles are imported by src/index.css (@tailwind
 * base/components/utilities).
 * The colours are the JM Masala design system v2, Clean White + Paprika (DESIGN_SYSTEM.md at the workspace root):
 * white surfaces, warm stone neutrals, paprika as the only brand colour, and status colours. The same values are CSS
 * variables in src/index.css and hex values in src/lib/design-tokens.ts; keep the three identical. Components use the
 * token names, never raw hex.
 */

// Paprika scale (DESIGN_SYSTEM.md section 1).
const paprika = { 50: '#FFF4ED', 100: '#FFE4D3', 200: '#FDC5A5', 300: '#F99A6B', 400: '#EE6F38', 500: '#DC5419', 600: '#C2410C', 700: '#A1350B', 800: '#7F2B0D', 900: '#5E220D' };

// Warm stone neutrals. Also used to re-point Tailwind's slate / zinc / gray / stone / neutral so older screens get warm greys.
const stone = { 50: '#FAFAF9', 100: '#F5F5F4', 200: '#E7E5E4', 300: '#D6D3D1', 400: '#A8A29E', 500: '#78716C', 600: '#57534E', 700: '#44403C', 800: '#292524', 900: '#1C1917', 950: '#0C0A09' };

// Ink scale used by the older class names brand-* / forest-* / ink: dark text, selected chips, hover surfaces.
const ink = { 50: '#F0EFEE', 100: '#F5F5F4', 200: '#E7E5E4', 300: '#D6D3D1', 400: '#A8A29E', 500: '#78716C', 600: '#44403C', 700: '#44403C', 800: '#292524', 900: '#1C1917', 950: '#1C1917' };

// Status scales: only for status (success, warning, danger, info) and chart meaning, never decoration.
const success = { 50: '#DCFCE7', 100: '#DCFCE7', 200: '#BBF7D0', 500: '#15803D', 600: '#15803D', 700: '#166534', 800: '#166534', 900: '#14532D' };
const warning = { 50: '#FEF3C7', 100: '#FEF3C7', 200: '#FDE68A', 500: '#D97706', 600: '#D97706', 700: '#92400E', 800: '#92400E', 900: '#78350F' };
const danger = { 50: '#FFE4E6', 100: '#FFE4E6', 200: '#FECDD3', 500: '#BE123C', 600: '#BE123C', 700: '#BE123C', 800: '#9F1239', 900: '#881337' };
const info = { 50: '#DBEAFE', 100: '#DBEAFE', 200: '#BFDBFE', 500: '#2563EB', 600: '#2563EB', 700: '#1D4ED8', 800: '#1D4ED8', 900: '#1E3A8A' };
const purple = { 50: '#EDE9FE', 100: '#EDE9FE', 200: '#DDD6FE', 500: '#7C3AED', 600: '#7C3AED', 700: '#6D28D9', 800: '#5B21B6', 900: '#4C1D95' };

export default {
  // Files Tailwind scans for class names; classes not found in these files are removed from the final CSS.
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ---- design-system names ----
        bg: '#FAFAF9',
        surface: { DEFAULT: '#FFFFFF', muted: '#F5F5F4', hover: '#F0EFEE' },
        line: { DEFAULT: '#E7E5E4', strong: '#D6D3D1' },
        paprika: { DEFAULT: paprika[600], ...paprika },
        success: { DEFAULT: '#15803D', ink: '#166534', bg: '#DCFCE7' },
        warning: { DEFAULT: '#D97706', ink: '#92400E', bg: '#FEF3C7' },
        danger: { DEFAULT: '#BE123C', ink: '#BE123C', bg: '#FFE4E6' },
        info: { DEFAULT: '#2563EB', ink: '#1D4ED8', bg: '#DBEAFE' },
        // ink: text colours (ink, ink-secondary, ink-muted, ink-placeholder); `fg` is the older name for the same four
        ink: { DEFAULT: '#1C1917', secondary: '#44403C', muted: '#78716C', placeholder: '#A8A29E' },
        fg: { DEFAULT: '#1C1917', secondary: '#44403C', muted: '#78716C', placeholder: '#A8A29E' },

        // ---- older names used by existing screens, mapped onto the same tokens ----
        // brand / forest = dark ink (titles, selected chips and tabs, dark buttons); paprika is used explicitly for primary actions
        brand: { DEFAULT: '#1C1917', hover: '#44403C', pressed: '#1C1917', ...ink },
        forest: ink,
        // accent / gold = paprika (highlights, focus, hero numbers); accent-ink is the small label colour = ink-muted
        accent: { DEFAULT: paprika[600], 50: paprika[50], 100: paprika[100], 300: paprika[300], ink: '#78716C', strong: paprika[600] },
        gold: { 50: paprika[50], 100: paprika[100], 200: paprika[200], 300: paprika[300], 400: paprika[400], 500: paprika[600], 600: paprika[700], 700: paprika[700] },
        crm: {
          navy: 'rgb(var(--brand-navy-rgb) / <alpha-value>)',
          ink: 'rgb(var(--brand-ink-rgb) / <alpha-value>)',
          blue: 'rgb(var(--brand-blue-rgb) / <alpha-value>)',
          green: 'rgb(var(--brand-green-rgb) / <alpha-value>)',
        },
        cream: { 50: '#FFFFFF', 100: '#F5F5F4', 200: '#E7E5E4' },
        sage: { 50: '#FAFAF9' },
        wood: { 800: '#1C1917', 600: '#44403C' },
        brown: ink,

        // ---- Tailwind palettes re-pointed to the tokens (warm greys, status colours) ----
        slate: stone, zinc: stone, gray: stone, stone, neutral: stone,
        emerald: success, green: success, teal: success,
        amber: warning, orange: warning, yellow: warning,
        red: danger, rose: danger,
        blue: info, sky: info, indigo: info, cyan: info,
        violet: purple, purple,
      },
      // Lato for everything in the UI; Cormorant Garamond (font-display) only for the sidebar wordmark and PDF titles.
      // The Google Fonts are loaded in src/index.css.
      fontFamily: {
        sans: ['Lato', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Cormorant Garamond', 'Georgia', 'serif'],
        serif: ['Cormorant Garamond', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(28,25,23,.04)',
        pop: '0 10px 30px rgba(28,25,23,.10), 0 2px 6px rgba(28,25,23,.06)',
      },
      // Custom size `tap` = 44 px, the minimum touch target on phones (SRS usability rule). Used as
      // min-h-tap / min-w-tap and by the .tap class in src/index.css.
      minHeight: { tap: '44px' },
      minWidth: { tap: '44px' },
    },
  },
  // No Tailwind plugins used.
  plugins: [],
};
