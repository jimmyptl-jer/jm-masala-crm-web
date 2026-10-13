/**
 * Tailwind CSS configuration: which files to scan, the brand colours, fonts and the 44 px touch-target
 * size.
 * Processed through postcss.config.js; the generated styles are imported by src/index.css (@tailwind
 * base/components/utilities).
 * Brand tokens are copied from the marketing site (deep green, gold, cream, wood brown).
 */

export default {
  // Files Tailwind scans for class names; classes not found in these files are removed from the final CSS.
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Brand palette copied from the marketing site, used as classes like bg-forest-900, text-gold-500,
      // bg-cream-100. forest = deep greens (900 is the main brand colour, used for the sidebar and
      // buttons), gold = accent, cream = page and panel backgrounds, wood = brown accents, ink = body text.
      colors: {
        forest: { 950: '#142214', 900: '#1a2e1a', 800: '#2d4a2d', 700: '#3b5c3b', 600: '#4a6741', 100: '#e6efe0', 50: '#f2f7ee' },
        gold: { 600: '#a8893a', 500: '#c9a84c', 300: '#e2c97e', 100: '#f5e9c8' },
        cream: { 50: '#fdfbf7', 100: '#faf6ee', 200: '#f1e9d8' },
        wood: { 800: '#5a3a1a', 600: '#7a5230' },
        ink: '#2a2a2a',
      },
      // sans (Inter) for body text, serif (Cormorant Garamond) for headings (font-serif); the Google Fonts
      // are loaded in src/index.css. The rest of each list are fallbacks if the font cannot load.
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        serif: ['Cormorant Garamond', 'Georgia', 'serif'],
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
