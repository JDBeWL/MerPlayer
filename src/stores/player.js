import { defineStore } from 'pinia';
import { invoke } from '@tauri-apps/api/core';
import FileUtils from '../utils/fileUtils';
import LyricsParser from '../utils/lyricsParser';

export const usePlayerStore = defineStore('player', {
  state: () => ({
    // Core player state
    currentTrack: null,
    playlist: [],
    isPlaying: false,
    currentTime: 0,
    duration: 0, // This will be set from metadata, not a live audio element
    volume: 1,
    
    // Playback settings
    repeatMode: 'none', // 'none', 'track', 'list'
    isShuffle: false,

    // Lyrics
    lyrics: null,
    currentLyricIndex: -1,

    // Track technical info
    audioInfo: {
      bitrate: null,
      sampleRate: null,
      channels: null
    },

    // Internal state
    _isLoading: false,
    _statusPollId: null, // To hold the setInterval ID
    lastTrackIndex: -1, // To track the previous track index for transitions
  }),

  getters: {
    currentTrackIndex: (state) => {
      if (!state.currentTrack || state.playlist.length === 0) return -1;
      return state.playlist.findIndex(track => track.path === state.currentTrack.path);
    },
    hasNextTrack: (state) => {
      if (!state.currentTrack) return false;
      // If there's a playlist, there's always a next track because of looping.
      return state.playlist.length > 0;
    },
    hasPreviousTrack: (state) => {
      if (!state.currentTrack) return false;
      // If there's a playlist, there's always a previous track because of looping.
      return state.playlist.length > 0;
    },
    currentLyric: (state) => {
      if (!state.lyrics || state.currentLyricIndex < 0 || state.currentLyricIndex >= state.lyrics.length) {
        return null;
      }
      return state.lyrics[state.currentLyricIndex];
    }
  },

  actions: {
    // --- Initialization ---
    initAudio() {
      // This is a placeholder. The actual audio backend is initialized in Rust.
      // We could use this to get initial volume or other settings from the backend if needed.
      console.log('Player store initialized.');
    },

    // --- Core Actions ---

    /**
     * Plays the currently loaded track, or the first track in the playlist.
     */
    play() {
      if (this.currentTrack) {
        // 如果当前有歌曲，则重新播放当前歌曲（无论是否是列表最后一首）
        this.playTrack(this.currentTrack);
      } else if (this.playlist.length > 0) {
        // 如果没有当前歌曲但有播放列表，则播放第一首
        this.playTrack(this.playlist[0]);
      }
    },

    /**
     * Loads and plays a track from the beginning using the backend.
     * @param {object} track - The track object to play.
     */
    async playTrack(track) {
      if (!track || this._isLoading) return;

      // 检查文件是否存在，如果不存在则尝试修复路径
      let trackExists = await this.checkCurrentTrackExists();
      if (!trackExists && track.path) {
        // 尝试修复路径格式
        const altPath = track.path.includes('/') ? track.path.replace(/\//g, '\\') : track.path.replace(/\\/g, '/');
        if (altPath !== track.path) {
          track.path = altPath;
          trackExists = await this.checkCurrentTrackExists();
        }
      }
      
      if (!trackExists) {
        console.log('Track file not found:', track.path);
        // 创建一个友好的错误消息
        const errorMsg = `无法找到音乐文件: ${track.name || track.path}`;
        
        // 可以显示一个通知或设置一个错误状态，这里我们只是打印到控制台
        console.error(errorMsg);
        
        // 如果是播放列表中的歌曲，尝试播放下一首
        const currentTrackIndex = this.playlist.findIndex(t => t.path === track.path);
        if (this.playlist.length > 1 && currentTrackIndex < this.playlist.length - 1) {
          console.log('Attempting to play next track...');
          return this.nextTrack();
        } else {
          // 如果是最后一首或只有一首歌，则停止播放
          await this.resetPlayerState();
          return;
        }
      }

      this._isLoading = true;
      this.stopStatusPolling(); // Stop polling for the old track

      try {
        // 确保后端停止当前播放
        await invoke('pause_track');
      } catch (error) {
        console.error("Failed to pause before play:", error);
      }

      // Reset state for the new track
      this.lastTrackIndex = this.currentTrackIndex; // Store current index before updating
      this.currentTrack = track;
      this.duration = track.duration || 0;
      this.currentTime = 0;
      this.lyrics = null;
      this.currentLyricIndex = -1;
      this.audioInfo = {
        bitrate: track.bitrate || 'N/A',
        sampleRate: track.sampleRate || 'N/A',
        channels: track.channels || 'N/A',
      };

      try {
        console.log('Playing track:', track.path);
        await invoke('play_track', { path: track.path });
        console.log('Track play command sent successfully');
        this.isPlaying = true;
        this.startStatusPolling();
        this.loadLyrics(track.path).catch(err => console.error("Failed to load lyrics:", err));
      } catch (error) {
        console.error('Failed to play track:', error);
        this.isPlaying = false;
      } finally {
        this._isLoading = false;
      }
    },

    pause() {
      if (!this.isPlaying) return;
      invoke('pause_track')
        .then(() => {
          this.isPlaying = false;
          this.stopStatusPolling();
        })
        .catch(err => console.error("Failed to pause:", err));
    },

    resume() {
      if (this.isPlaying || !this.currentTrack) return;
      invoke('resume_track')
        .then(() => {
          this.isPlaying = true;
          this.startStatusPolling();
        })
        .catch(err => console.error("Failed to resume:", err));
    },

    togglePlay() {
      if (this.isPlaying) {
        this.pause();
      } else if (this.currentTrack) {
        // 检查播放进度是否在结尾处，或者后端已经播放完成
        const isAtEnd = this.duration > 0 && this.currentTime >= this.duration - 0.5;
        
        // 如果已经播放完成或接近结尾，重新从头播放
        if (isAtEnd) {
          this.play(); // 重新从头播放
        } else {
          this.resume(); // 从当前位置恢复播放
        }
      }
    },

    // --- Status Polling ---

    startStatusPolling() {
      this.stopStatusPolling(); // Ensure no multiple pollers are running
      const interval = 250; // ms
      this._statusPollId = setInterval(async () => {
        if (!this.isPlaying) {
          this.stopStatusPolling();
          return;
        }

        try {
          // 检查后端是否还有音频在播放
          const isFinished = await invoke('is_track_finished');
          
          if (isFinished) {
            // 如果后端音频播放完成，触发_onEnded处理
            this._onEnded();
            return;
          }
          
          // Increment current time
          const newTime = this.currentTime + (interval / 1000);

          if (this.duration > 0 && newTime >= this.duration) {
            this.currentTime = this.duration;
            // 不直接调用_onEnded，而是等待后端反馈
            // 这样可以避免重复触发
          } else {
            this.currentTime = newTime;
          }
        } catch (error) {
          console.error("Error checking track status:", error);
          // 如果调用出错，则使用基于时长的判断作为后备方案
          const newTime = this.currentTime + (interval / 1000);
          if (this.duration > 0 && newTime >= this.duration) {
            this.currentTime = this.duration;
            this._onEnded();
            return;
          } else {
            this.currentTime = newTime;
          }
        }
      }, interval);
    },

    stopStatusPolling() {
      if (this._statusPollId) {
        clearInterval(this._statusPollId);
        this._statusPollId = null;
      }
    },

    // --- Event Handlers (Simulated) ---

    async _onEnded() {
      // 确保后端停止播放
      try {
        await invoke('pause_track');
      } catch (error) {
        console.error("Failed to pause track:", error);
      }
      
      // 检查播放列表文件是否仍然存在
      const playlistExists = await this.checkPlaylistFilesExist();
      if (!playlistExists) {
        await this.resetPlayerState();
        return;
      }
      
      if (this.repeatMode === 'track') {
        // 单曲循环模式：重新播放当前歌曲
        await this.playTrack(this.currentTrack);
      } else if (this.repeatMode === 'list') {
        // 列表循环模式：继续播放下一首
        const nextIndex = (this.currentTrackIndex + 1) % this.playlist.length;
        await this.playTrack(this.playlist[nextIndex]);
      } else if (this.currentTrackIndex < this.playlist.length - 1) {
        // 非循环模式：如果不是最后一首，播放下一首
        const nextIndex = this.currentTrackIndex + 1;
        await this.playTrack(this.playlist[nextIndex]);
      } else {
        // 播放最后一首且没有开启循环播放
        // 停止播放，将进度设置为歌曲结束位置，并清除播放状态
        this.isPlaying = false;
        this.stopStatusPolling();
        this.currentTime = this.duration; // 标记为播放完成状态
        
        // 确保后端也停止播放
        try {
          await invoke('pause_track');
        } catch (error) {
          console.error("Failed to pause track after playlist ended:", error);
        }
      }
    },

    // --- Playlist and Navigation ---

    /**
     * 检查当前播放列表的歌曲文件是否仍然存在
     */
    async checkPlaylistFilesExist() {
      if (!this.playlist || this.playlist.length === 0) return true;
      
      try {
        // 检查播放列表中的每个文件是否存在
        for (const track of this.playlist) {
          let exists = await FileUtils.fileExists(track.path);
          
          // 如果原始路径不存在，尝试另一种路径分隔符格式
          if (!exists && track.path) {
            const altPath = track.path.includes('/') ? track.path.replace(/\//g, '\\') : track.path.replace(/\\/g, '/');
            if (altPath !== track.path) {
              track.path = altPath;
              exists = await FileUtils.fileExists(altPath);
            }
          }
          
          if (!exists) {
            console.error(`File not found in playlist: ${track.path}`);
            return false; // 如果任何一个文件不存在，返回false
          }
        }
        return true; // 所有文件都存在
      } catch (error) {
        console.error('Error checking playlist files:', error);
        return false; // 出错时认为文件不存在
      }
    },

    /**
     * 检查当前播放的歌曲是否仍然存在
     */
    async checkCurrentTrackExists() {
      if (!this.currentTrack) return false;
      
      try {
        // 先检查原始路径
        let exists = await FileUtils.fileExists(this.currentTrack.path);
        if (exists) return true;
        
        // 如果原始路径不存在，尝试另一种路径分隔符格式
        const altPath = this.currentTrack.path.includes('/') 
          ? this.currentTrack.path.replace(/\//g, '\\') 
          : this.currentTrack.path.replace(/\\/g, '/');
          
        if (altPath !== this.currentTrack.path) {
          exists = await FileUtils.fileExists(altPath);
          if (exists) {
            // 更新路径为有效的格式
            this.currentTrack.path = altPath;
            return true;
          }
        }
        
        return false;
      } catch (error) {
        console.error('Error checking current track:', error);
        return false;
      }
    },

    /**
     * 重置播放器状态到初始状态（当播放列表被删除时）
     */
    async resetPlayerState() {
      console.log('Resetting player state due to missing playlist files');
      
      // 停止播放
      this.isPlaying = false;
      this.stopStatusPolling();
      
      // 清空播放器状态
      this.currentTrack = null;
      this.playlist = [];
      this.currentTime = 0;
      this.duration = 0;
      this.lyrics = null;
      this.currentLyricIndex = -1;
      
      // 停止后端播放
      try {
        await invoke('pause_track');
      } catch (error) {
        console.error('Error stopping backend playback:', error);
      }
    },

    async nextTrack() {
      if (!this.currentTrack) return;

      // 检查播放列表文件是否仍然存在
      const playlistExists = await this.checkPlaylistFilesExist();
      if (!playlistExists) {
        await this.resetPlayerState();
        return;
      }

      let nextIndex;
      if (this.isShuffle) {
        if (this.playlist.length <= 1) {
          nextIndex = 0;
        } else {
          do {
            nextIndex = Math.floor(Math.random() * this.playlist.length);
          } while (nextIndex === this.currentTrackIndex);
        }
      } else {
        nextIndex = (this.currentTrackIndex + 1) % this.playlist.length;
      }
      
      await this.playTrack(this.playlist[nextIndex]);
    },

    async previousTrack() {
      if (!this.currentTrack) return;

      // 检查播放列表文件是否仍然存在
      const playlistExists = await this.checkPlaylistFilesExist();
      if (!playlistExists) {
        await this.resetPlayerState();
        return;
      }

      let prevIndex;
      if (this.isShuffle) {
        if (this.playlist.length <= 1) {
          prevIndex = 0;
        } else {
          do {
            prevIndex = Math.floor(Math.random() * this.playlist.length);
          } while (prevIndex === this.currentTrackIndex);
        }
      } else {
        prevIndex = this.currentTrackIndex - 1;
        if (prevIndex < 0) {
          prevIndex = this.playlist.length - 1;
        }
      }
      
      await this.playTrack(this.playlist[prevIndex]);
    },

    // --- Controls ---

    seek(time) {
      if (!this.currentTrack) return;
      
      const newTime = Math.max(0, Math.min(time, this.duration));
      
      invoke('seek_track', { time: newTime })
        .then(() => {
          this.currentTime = newTime; // Update time after backend confirms
          if (!this.isPlaying) {
            this.resume();
          }
        })
        .catch(err => console.error("Failed to seek:", err));
    },

    setVolume(volume) {
      const newVolume = Math.max(0, Math.min(1, volume));
      invoke('set_volume', { volume: newVolume })
        .then(() => {
          this.volume = newVolume;
        })
        .catch(err => console.error("Failed to set volume:", err));
    },

    toggleRepeat() {
      // 循环模式切换：none -> list -> track -> none
      if (this.repeatMode === 'none') {
        this.repeatMode = 'list';
        this.isShuffle = false;
      } else if (this.repeatMode === 'list') {
        this.repeatMode = 'track';
      } else {
        this.repeatMode = 'none';
      }
    },

    toggleShuffle() {
      this.isShuffle = !this.isShuffle;
      if (this.isShuffle) {
        this.repeatMode = 'none';
      }
    },

    // --- Data Loading ---

    loadPlaylist(playlist) {
      this.playlist = playlist;
      if (playlist && playlist.length > 0) {
        // Load the first track but don't play it automatically
        const firstTrack = playlist[0];
        this.currentTrack = firstTrack;
        this.duration = firstTrack.duration || 0;
        this.audioInfo = {
          bitrate: firstTrack.bitrate || 'N/A',
          sampleRate: firstTrack.sampleRate || 'N/A',
          channels: firstTrack.channels || 'N/A',
        };
      } else {
        // Clear player state if playlist is empty
        this.currentTrack = null;
        this.isPlaying = false;
        this.currentTime = 0;
        this.duration = 0;
        this.stopStatusPolling();
      }
    },

    async loadLyrics(trackPath) {
      try {
        const lyricsPath = await FileUtils.findLyricsFile(trackPath);
        if (lyricsPath) {
          const lyricsContent = await FileUtils.readFile(lyricsPath);
          const format = FileUtils.getFileExtension(lyricsPath);
          this.lyrics = LyricsParser.parse(lyricsContent, format);
        } else {
          this.lyrics = null;
        }
      } catch (error) {
        console.log('No lyrics found or failed to load:', error);
        this.lyrics = null;
      }
    },

    // This action is called when the app is closing
    cleanup() {
        this.stopStatusPolling();
        // Optionally, tell the backend to stop playing
        invoke('pause_track');
    }
  }
});
