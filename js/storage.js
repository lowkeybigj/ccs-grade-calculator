export const STORAGE_KEY = 'gradeCalculatorClasses';
export const THEME_KEY = 'ccsGradeCalculatorTheme';

export function getSavedClasses() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
}

export function saveAllClasses(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function applyTheme(theme, button) {
  const isDark = theme === 'dark';
  document.body.classList.toggle('dark', isDark);
  if (button) button.textContent = isDark ? 'Light Mode' : 'Dark Mode';
  localStorage.setItem(THEME_KEY, theme);
}

export function loadTheme(button) {
  applyTheme(localStorage.getItem(THEME_KEY) || 'light', button);
}
