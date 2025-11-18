use std::fmt;

/// 自定义错误类型，用于音乐播放器应用
#[derive(Debug)]
#[allow(dead_code)] // 为未来使用预留
pub enum AppError {
    /// IO 相关错误
    Io(std::io::Error),
    /// 音频解码错误
    AudioDecoder(String),
    /// 文件不存在
    FileNotFound(String),
    /// 无效的文件路径
    InvalidPath(String),
    /// 配置相关错误
    Config(String),
    /// Tauri 相关错误
    Tauri(tauri::Error),
    /// JSON 序列化/反序列化错误
    Json(serde_json::Error),
    /// 其他通用错误
    Other(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Io(err) => write!(f, "IO error: {}", err),
            AppError::AudioDecoder(err) => write!(f, "Audio decoder error: {}", err),
            AppError::FileNotFound(path) => write!(f, "File not found: {}", path),
            AppError::InvalidPath(path) => write!(f, "Invalid file path: {}", path),
            AppError::Config(err) => write!(f, "Configuration error: {}", err),
            AppError::Tauri(err) => write!(f, "Tauri error: {}", err),
            AppError::Json(err) => write!(f, "JSON error: {}", err),
            AppError::Other(err) => write!(f, "Error: {}", err),
        }
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Io(err)
    }
}

impl From<tauri::Error> for AppError {
    fn from(err: tauri::Error) -> Self {
        AppError::Tauri(err)
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::Json(err)
    }
}

/// 应用结果类型
#[allow(dead_code)] // 为未来使用预留
pub type AppResult<T> = Result<T, AppError>;