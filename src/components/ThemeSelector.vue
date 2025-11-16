<template>
  <div class="theme-selector">
    <button class="icon-button" @click="toggleColorPicker">
      <span class="material-symbols-rounded">palette</span>
    </button>
    
    <div class="color-picker" v-if="showColorPicker">
      <div class="color-picker-header">
        <h3>{{ $t('themeSelector.chooseThemeColor') }}</h3>
      </div>
      
      <div class="color-presets">
        <div 
          v-for="color in colorPresets" 
          :key="color"
          class="color-preset"
          :style="{ backgroundColor: color }"
          @click="selectColor(color)"
        ></div>
      </div>
      
      <div class="custom-color">
        <label for="custom-color">{{ $t('themeSelector.customColor') }}</label>
        <input 
          type="color" 
          id="custom-color" 
          :value="themeStore.primaryColor" 
          @input="selectCustomColor"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useThemeStore } from '../stores/theme'
import { useConfigStore } from '../stores/config'

const themeStore = useThemeStore()
const configStore = useConfigStore()
const showColorPicker = ref(false)

const colorPresets = [
  '#64B5F6', // Light Blue (default)
  '#82B1FF', // Light Blue Accent
  '#448AFF', // Blue
  '#2979FF', // Blue Accent
  '#536DFE', // Indigo
  '#3D5AFE', // Indigo Accent
  '#651FFF', // Deep Purple
  '#6200EA', // Deep Purple Accent
  '#7C4DFF', // Purple
  '#B388FF', // Purple Accent
  '#E040FB', // Pink
  '#D500F9', // Pink Accent
  '#FF4081', // Pink Accent 2
  '#F50057', // Pink Accent 3
  '#FF1744', // Red Accent
  '#D50000', // Red Accent 2
  '#FF5252', // Red
  '#FF6E40', // Deep Orange Accent
  '#FF9100', // Orange Accent
  '#FFAB00', // Amber Accent
  '#FFD600', // Yellow Accent
  '#AEEA00', // Lime Accent
  '#76FF03', // Light Green Accent
  '#00E676', // Green Accent
  '#1DE9B6', // Teal Accent
  '#00BFA5', // Cyan Accent
  '#00B8D4', // Light Blue Accent 2
  '#0091EA', // Blue Accent 2
  '#304FFE', // Indigo Accent 2
  '#6200EA', // Deep Purple Accent 2
  '#AA00FF', // Purple Accent 2
  '#C51162', // Pink Accent 4
  '#E91E63', // Pink
  '#9C27B0', // Purple
  '#673AB7', // Deep Purple
  '#3F51B5', // Indigo
  '#2196F3', // Blue
  '#03A9F4', // Light Blue
  '#00BCD4', // Cyan
  '#009688', // Teal
  '#4CAF50', // Green
  '#8BC34A', // Light Green
  '#CDDC39', // Lime
  '#FFEB3B', // Yellow
  '#FFC107', // Amber
  '#FF9800', // Orange
  '#FF5722', // Deep Orange
  '#795548', // Brown
  '#9E9E9E', // Grey
  '#607D8B'  // Blue Grey
]

const toggleColorPicker = () => {
  showColorPicker.value = !showColorPicker.value
}

const selectColor = async (color) => {
  themeStore.setPrimaryColor(color)
  showColorPicker.value = false
  
  // 自动保存配置到 user.json
  if (configStore.general.autoSaveConfig) {
    try {
      await configStore.saveConfig()
      console.log('主题色已保存到 user.json')
    } catch (error) {
      console.error('保存主题色到 user.json 失败:', error)
    }
  }
}

const selectCustomColor = async (event) => {
  themeStore.setPrimaryColor(event.target.value)
  
  // 自动保存配置到 user.json
  if (configStore.general.autoSaveConfig) {
    try {
      await configStore.saveConfig()
      console.log('主题色已保存到 user.json')
    } catch (error) {
      console.error('保存主题色到 user.json 失败:', error)
    }
  }
}
</script>

<style scoped>
.theme-selector {
  position: relative;
}

.color-picker {
  position: absolute;
  top: 60px;
  width: 300px;
  translate: -45%;
  background-color: var(--md-sys-color-surface);
  border-radius: var(--md-sys-shape-corner-medium);
  box-shadow: var(--md-sys-elevation-level3);
  z-index: 1000;
  padding: 16px;
}

.color-picker-header {
  margin-bottom: 16px;
}

.color-picker-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface);
}

.color-presets {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.color-preset {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.2s;
}

.color-preset:hover {
  transform: scale(1.2);
}

.custom-color {
  display: flex;
  align-items: center;
  gap: 8px;
}

.custom-color label {
  font-size: 14px;
  color: var(--md-sys-color-on-surface);
}

.custom-color input {
  width: 40px;
  height: 24px;
  border: none;
  border-radius: var(--md-sys-shape-corner-small);
  cursor: pointer;
}
</style>