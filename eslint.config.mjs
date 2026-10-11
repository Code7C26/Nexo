// Config de ESLint del repo. Se corre con `npm run lint` desde la raíz, que
// pasa por scripts/lint.mjs: ese script controla que las reglas se apliquen y
// que ningún archivo quede afuera en silencio (hist. §54).
//
// Es .mjs y no .js porque el package.json de la raíz no es "type": "module".
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['frontend/js/vendor/'] },
  js.configs.recommended,
  {
    rules: {
      // Los `catch {}` vacíos son a propósito: localStorage puede no estar
      // disponible y el logout sigue igual aunque falle la llamada.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['frontend/js/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // Libs de js/vendor/, cargadas con <script> bajo demanda (cargarLibsPdf).
        jspdf: 'readonly',
        html2canvas: 'readonly',
      },
    },
  },
  {
    // sesion.js es el único script clásico: inyecta app.js como módulo.
    files: ['frontend/js/sesion.js'],
    languageOptions: { sourceType: 'script' },
  },
  {
    files: ['backend/**/*.js', 'scripts/**/*.mjs', '*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.node,
    },
  },
];
