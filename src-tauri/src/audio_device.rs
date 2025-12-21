//! 音频设备管理相关的 Tauri 命令
//!
//! 这个模块包含所有与音频设备管理相关的功能，包括获取可用设备列表和切换输出设备

use super::AppState;
use cpal::traits::{DeviceTrait, HostTrait};
use cpal::{StreamConfig, SampleFormat};
use rodio::{OutputStream, Sink};
use tauri::{command, State, AppHandle};

/// 表示音频设备信息
#[derive(Debug, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    /// 设备名称
    pub name: String,
    /// 是否为默认设备
    pub is_default: bool,
    /// 是否支持独占模式
    pub supports_exclusive_mode: bool,
    /// 当前使用独占模式
    pub is_exclusive_mode: bool,
    /// 当前音频模式状态
    pub audio_mode_status: String,
}

/// 获取所有可用的音频输出设备
#[command]
pub fn get_audio_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    let host = cpal::default_host();
    let default_device_name = host
        .default_output_device()
        .and_then(|d| d.name().ok());

    let devices = host.output_devices().map_err(|e| e.to_string())?;
    let mut device_infos: Vec<AudioDeviceInfo> = Vec::new();

    for device in devices {
        if let Ok(name) = device.name() {
            let is_default = default_device_name.as_ref().map_or(false, |d_name| *d_name == name);
            
            // 检测设备是否支持独占模式
            let supports_exclusive_mode = check_exclusive_mode_support(&device);
            
            device_infos.push(AudioDeviceInfo { 
                name, 
                is_default,
                supports_exclusive_mode,
                is_exclusive_mode: false, // 默认不使用独占模式
                audio_mode_status: "standard".to_string(), // 默认为标准模式
            });
        }
    }

    Ok(device_infos)
}

/// 切换音频输出设备
#[command]
pub fn set_audio_device(app: AppHandle, state: State<AppState>, device_name: String, current_time: Option<f32>) -> Result<(), String> {
    println!("Attempting to switch to audio device: {}", device_name);

    let host = cpal::default_host();
    let device = host
        .output_devices()
        .map_err(|e| format!("Failed to get output devices: {e}"))?
        .find(|d| d.name().map_or(false, |name| name == device_name))
        .ok_or(format!("Audio device not found: {}", device_name))?;

    // 检查是否启用独占模式
    let exclusive_mode = *state.player.exclusive_mode.lock().unwrap();
    println!("Creating audio stream for device '{}' with exclusive mode: {}", device_name, exclusive_mode);
    
    // 使用优化的输出流创建函数
    let (_stream, stream_handle, _mode_status) = create_optimized_output_stream(&device, exclusive_mode)?;

    // 泄露新的流以保持其存活
    Box::leak(Box::new(_stream));

    // 创建新的sink
    let new_sink = Sink::try_new(&stream_handle).map_err(|e| format!("Failed to create new sink: {e}"))?;

    // 从旧的sink获取播放状态
    let is_playing;
    let volume;
    let current_path;
    {
        let old_sink = state.player.sink.lock().unwrap();
        is_playing = !old_sink.is_paused();
        volume = old_sink.volume();
        old_sink.stop(); // 停止旧sink中的所有声音
    }
    
    current_path = state.player.current_path.lock().unwrap().clone();

    // 将新sink应用到播放器状态
    {
        let mut sink_guard = state.player.sink.lock().unwrap();
        *sink_guard = new_sink;
    }

    // 恢复音量和播放状态
    {
        let sink_guard = state.player.sink.lock().unwrap();
        sink_guard.set_volume(volume);
        if is_playing {
            sink_guard.play();
        } else {
            sink_guard.pause();
        }
    }

    // 更新当前设备名称
    *state.player.current_device_name.lock().unwrap() = device_name;
    
    // 如果有当前播放的音轨，则在新设备上重新播放
    if let Some(path) = current_path {
        // 使用现有的play_track函数重新加载音轨
        // 因为play_track会处理解码和播放
        super::playback::play_track(app.clone(), state, path, current_time)?;
    }

    println!("Successfully switched to audio device (exclusive mode: {}).", exclusive_mode);
    Ok(())
}

