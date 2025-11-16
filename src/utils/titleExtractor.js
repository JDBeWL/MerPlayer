import { invoke } from '@tauri-apps/api/core'

/**
 * 歌曲标题提取工具类
 */
export class TitleExtractor {
  /**
   * 提取歌曲标题
   * @param {string} filePath - 音频文件路径
   * @param {Object} config - 标题提取配置
   * @returns {Promise<Object>} 包含标题信息的对象
   */
  static async extractTitle(filePath, config = {}) {
    try {
      const { preferMetadata = true, hideFileExtension = true, parseArtistTitle = true } = config
      
      let titleInfo = {
        fileName: '',
        title: '',
        artist: '',
        album: '',
        isFromMetadata: false
      }
      
      // 优先尝试从元数据获取信息
      if (preferMetadata) {
        try {
          const metadata = await invoke('get_track_metadata', { path: filePath })
          if (metadata && metadata.title) {
            titleInfo = {
              fileName: this.getFileName(filePath, hideFileExtension),
              title: metadata.title || '',
              artist: metadata.artist || '',
              album: metadata.album || '',
              isFromMetadata: true
            }
            
            // 如果从元数据成功获取信息，直接返回
            if (titleInfo.title) {
              return titleInfo
            }
          }
        } catch (error) {
          console.warn('Failed to get metadata for:', filePath, error)
        }
      }
      
      // 从文件名解析
      return this.parseFromFileName(filePath, config)
      
    } catch (error) {
      console.error('Error extracting title:', error)
      // 出错时返回基础文件名信息
      return {
        fileName: this.getFileName(filePath, config.hideFileExtension),
        title: this.getFileName(filePath, config.hideFileExtension),
        artist: '',
        album: '',
        isFromMetadata: false
      }
    }
  }

  /**
   * 从文件名解析标题信息
   * @param {string} filePath - 音频文件路径
   * @param {Object} config - 标题提取配置
   * @returns {Object} 包含标题信息的对象
   */
  static parseFromFileName(filePath, config = {}) {
    const { 
      separator = '-', 
      customSeparators = ['-', '_', '.', ' '], 
      hideFileExtension = true,
      parseArtistTitle = true 
    } = config
    
    const fileName = this.getFileName(filePath, hideFileExtension)
    
    let title = fileName
    let artist = ''
    
    if (parseArtistTitle) {
      // 使用所有可用的分隔符尝试解析艺术家和标题
      const separators = [...new Set([separator, ...customSeparators])]
      
      for (const sep of separators) {
        if (sep && fileName.includes(sep)) {
          const parts = fileName.split(sep)
          
          // 尝试不同的解析模式
          if (parts.length === 2) {
            // 模式: 艺术家 - 标题
            artist = parts[0].trim()
            title = parts[1].trim()
            break
          } else if (parts.length > 2) {
            // 尝试第一个分隔符分割
            const firstSepIndex = fileName.indexOf(sep)
            const lastSepIndex = fileName.lastIndexOf(sep)
            
            if (firstSepIndex !== lastSepIndex) {
              // 多分隔符情况，尝试多种解析策略
              artist = parts[0].trim()
              title = parts.slice(1).join(' ').trim()
            }
          }
        }
      }
    }
    
    // 如果解析出的标题为空，使用完整文件名
    if (!title.trim()) {
      title = fileName
    }
    
    return {
      fileName: fileName,
      title: title,
      artist: artist,
      album: '',
      isFromMetadata: false
    }
  }

  /**
   * 获取文件名（可选择是否包含扩展名）
   * @param {string} filePath - 文件路径
   * @param {boolean} hideExtension - 是否隐藏扩展名
   * @returns {string} 文件名
   */
  static getFileName(filePath, hideExtension = true) {
    const parts = filePath.split(/[/\\]/)
    let fileName = parts[parts.length - 1] || filePath
    
    if (hideExtension) {
      const lastDotIndex = fileName.lastIndexOf('.')
      if (lastDotIndex > 0) {
        fileName = fileName.substring(0, lastDotIndex)
      }
    }
    
    return fileName
  }

  /**
   * 清理标题中的多余空格和特殊字符
   * @param {string} title - 原始标题
   * @returns {string} 清理后的标题
   */
  static cleanTitle(title) {
    if (!title) return ''
    
    return title
      .trim()
      .replace(/\s+/g, ' ') // 替换多个空格为单个空格
      .replace(/^[\s\-_]+|[\s\-_]+$/g, '') // 去除开头和结尾的特殊字符
  }

  /**
   * 格式化播放列表名称
   * @param {string} folderPath - 文件夹路径
   * @param {string} format - 格式化字符串，支持 {folderName}
   * @returns {string} 格式化后的播放列表名称
   */
  static formatPlaylistName(folderPath, format = '{folderName}') {
    const parts = folderPath.split(/[/\\]/)
    const folderName = parts[parts.length - 1] || folderPath
    
    return format.replace('{folderName}', folderName)
  }

  /**
   * 判断字符串是否为有效的分隔符
   * @param {string} separator - 分隔符
   * @returns {boolean} 是否为有效分隔符
   */
  static isValidSeparator(separator) {
    return typeof separator === 'string' && separator.trim() !== ''
  }

  /**
   * 获取所有有效的分隔符
   * @param {Array} separators - 分隔符数组
   * @returns {Array} 有效的分隔符数组
   */
  static getValidSeparators(separators) {
    return separators.filter(sep => this.isValidSeparator(sep))
  }

  /**
   * 测试文件名解析效果
   * @param {string} fileName - 测试文件名
   * @param {Object} config - 标题提取配置
   * @returns {Object} 解析结果
   */
  static testParse(fileName, config = {}) {
    const testPath = `/test/${fileName}.mp3`
    return this.parseFromFileName(testPath, config)
  }
}