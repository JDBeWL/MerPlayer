//! WASAPI 音频模块
//!
//! 提供 Windows Audio Session API (WASAPI) 独占模式支持。
//! 如果你觉得 WASAPI 独占模式在 Windows 平台上还是不够纯净的音频播放，可以尝试使用 ASIO 驱动。

mod exclusive;
mod player;

pub use exclusive::{AudioCommand, AudioResponse, PlaybackState, WasapiExclusivePlayback};
pub use player::check_device_exclusive_support;
