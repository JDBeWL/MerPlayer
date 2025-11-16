import { defineStore } from 'pinia';
import {
  argbFromHex,
  themeFromSourceColor,
  applyTheme,
} from '@material/material-color-utilities';

export const useThemeStore = defineStore('theme', {
  state: () => ({
    isDarkMode: false,
    themePreference: 'auto', // 'auto', 'light', 'dark', or a hex color
    primaryColor: '#64B5F6', // Default light blue
  }),

  actions: {
    toggleDarkMode() {
      this.isDarkMode = !this.isDarkMode;
      document.documentElement.setAttribute('data-theme', this.isDarkMode ? 'dark' : 'light');
      if (this.themePreference !== 'auto') {
        this.themePreference = this.isDarkMode ? 'dark' : 'light';
      }
      this.applyTheme();
    },

    setPrimaryColor(color) {
      this.primaryColor = color;
      this.themePreference = color; // Set themePreference to the custom color
      this.applyTheme();
    },

    setThemePreference(preference) {
      this.themePreference = preference;
      if (preference === 'auto') {
        const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.isDarkMode = prefersDarkMode;
        this.primaryColor = '#64B5F6'; // Reset to default
      } else if (preference === 'light') {
        this.isDarkMode = false;
        this.primaryColor = '#64B5F6'; // Reset to default
      } else if (preference === 'dark') {
        this.isDarkMode = true;
        this.primaryColor = '#64B5F6'; // Reset to default
      } else if (preference.startsWith('#')) {
        this.primaryColor = preference;
      }
      this.applyTheme();
    },

    applyTheme() {
      const theme = themeFromSourceColor(argbFromHex(this.primaryColor));
      applyTheme(theme, { target: document.documentElement, dark: this.isDarkMode });
      document.documentElement.setAttribute('data-theme', this.isDarkMode ? 'dark' : 'light');
      // Explicitly set --md-sys-color-primary to the user's selected primaryColor
      document.documentElement.style.setProperty('--md-sys-color-primary', this.primaryColor);
      console.log('Generated Theme:', theme);
    },
  },
});