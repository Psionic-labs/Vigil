/**
 * @file postcss.config.mjs
 * @description PostCSS config specifying autoprefixer settings.
 * @why Ensures generated stylesheets work consistently across multiple browser types.
 */

export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
