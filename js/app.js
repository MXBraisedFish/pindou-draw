import { initializeApp } from './app/app-initializer.js';
import { TEXT } from './language.js';
import './export-highlight-enhancements.js';

initializeApp().catch((error) => {
  console.error(TEXT.app.initFailed, error);
});
