/**
 * @file postcss.config.mjs
 * @description PostCSS config specifying autoprefixer settings.
 * @why Ensures generated stylesheets work consistently across multiple browser types.
 */

const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}

export default config