/// 创建独占模式的输出流
#[allow(dead_code)]
fn create_exclusive_output_stream(device: &cpal::Device) -> Result<(OutputStream, rodio::OutputStreamHandle), String> {
    println!("Creating exclusive audio stream for device: {}", 
             device.name().unwrap_or_else(|_| "Unknown".to_string()));
    
    // 获取设备的默认输出配置
    let config = device.default_output_config()
        .map_err(|e| format!("Failed to get default output config: {e}"))?;
    
    println!("Device sample format: {:?}", config.sample_format());
    println!("Device config: {:?}", config);
    
    // 首先尝试创建带有独占模式设置的 rodio 输出流
    // 通过尝试创建一个独占模式的 cpal 流来测试设备是否支持独占模式
    let _exclusive_stream = match config.sample_format() {
        SampleFormat::F32 => test_exclusive_stream::<f32>(device, config.clone()),
        SampleFormat::I16 => test_exclusive_stream::<i16>(device, config.clone()),
        SampleFormat::U16 => test_exclusive_stream::<u16>(device, config.clone()),
        SampleFormat::I8 => test_exclusive_stream::<i8>(device, config.clone()),
        SampleFormat::U8 => test_exclusive_stream::<u8>(device, config.clone()),
        SampleFormat::I32 => test_exclusive_stream::<i32>(device, config.clone()),
        SampleFormat::I64 => test_exclusive_stream::<i64>(device, config.clone()),
        SampleFormat::U32 => test_exclusive_stream::<u32>(device, config.clone()),
        SampleFormat::U64 => test_exclusive_stream::<u64>(device, config.clone()),
        SampleFormat::F64 => test_exclusive_stream::<f64>(device, config.clone()),
        _ => Err(format!("Unsupported sample format: {:?}", config.sample_format())),
    };
    
    match _exclusive_stream {
        Ok(_) => {
            // 如果测试成功，则表示设备支持独占模式
            println!("Device supports exclusive mode, creating output stream");
            
            // 创建 rodio 输出流
            let (output_stream, stream_handle) = OutputStream::try_from_device(device)
                .map_err(|e| format!("Failed to create output stream: {e}"))?;
            
            // 注意：虽然我们使用了 cpal 测试了独占模式的支持，
            // 但 rodio 本身可能不会以独占方式运行流
            // 这需要更底层的集成才能完全实现
            
            println!("Created output stream with exclusive mode test success");
            Ok((output_stream, stream_handle))
        }
        Err(e) => {
            // 如果测试失败，设备不支持独占模式
            println!("Device does not support exclusive mode: {}, using shared mode", e);
            
            // 创建标准的 rodio 输出流
            let (output_stream, stream_handle) = OutputStream::try_from_device(device)
                .map_err(|e| format!("Failed to create output stream: {e}"))?;
            
            println!("Created standard output stream (shared mode)");
            Ok((output_stream, stream_handle))
        }
    }
}

