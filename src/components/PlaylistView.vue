<template>
  <div class="playlist-view" :class="{ 'slide-out': isClosing }">
    <div class="playlist-header">
      <h2 class="playlist-title">{{ $t('playlist.title') }}</h2>
      <button class="icon-button" @click="handleClose">
        <span class="material-symbols-rounded">close</span>
      </button>
    </div>
    
    <div class="playlist-content">
      <div v-if="playlist.length === 0" class="playlist-empty">
        <div class="empty-state">
          <span class="material-symbols-rounded">queue_music</span>
          <h3>{{ $t('playlist.empty') }}</h3>
          <p>{{ $t('playlist.addSongs') }}</p>
        </div>
      </div>
      
      <div v-else class="playlist-songs">
        <div class="list">
          <div 
            v-for="(track, index) in playlist" 
            :key="index"
            class="list-item"
            :class="{ selected: isCurrentTrack(track) }"
            @click="playTrack(track)"
          >
            <div class="list-item-leading">
              <span 
                class="material-sounds-playing-icon" 
                v-if="isCurrentTrack(track) && playerStore.isPlaying"
              >
                <span class="bar bar-1"></span>
                <span class="bar bar-2"></span>
                <span class="bar bar-3"></span>
              </span>
              <span class="material-symbols-rounded playing-icon" v-else-if="isCurrentTrack(track)">
                equalizer
              </span>
              <span class="material-symbols-rounded" v-else>
                music_note
              </span>
            </div>
            <div class="list-item-content">
              <div class="list-item-headline">{{ getTrackTitle(track) }}</div>
              <div class="list-item-supporting">{{ getTrackArtist(track) }}</div>
            </div>
            <div class="list-item-trailing">
              <button class="icon-button" @click.stop="removeTrack(index)">
                <span class="material-symbols-rounded">close</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '../stores/player'
import { useConfigStore } from '../stores/config'
import FileUtils from '../utils/fileUtils'
import { TitleExtractor } from '../utils/titleExtractor'

const emit = defineEmits(['close'])

const playerStore = usePlayerStore()
const configStore = useConfigStore()
const { playlist, currentTrack, isPlaying } = storeToRefs(playerStore)

// 控制动画状态
const isClosing = ref(false)

// 关闭动画处理
const handleClose = () => {
  isClosing.value = true
  setTimeout(() => {
    emit('close')
  }, 300) // 与CSS动画时间一致
}

// 存储处理后的音轨信息
const processedTracks = ref({})

// 智能获取音轨标题
const getTrackTitle = (track) => {
  const trackPath = track.path
  
  // 如果已经处理过该音轨，直接返回结果
  if (processedTracks.value[trackPath]) {
    return processedTracks.value[trackPath].title
  }
  
  // 异步处理音轨信息（这里实际是同步处理，但保持函数结构）
  processTrackInfo(trackPath)
  
  // 如果还没处理完，暂时返回文件名
  return FileUtils.getFileName(trackPath)
}

// 智能获取音轨艺术家
const getTrackArtist = (track) => {
  const trackPath = track.path
  
  // 如果已经处理过该音轨，直接返回结果
  if (processedTracks.value[trackPath]) {
    return processedTracks.value[trackPath].artist
  }
  
  // 如果还没处理完，暂时返回空或track中已有的artist信息
  return track.artist || ''
}

// 异步处理音轨信息
const processTrackInfo = async (trackPath) => {
  try {
    // 如果已经在处理中，跳过
    if (processedTracks.value[trackPath]?.processing) return
    
    // 标记为处理中
    processedTracks.value[trackPath] = { processing: true }
    
    // 获取配置
    const config = {
      preferMetadata: configStore.titleExtraction?.preferMetadata ?? true,
      hideFileExtension: configStore.titleExtraction?.hideFileExtension ?? true,
      parseArtistTitle: configStore.titleExtraction?.parseArtistTitle ?? true,
      separator: configStore.titleExtraction?.separator ?? '-',
      customSeparators: configStore.titleExtraction?.customSeparators ?? ['-', '_', '.', ' ']
    }
    
    // 使用 TitleExtractor 智能提取标题信息
    const titleInfo = await TitleExtractor.extractTitle(trackPath, config)
    
    // 更新处理结果
    processedTracks.value[trackPath] = {
      processing: false,
      ...titleInfo
    }
    
  } catch (error) {
    console.error('处理音轨信息失败:', trackPath, error)
    // 出错时使用文件名作为标题
    processedTracks.value[trackPath] = {
      processing: false,
      title: FileUtils.getFileName(trackPath),
      artist: '',
      fileName: FileUtils.getFileName(trackPath),
      isFromMetadata: false
    }
  }
}

