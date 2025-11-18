//! 音频元数据相关的结构和函数
//! 
//! 这个模块包含音轨元数据结构和处理函数

use lofty::{Accessor, AudioFile, Probe, TaggedFileExt};
use serde::Serialize;
use std::path::Path;
use base64::{Engine as _, engine::general_purpose};
use tauri::command;

/// 单个音轨的元数据
#[derive(Debug, Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TrackMetadata {
    #[serde(rename = "path")]
    pub path: String,
    #[serde(rename = "name")]
    pub name: String,
    #[serde(rename = "title")]
    pub title: Option<String>,
    #[serde(rename = "artist")]
    pub artist: Option<String>,
    #[serde(rename = "album")]
    pub album: Option<String>,
    #[serde(rename = "duration")]
    pub duration: Option<f64>,
    #[serde(rename = "cover")]
    pub cover: Option<String>,
    #[serde(rename = "bitrate")]
    pub bitrate: Option<u32>,
    #[serde(rename = "sampleRate")]
    pub sample_rate: Option<u32>,
    #[serde(rename = "channels")]
    pub channels: Option<u8>,
}

impl TrackMetadata {
    #[must_use]
    #[allow(dead_code)]
    pub fn new(path: String, name: String) -> Self {
        Self {
            path,
            name,
            title: None,
            artist: None,
            album: None,
            duration: None,
            cover: None,
            bitrate: None,
            sample_rate: None,
            channels: None,
        }
    }
    
    /// Set the title of the track
    #[allow(dead_code)]
    pub fn with_title(mut self, title: Option<String>) -> Self {
        self.title = title;
        self
    }
    
    /// Set the artist of the track
    #[allow(dead_code)]
    pub fn with_artist(mut self, artist: Option<String>) -> Self {
        self.artist = artist;
        self
    }
    
    /// Set the album of the track
    #[allow(dead_code)]
    pub fn with_album(mut self, album: Option<String>) -> Self {
        self.album = album;
        self
    }
    
    /// Set the duration of the track in seconds
    #[allow(dead_code)]
    pub fn with_duration(mut self, duration: Option<f64>) -> Self {
        self.duration = duration;
        self
    }
    
    /// Set the cover art data as base64 string
    #[allow(dead_code)]
    pub fn with_cover(mut self, cover: Option<String>) -> Self {
        self.cover = cover;
        self
    }
    
    /// Set the bitrate of the track
    #[allow(dead_code)]
    pub fn with_bitrate(mut self, bitrate: Option<u32>) -> Self {
        self.bitrate = bitrate;
        self
    }
    
    /// Set the sample rate of the track
    #[allow(dead_code)]
    pub fn with_sample_rate(mut self, sample_rate: Option<u32>) -> Self {
        self.sample_rate = sample_rate;
        self
    }
    
    /// Set the number of channels
    #[allow(dead_code)]
    pub fn with_channels(mut self, channels: Option<u8>) -> Self {
        self.channels = channels;
        self
    }
}

/// 包含多个音轨的播放列表
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    #[serde(rename = "name")]
    pub name: String,
    #[serde(rename = "files")]
    pub files: Vec<TrackMetadata>,
}

impl Playlist {
    #[must_use]
    #[allow(dead_code)]
    pub fn new(name: String) -> Self {
        Self {
            name,
            files: Vec::new(),
        }
    }
    
    #[allow(dead_code)]
    pub fn add_track(&mut self, track: TrackMetadata) {
        self.files.push(track);
    }
    
    #[must_use]
    #[allow(dead_code)]
    pub fn track_count(&self) -> usize {
        self.files.len()
    }
    
    #[must_use]
    #[allow(dead_code)]
    pub fn is_empty(&self) -> bool {
        self.files.is_empty()
    }
    
    /// Get a reference to the track at the given index
    #[allow(dead_code)]
    pub fn get_track(&self, index: usize) -> Option<&TrackMetadata> {
        self.files.get(index)
    }
    
    /// Get a mutable reference to the track at the given index
    #[allow(dead_code)]
    pub fn get_track_mut(&mut self, index: usize) -> Option<&mut TrackMetadata> {
        self.files.get_mut(index)
    }
    
    /// Remove a track at the given index and return it
    #[allow(dead_code)]
    pub fn remove_track(&mut self, index: usize) -> Option<TrackMetadata> {
        if index < self.files.len() {
            Some(self.files.remove(index))
        } else {
            None
        }
    }
    
    /// Clear all tracks from the playlist
    #[allow(dead_code)]
    pub fn clear(&mut self) {
        self.files.clear();
    }
}

/// 获取音轨的元数据信息
#[command]
pub fn get_track_metadata(path: String) -> Result<TrackMetadata, String> {
    let file_path = Path::new(&path);

    let tagged_file = Probe::open(file_path)
        .map_err(|e| e.to_string())?
        .read()
        .map_err(|e| e.to_string())?;

    let properties = tagged_file.properties();
    let duration = properties.duration().as_secs_f64();

    let mut metadata = TrackMetadata {
        // 标准化路径格式，确保使用反斜杠（Windows格式）
        path: path.replace("/", "\\"),
        name: file_path.file_name().unwrap_or_default().to_string_lossy().to_string(),
        duration: if duration > 0.0 { Some(duration) } else { None },
        bitrate: properties.audio_bitrate(),
        sample_rate: properties.sample_rate(),
        channels: properties.channels(),
        ..Default::default()
    };

    if let Some(tag) = tagged_file.primary_tag() {
        metadata.title = tag.title().map(String::from);
        metadata.artist = tag.artist().map(String::from);
        metadata.album = tag.album().map(String::from);

        if let Some(picture) = tag.pictures().get(0) {
            let mime_type = picture.mime_type().map_or("image/jpeg", |m| m.as_str());
            let data = picture.data();
            let cover_data_url = format!(
                "data:{};base64,{}",
                mime_type,
                general_purpose::STANDARD.encode(data)
            );
            metadata.cover = Some(cover_data_url);
        }
    }
    
    if metadata.title.is_none() || metadata.title.as_deref() == Some("") {
        metadata.title = Some(metadata.name.clone());
    }

    Ok(metadata)
}