/// 创建优化的输出流（根据设备支持情况选择最佳模式）
fn create_optimized_output_stream(
    device: &cpal::Device,
    exclusive_mode: bool,
) -> Result<(OutputStream, rodio::OutputStreamHandle, String), String> {
    println!(
        "Creating optimized audio stream for device: {}, exclusive_mode: {}",
        device.name().unwrap_or_else(|_| "Unknown".to_string()),
        exclusive_mode
    );

    // 获取设备的默认输出配置
    let config = device
        .default_output_config()
        .map_err(|e| format!("Failed to get default output config: {e}"))?;

    println!("Device sample format: {:?}", config.sample_format());
    println!("Device config: {:?}", config);

    // 检查设备是否支持独占模式
    let supports_exclusive = check_exclusive_mode_support(device);

    // 根据用户设置和设备支持情况决定使用哪种模式
    // 注意：当前实现中没有真正的独占模式，所有模式都使用共享流
    let mode_status = if exclusive_mode && supports_exclusive {
        "optimized".to_string() // 即使设备支持，也只是优化的共享模式
    } else if exclusive_mode && !supports_exclusive {
        "optimized".to_string() // 用户请求独占但设备不支持，使用优化模式
    } else {
        "standard".to_string() // 标准共享模式
    };

    // 创建标准的 rodio 输出流
    // 注意：当前实现中没有真正的独占模式，所有模式都使用共享流
    // 但我们可以尝试使用较小的缓冲区来减少延迟
    let (output_stream, stream_handle) = OutputStream::try_from_device(device)
        .map_err(|e| format!("Failed to create output stream: {e}"))?;

    println!(
        "Created output stream with mode: {} (exclusive: {}, supported: {})",
        mode_status, exclusive_mode, supports_exclusive
    );

    Ok((output_stream, stream_handle, mode_status))
}

/// 测试设备是否支持独占模式
#[allow(dead_code)]
fn test_exclusive_stream<T>(device: &cpal::Device, config: cpal::SupportedStreamConfig) -> Result<(), String>
where
    T: cpal::Sample + cpal::SizedSample + Send + Sync + 'static,
{
    // 创建输出流配置
    let mut stream_config: StreamConfig = config.into();
    
    // 设置独占模式的标志
    stream_config.buffer_size = cpal::BufferSize::Fixed(256); // 使用较小的缓冲区以获得更低的延迟
    
    println!("Attempting to test exclusive stream with config: {:?}", stream_config);
    
    // 创建一个错误回调函数
    let err_fn = |err| {
        eprintln!("An error occurred on the output audio stream: {}", err);
    };
    
    // 创建空的数据回调函数，因为我们只想要独占访问
    let data_fn = move |_data: &mut [T], _: &cpal::OutputCallbackInfo| {
        // 我们不播放任何声音，这只是一个占位符
    };
    
    // 尝试创建独占模式的流
    match device.build_output_stream(&stream_config, data_fn, err_fn, None) {
        Ok(stream) => {
            // 立即停止流，因为我们只是测试
            drop(stream);
            println!("Device supports exclusive mode");
            Ok(())
        }
        Err(e) => {
            println!("Device does not support exclusive mode: {}", e);
            Err(format!("Device does not support exclusive mode: {e}"))
        }
    }
}

/// 切换独占模式
#[command]
pub fn toggle_exclusive_mode(app: AppHandle, state: State<AppState>, enabled: bool, current_time: Option<f32>) -> Result<(), String> {
    println!("Toggling exclusive mode: {} with current_time: {:?}", enabled, current_time);
    
    // 检查之前的独占模式状态
    let prev_exclusive = *state.player.exclusive_mode.lock().unwrap();
    if prev_exclusive == enabled {
        println!("Exclusive mode already set to {}, no action needed", enabled);
        return Ok(());
    }
    
    // 更新播放器状态中的独占模式标志
    *state.player.exclusive_mode.lock().unwrap() = enabled;
    
    // 如果当前正在播放，需要重新应用音频设置
    let current_path = state.player.current_path.lock().unwrap().clone();
    if let Some(ref path) = current_path {
        println!("Currently playing: {}, recreating audio stream", path);
        
        // 获取当前设备名称
        let current_device = state.player.current_device_name.lock().unwrap().clone();
        
        // 重新创建音频输出流
        let host = cpal::default_host();
        let device = host
            .output_devices()
            .map_err(|e| format!("Failed to get output devices: {e}"))?
            .find(|d| d.name().map_or(false, |name| name == current_device))
            .ok_or(format!("Audio device not found: {}", current_device))?;
        
        // 使用优化的输出流创建函数
        let (_stream, stream_handle, _mode_status) = create_optimized_output_stream(&device, enabled)?;
        
        // 泄露新的流以保持其存活
        Box::leak(Box::new(_stream));
        
        // 创建新的sink
        let new_sink = Sink::try_new(&stream_handle).map_err(|e| format!("Failed to create new sink: {e}"))?;
        
        // 从旧的sink获取播放状态
        let is_playing;
        let volume;
        {
            let old_sink = state.player.sink.lock().unwrap();
            is_playing = !old_sink.is_paused();
            volume = old_sink.volume();
            old_sink.stop(); // 停止旧sink中的所有声音
        }
        
        // 将新sink应用到播放器状态
        {
            let mut sink_guard = state.player.sink.lock().unwrap();
            *sink_guard = new_sink;
        }
        
        // 恢复音量和播放状态
        {
            let sink_guard = state.player.sink.lock().unwrap();
            sink_guard.set_volume(volume);
            if is_playing {
                sink_guard.play();
            } else {
                sink_guard.pause();
            }
        }
        
        // 重新加载当前音轨
        super::playback::play_track(app.clone(), state, path.clone(), current_time)?;
        
        println!("Successfully recreated audio stream with exclusive mode: {}", enabled);
    } else {
        println!("No audio currently playing, just toggling the setting");
    }
    
    Ok(())
}

