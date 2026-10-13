// PostCSS pipeline used by Vite for src/index.css: Tailwind first, then Autoprefixer. Nothing else to
// configure here; see tailwind.config.js for the design tokens.

// tailwindcss turns the @tailwind directives and utility classes into CSS; autoprefixer adds vendor
// prefixes for older browsers.
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