// 监听播放列表变化，预加载音轨信息
watch(playlist, (newPlaylist) => {
  if (newPlaylist && newPlaylist.length > 0) {
    // 预加载所有音轨信息
    newPlaylist.forEach(track => {
      if (track.path) {
        processTrackInfo(track.path)
      }
    })
  }
}, { immediate: true, deep: true })

// 组件挂载时也预加载
onMounted(() => {
  if (playlist.value && playlist.value.length > 0) {
    playlist.value.forEach(track => {
      if (track.path) {
        processTrackInfo(track.path)
      }
    })
  }
})

const isCurrentTrack = (track) => {
  return currentTrack.value && currentTrack.value.path === track.path
}

const playTrack = (track) => {
  playerStore.playTrack(track)
}

const removeTrack = (index) => {
  // Create a new playlist without the removed track
  const newPlaylist = [...playlist.value]
  newPlaylist.splice(index, 1)
  playerStore.loadPlaylist(newPlaylist)
}
</script>

<style scoped>
.playlist-view {
  position: fixed;
  top: 0;
  right: 0;
  width: 400px;
  height: 100%;
  background-color: var(--md-sys-color-surface); /* Changed to surface for guaranteed opacity */
  box-shadow: var(--md-sys-elevation-level2);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform: translateX(0);
  transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.playlist-view.slide-out {
  transform: translateX(100%);
}

.playlist-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}

.playlist-title {
  font-size: 24px;
  font-weight: 500;
  margin: 0;
  color: var(--md-sys-color-on-surface);
}

.playlist-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.playlist-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 300px;
}

.empty-state .material-symbols-rounded {
  font-size: 64px;
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: 16px;
}

.empty-state h3 {
  font-size: 20px;
  font-weight: 500;
  margin: 0 0 8px 0;
  color: var(--md-sys-color-on-surface);
}

.empty-state p {
  font-size: 14px;
  margin: 0;
  color: var(--md-sys-color-on-surface-variant);
}

.playlist-songs {
  height: 100%;
}

.list {
  background-color: var(--md-sys-color-surface);
  border-radius: var(--md-sys-shape-corner-medium);
  overflow: visible;
  padding: 2px;
}

.list-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  margin: 2px 0;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.list-item:hover {
  background-color: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
  border-radius: 8px;
}

.list-item.selected {
  background-color: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
  border-radius: 8px;
  z-index: 1;
}

.list-item-leading {
  margin-right: 16px;
  color: var(--md-sys-color-on-surface-variant);
}

.list-item.selected .list-item-leading {
  color: var(--theme-on-primary-container);
}

.list-item-content {
  flex: 1;
}

.list-item-headline {
  font-size: 16px;
  font-weight: 400;
  color: var(--md-sys-color-on-surface);
}

.list-item.selected .list-item-headline {
  color: var(--theme-on-primary-container);
}

.list-item-supporting {
  font-size: 14px;
  color: var(--md-sys-color-on-surface-variant);
}

.list-item.selected .list-item-supporting {
  color: var(--theme-on-primary-container);
}

.list-item-trailing {
  display: flex;
  gap: 8px;
}

/* 声音播放动画图标 */
.material-sounds-playing-icon {
  display: inline-flex;
  align-items: flex-end;
  height: 24px;
  width: 24px;
  color: inherit;
}

.bar {
  display: inline-block;
  width: 3px;
  margin: 0 1px;
  background-color: currentColor;
  border-radius: 3px;
  animation: sound-wave 0.6s infinite ease-in-out;
}

.bar-1 {
  height: 6px;
  animation-delay: 0s;
}

.bar-2 {
  height: 12px;
  animation-delay: 0.2s;
}

.bar-3 {
  height: 8px;
  animation-delay: 0.4s;
}

@keyframes sound-wave {
  0%, 100% {
    transform: scaleY(0.5);
    opacity: 0.7;
  }
  50% {
    transform: scaleY(1);
    opacity: 1;
  }
}

/* 确保选中状态下的图标颜色一致 */
.list-item.selected .material-sounds-playing-icon,
.list-item.selected .playing-icon {
  color: var(--theme-on-primary-container);
}
</style>