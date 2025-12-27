import { ref, watch } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useConfigStore } from '@/stores/config';
import { FileUtils } from '@/utils/fileUtils';
import { neteaseApi } from '@/utils/neteaseApi';
import { LyricsParser } from '@/utils/lyricsParser';
import { invoke } from '@tauri-apps/api/core';
import logger from '@/utils/logger';

// 模块级别的在线歌词缓存，避免组件重新挂载时丢失
const onlineLyricsCache = new Map(); // key: trackPath, value: { lrc: string, parsed: array, source: string }

// 模块级别的共享状态，确保所有 useLyrics 实例共享同一个 lyricsSource
const sharedLyricsSource = ref('local');

export function useLyrics() {
    const playerStore = usePlayerStore();
    const configStore = useConfigStore();
    const lyrics = ref([]);
    const loading = ref(false);
    const activeIndex = ref(-1);
    // 使用共享的 lyricsSource
    const lyricsSource = sharedLyricsSource;
    const onlineLyricsError = ref(null);

    const fetchOnlineLyrics = async (track) => {
        if (!track) return null;
        try {
            const title = track.title || track.name || FileUtils.getFileNameWithoutExtension(track.path);
            const artist = track.artist || '';
            const duration = track.duration ? track.duration * 1000 : 0;
            logger.debug('Fetching online lyrics for: ' + title + ' - ' + artist);
            const lyricsData = await neteaseApi.searchAndGetLyrics(title, artist, duration);
            if (!lyricsData || !lyricsData.lrc) {
                logger.debug('No online lyrics found');
                return null;
            }
            let lrcContent = lyricsData.lrc;
            if (configStore.lyrics?.preferTranslation && lyricsData.tlyric) {
                lrcContent = neteaseApi.mergeLyrics(lyricsData.lrc, lyricsData.tlyric);
            }
            return lrcContent;
        } catch (error) {
            logger.error('Failed to fetch online lyrics:', error);
            onlineLyricsError.value = error.message;
            return null;
        }
    };

    const saveLyricsToLocal = async (trackPath, lrcContent) => {
        if (!trackPath || !lrcContent) return false;
        try {
            const baseName = FileUtils.getFileNameWithoutExtension(trackPath);
            const directory = FileUtils.getDirectoryPath(trackPath);
            const lyricsPath = directory + '/' + baseName + '.lrc';
            await invoke('write_lyrics_file', { path: lyricsPath, content: lrcContent });
            logger.info('Lyrics saved to: ' + lyricsPath);
            return true;
        } catch (error) {
            logger.error('Failed to save lyrics:', error);
            return false;
        }
    };

    const loadLyrics = async (trackPath) => {
        if (!trackPath) { 
            lyrics.value = []; 
            playerStore.lyrics = null;  // 同步到 store
            lyricsSource.value = 'local';
            onlineLyricsError.value = null;
            return; 
        }
        
        // 先检查缓存中是否有这首歌的在线歌词
        const cached = onlineLyricsCache.get(trackPath);
        if (cached) {
            logger.debug('Using cached online lyrics for:', trackPath);
            lyrics.value = cached.parsed;
            playerStore.lyrics = cached.parsed;  // 同步到 store
            lyricsSource.value = cached.source;
            loading.value = false;
            return;
        }
        
        loading.value = true;
        lyrics.value = [];
        playerStore.lyrics = null;  // 同步到 store
        lyricsSource.value = 'local';
        onlineLyricsError.value = null;
        try {
            const lyricsPath = await FileUtils.findLyricsFile(trackPath);
            if (lyricsPath) {
                const content = await FileUtils.readFile(lyricsPath);
                const ext = FileUtils.getFileExtension(lyricsPath);
                // 使用统一的异步解析器
                lyrics.value = await LyricsParser.parseAsync(content, ext);
                playerStore.lyrics = lyrics.value;  // 同步到 store
                lyricsSource.value = 'local';
            } else if (configStore.lyrics?.enableOnlineFetch) {
                logger.debug('No local lyrics found, trying online fetch...');
                const track = playerStore.currentTrack;
                const onlineLrc = await fetchOnlineLyrics(track);
                if (onlineLrc) {
                    const parsed = await LyricsParser.parseAsync(onlineLrc, 'lrc');
                    lyrics.value = parsed;
                    playerStore.lyrics = parsed;  // 同步到 store
                    lyricsSource.value = 'online';
                    
                    // 缓存在线歌词
                    onlineLyricsCache.set(trackPath, {
                        lrc: onlineLrc,
                        parsed: parsed,
                        source: 'online'
                    });
                    
                    if (configStore.lyrics?.autoSaveOnlineLyrics) {
                        const saved = await saveLyricsToLocal(trackPath, onlineLrc);
                        if (saved) {
                            lyricsSource.value = 'local';
                            // 保存成功后从缓存中移除，下次会从本地加载
                            onlineLyricsCache.delete(trackPath);
                        }
                    }
                }
            }
        } catch (e) {
            logger.error('Error loading lyrics:', e);
            onlineLyricsError.value = e.message;
        } finally {
            loading.value = false;
        }
    };

    const fetchAndSaveLyrics = async () => {
        const track = playerStore.currentTrack;
        if (!track) return false;
        loading.value = true;
        onlineLyricsError.value = null;
        try {
            const onlineLrc = await fetchOnlineLyrics(track);
            if (onlineLrc) {
                const parsed = await LyricsParser.parseAsync(onlineLrc, 'lrc');
                lyrics.value = parsed;
                playerStore.lyrics = parsed;  // 同步到 store
                lyricsSource.value = 'online';
                
                // 缓存在线歌词
                onlineLyricsCache.set(track.path, {
                    lrc: onlineLrc,
                    parsed: parsed,
                    source: 'online'
                });
                
                // 只有在启用自动保存时才保存到本地
                if (configStore.lyrics?.autoSaveOnlineLyrics) {
                    const saved = await saveLyricsToLocal(track.path, onlineLrc);
                    if (saved) {
                        lyricsSource.value = 'local';
                        // 保存成功后从缓存中移除
                        onlineLyricsCache.delete(track.path);
                    }
                }
                return true;
            }
            return false;
        } catch (e) {
            logger.error('Error fetching lyrics:', e);
            onlineLyricsError.value = e.message;
            return false;
        } finally {
            loading.value = false;
        }
    };

    const stopWatchTrack = watch(() => playerStore.currentTrack?.path, loadLyrics, { immediate: true });

    // activeIndex 更新逻辑 - 使用节流避免高频更新
    // 这个值被 VisualizerPanel 等组件使用
    let lastActiveIndexUpdate = 0;
    const ACTIVE_INDEX_THROTTLE = 100; // 每 100ms 更新一次
    
    const stopWatchEffect = watch(
        () => playerStore.currentTime,
        (currentTime) => {
            if (!lyrics.value.length) {
                if (activeIndex.value !== -1) {
                    activeIndex.value = -1;
                    playerStore.currentLyricIndex = -1;
                }
                return;
            }
            
            // 节流：避免每次 currentTime 变化都计算
            const now = Date.now();
            if (now - lastActiveIndexUpdate < ACTIVE_INDEX_THROTTLE) return;
            lastActiveIndexUpdate = now;
            
            // 应用歌词偏移
            const offset = playerStore.lyricsOffset || 0;
            const adjustedTime = currentTime + 0.05 - offset;
            
            // 二分查找当前歌词索引
            let l = 0, r = lyrics.value.length - 1, idx = -1;
            while (l <= r) {
                const mid = (l + r) >> 1;
                if (lyrics.value[mid].time <= adjustedTime) {
                    idx = mid;
                    l = mid + 1;
                } else {
                    r = mid - 1;
                }
            }
            
            if (idx !== activeIndex.value) {
                activeIndex.value = idx;
                playerStore.currentLyricIndex = idx;
            }
        },
        { immediate: true }
    );

    // 清理函数
    const cleanup = () => {
        stopWatchTrack();
        stopWatchEffect();
    };

    return {
        lyrics,
        loading,
        activeIndex,
        lyricsSource,
        onlineLyricsError,
        fetchAndSaveLyrics,
        loadLyrics,
        cleanup
    };
}