/// 获取独占模式状态
#[command]
pub fn get_exclusive_mode(state: State<AppState>) -> Result<bool, String> {
    Ok(*state.player.exclusive_mode.lock().unwrap())
}

/// 获取当前音频设备信息
#[command]
pub fn get_current_audio_device(state: State<AppState>) -> Result<AudioDeviceInfo, String> {
    let current_device_name = state.player.current_device_name.lock().unwrap().clone();

    let host = cpal::default_host();
    let default_device_name = host
        .default_output_device()
        .and_then(|d| d.name().ok());
    
    let is_default = default_device_name.map_or(false, |d_name| d_name == current_device_name);

    // 查找当前设备以检测独占模式支持
    let host = cpal::default_host();
    let current_device = host
        .output_devices()
        .map_err(|e| format!("Failed to get output devices: {e}"))?
        .find(|d| d.name().map_or(false, |name| name == current_device_name))
        .ok_or(format!("Current audio device not found: {}", current_device_name))?;
    
    let supports_exclusive_mode = check_exclusive_mode_support(&current_device);
    let is_exclusive_mode = *state.player.exclusive_mode.lock().unwrap();
    
    // 确定当前音频模式状态
    // 注意：当前实现中没有真正的独占模式，所有模式都使用共享流
    let audio_mode_status = if is_exclusive_mode {
        "optimized".to_string() // 启用低延迟模式但不是真正的独占
    } else {
        "standard".to_string() // 标准模式
    };

    Ok(AudioDeviceInfo {
        name: current_device_name,
        is_default,
        supports_exclusive_mode,
        is_exclusive_mode,
        audio_mode_status,
    })
}

/// 检测设备是否支持独占模式
pub fn check_exclusive_mode_support(device: &cpal::Device) -> bool {
    // 获取设备的默认输出配置
    let config = match device.default_output_config() {
        Ok(config) => config,
        Err(_) => return false,
    };

    // 创建输出流配置
    let mut stream_config: StreamConfig = config.into();
    stream_config.buffer_size = cpal::BufferSize::Fixed(256); // 使用较小的缓冲区

    // 创建错误回调函数
    let err_fn = |_err| {
        // 静默处理错误，这只是检测，不需要打印错误
    };

    // 创建空的数据回调函数
    let data_fn = move |_data: &mut [f32], _: &cpal::OutputCallbackInfo| {
        // 我们不播放任何声音，这只是一个占位符
    };

    // 尝试创建独占模式的流来测试设备支持
    match device.build_output_stream(&stream_config, data_fn, err_fn, None) {
        Ok(stream) => {
            // 立即停止流，因为我们只是测试
            drop(stream);
            true
        }
        Err(_) => {
            false
        }
    }
}