//! 系统相关的 Tauri 命令
//! 
//! 这个模块包含所有与系统相关的功能，如获取系统字体等

use tauri::command;

/// 获取系统信息
#[command]
pub fn get_system_info() -> Result<std::collections::HashMap<String, String>, String> {
    let mut info = std::collections::HashMap::new();
    
    // 获取操作系统信息
    info.insert("os".to_string(), std::env::consts::OS.to_string());
    info.insert("arch".to_string(), std::env::consts::ARCH.to_string());
    info.insert("family".to_string(), std::env::consts::FAMILY.to_string());
    
    // 获取音乐目录
    if let Some(music_dir) = dirs::audio_dir() {
        info.insert("music_dir".to_string(), music_dir.to_string_lossy().to_string());
    }

    Ok(info)
}

/// 获取系统可用的字体列表
#[command]
pub fn get_system_fonts() -> Result<Vec<String>, String> {
    let mut fonts = Vec::new();
    
    // 添加最常用的系统字体和MD3推荐字体
    fonts.push("system-ui".to_string());         // 系统默认UI字体
    fonts.push("Roboto".to_string());            // MD3字体
    fonts.push("Arial".to_string());             // Windows常用
    fonts.push("Helvetica".to_string());          // macOS常用
    fonts.push("Times New Roman".to_string());    // 衬线字体
    fonts.push("Noto Sans".to_string());         // Google字体，支持多语言
    fonts.push("Segoe UI".to_string());          // Windows 10/11默认
    fonts.push("PingFang SC".to_string());       // macOS中文默认
    fonts.push("Microsoft YaHei".to_string());   // Windows中文默认
    fonts.push("Consolas".to_string());          // 常用等宽字体
    
    // 去重并排序
    fonts.sort();
    fonts.dedup();
    
    Ok(fonts)
}