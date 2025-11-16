<template>
  <div class="directory-node" :class="['depth-' + node.depth]">
    <div 
      class="node-header"
      :class="{ 'has-files': node.audioFiles.length > 0 }"
      @click="toggleExpand"
    >
      <div class="node-leading">
        <span class="material-symbols-rounded">
          {{ node.subdirectories.length > 0 ? (isExpanded ? 'expand_more' : 'chevron_right') : 'folder' }}
        </span>
      </div>
      
      <div class="node-content">
        <div class="node-name">{{ node.name }}</div>
        <div class="node-info">
          {{ node.audioFiles.length }} {{ $t('library.songs') }}
          <span v-if="node.subdirectories.length > 0">
            • {{ node.subdirectories.length }} {{ $t('library.subdirectories') }}
          </span>
        </div>
      </div>
      
      <div class="node-actions" v-if="node.audioFiles.length > 0">
        <button class="icon-button" @click.stop="playNode" :title="$t('controls.play')">
          <span class="material-symbols-rounded">play_arrow</span>
        </button>
        <button 
          class="icon-button" 
          @click.stop="$emit('remove-folder', node.path)"
          :title="$t('controls.delete')"
          v-if="node.depth === 0"
        >
          <span class="material-symbols-rounded">delete</span>
        </button>
      </div>
    </div>
    
    <div class="node-children" v-if="isExpanded">
      <DirectoryNode
        v-for="child in node.subdirectories"
        :key="child.path"
        :node="child"
        @play-playlist="$emit('play-playlist', $event)"
        @remove-folder="$emit('remove-folder', $event)"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  node: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['play-playlist', 'remove-folder'])

const isExpanded = ref(props.node.depth < 2) // 默认展开前两层

const toggleExpand = () => {
  if (props.node.subdirectories.length > 0) {
    isExpanded.value = !isExpanded.value
  }
}

const playNode = () => {
  if (props.node.audioFiles.length > 0) {
    const playlist = {
      name: props.node.name,
      path: props.node.path,
      files: props.node.audioFiles,
      subdirectoryCount: props.node.subdirectories.length,
      totalFiles: props.node.audioFiles.length
    }
    emit('play-playlist', playlist)
  }
}
</script>

<style scoped>
.directory-node {
  margin-left: 0;
}

.depth-1 {
  margin-left: 16px;
}

.depth-2 {
  margin-left: 32px;
}

.depth-3 {
  margin-left: 48px;
}

.depth-4 {
  margin-left: 64px;
}

.node-header {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.node-header:hover {
  background-color: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
}

.node-header.has-files:hover {
  background-color: color-mix(in srgb, var(--theme-primary) 8%, transparent);
}

.node-leading {
  margin-right: 12px;
  color: var(--md-sys-color-on-surface-variant);
}

.node-content {
  flex: 1;
  min-width: 0;
}

.node-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface);
  margin-bottom: 2px;
}

.node-info {
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant);
}

.node-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.node-header:hover .node-actions {
  opacity: 1;
}

.node-children {
  border-left: 1px solid var(--md-sys-color-outline-variant);
  margin-left: 12px;
  padding-left: 12px;
}

.material-symbols-rounded {
  font-size: 18px;
}
</style>