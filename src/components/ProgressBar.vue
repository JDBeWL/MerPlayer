<template>
  <div class="progress-container">
    <div class="progress-bar" ref="progressBar" @click="handleProgressClick">
      <div class="progress-bar-buffer" :style="{ width: `${bufferPercent}%` }"></div>
      <div class="progress-bar-fill" :style="{ width: `${progressPercent}%` }"></div>
    </div>
    <div class="time-display">
      <span class="time-current">{{ formatTime(playerStore.currentTime) }}</span>
      <span class="time-duration">{{ formatTime(playerStore.duration) }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { usePlayerStore } from '../stores/player'

const playerStore = usePlayerStore()
const progressBar = ref(null)

const progressPercent = computed(() => {
  if (playerStore.duration === 0) return 0
  return (playerStore.currentTime / playerStore.duration) * 100
})

// In a real app, you would calculate buffer based on actual audio buffering
const bufferPercent = computed(() => {
  if (playerStore.duration === 0) return 0
  // Simulate buffer - in a real app, you'd use the audio element's buffered property
  return Math.min(100, (playerStore.currentTime / playerStore.duration) * 100 + 10)
})

const handleProgressClick = (event) => {
  if (!progressBar.value || playerStore.duration === 0) return
  
  const rect = progressBar.value.getBoundingClientRect()
  const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  const newTime = percent * playerStore.duration
  playerStore.seek(newTime)
}

const formatTime = (seconds) => {
  if (isNaN(seconds) || !isFinite(seconds)) return '0:00'
  
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}
</script>

<style scoped>
.progress-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.progress-bar {
  width: 100%;
  height: 4px;
  background-color: var(--md-sys-color-surface-variant);
  border-radius: 2px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
}

.progress-bar-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background-color: var(--md-sys-color-primary);
  border-radius: 2px;
  transition: width 0.1s linear;
}

.progress-bar-buffer {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background-color: color-mix(in srgb, var(--md-sys-color-primary) 30%, transparent);
  border-radius: 2px;
}

.time-display {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant);
}
</style>