/**
 * 歌词解析器类，支持多种歌词格式
 */
import logger from './logger';

// 让出主线程的辅助函数
const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

export class LyricsParser {
  /**
   * 解析歌词文件（同步版本，用于简单场景）
   * @param {string} content - 歌词文件内容
   * @param {string} format - 歌词格式（lrc, ass, srt）
   * @returns {Array<{time: number, text: string}>} 解析后的歌词数组
   */
  static parse(content, format = 'auto') {
    if (!content || typeof content !== 'string') {
      return []
    }

    if (format === 'auto') {
      format = this.detectFormat(content)
    }

    switch (format.toLowerCase()) {
      case 'lrc':
        return this.parseLRC(content)
      case 'ass':
        return this.parseASS(content)
      case 'srt':
        return this.parseSRT(content)
      default:
        logger.warn(`Unsupported lyrics format: ${format}`)
        return []
    }
  }

  /**
   * 异步解析歌词文件（支持卡拉OK、翻译，分块处理避免阻塞主线程）
   * @param {string} content - 歌词文件内容
   * @param {string} format - 歌词格式（lrc, ass）
   * @returns {Promise<Array>} 解析后的歌词数组
   */
  static async parseAsync(content, format = 'auto') {
    if (!content || typeof content !== 'string') {
      return []
    }

    if (format === 'auto') {
      format = this.detectFormat(content)
    }

    switch (format.toLowerCase()) {
      case 'lrc':
        return this.parseLRCAsync(content)
      case 'ass':
        return this.parseASSAsync(content)
      default:
        return this.parse(content, format)
    }
  }

  /**
   * 自动检测歌词格式
   */
  static detectFormat(content) {
    if (content.includes('[Script Info]') || content.includes('[V4+ Styles]') || content.includes('[Events]')) {
      return 'ass'
    }
    if (/^\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}\s*\n/m.test(content)) {
      return 'srt'
    }
    return 'lrc'
  }

  /**
   * 异步解析 LRC 格式歌词（支持卡拉OK、翻译、分块处理）
   */
  static async parseLRCAsync(content) {
    const lines = content.split("\n");
    const pattern = /\[(\d{2}):(\d{2}):(\d{2})\]|\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;
    const resultMap = {};
    const CHUNK_SIZE = 100;
    
    for (let i = 0; i < lines.length; i++) {
      if (i > 0 && i % CHUNK_SIZE === 0) {
        await yieldToMain();
      }
      
      const line = lines[i];
      const timestamps = [];
      let match;
      while ((match = pattern.exec(line)) !== null) {
        let time;
        if (match[1] !== undefined) {
          time = parseInt(match[1]) * 60 + parseInt(match[2]) + parseInt(match[3]) / 100;
        } else {
          time = parseInt(match[4]) * 60 + parseInt(match[5]) + parseInt(match[6].padEnd(3, "0")) / 1000;
        }
        timestamps.push({ time, index: match.index });
      }
      if (timestamps.length < 1) continue;
      const text = line.replace(pattern, "").trim();
      if (!text) continue;
      const startTime = timestamps[0].time;
      resultMap[startTime] = resultMap[startTime] || { time: startTime, texts: [], karaoke: null };
      if (timestamps.length > 1) {
        resultMap[startTime].karaoke = {
          fullText: text,
          timings: timestamps.slice(1).map((s, idx) => ({ time: s.time, position: idx + 1 }))
        };
      }
      resultMap[startTime].texts.push(text);
    }
    return Object.values(resultMap).sort((a, b) => a.time - b.time);
  }

  /**
   * 异步解析 ASS 格式歌词（支持卡拉OK、翻译、分块处理）
   */
  static async parseASSAsync(content) {
    const lines = content.split('\n');
    const dialogues = [];
    const toSeconds = (t) => {
      const [h, m, s] = t.split(':');
      return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
    };
    const CHUNK_SIZE = 100;
    
    for (let i = 0; i < lines.length; i++) {
      if (i > 0 && i % CHUNK_SIZE === 0) {
        await yieldToMain();
      }
      
      const line = lines[i];
      if (!line.startsWith('Dialogue:')) continue;
      const parts = line.split(',');
      if (parts.length < 10) continue;
      const start = parts[1].trim();
      const end = parts[2].trim();
      const style = parts[3].trim();
      const text = parts.slice(9).join(',').trim();
      dialogues.push({ startTime: toSeconds(start), endTime: toSeconds(end), style, text });
    }
    
    const groupedMap = new Map();
    dialogues.forEach(d => {
      const key = d.startTime.toFixed(3) + '-' + d.endTime.toFixed(3);
      if (!groupedMap.has(key)) {
        groupedMap.set(key, { startTime: d.startTime, endTime: d.endTime, texts: { orig: '', ts: '' }, karaoke: null });
      }
      const group = groupedMap.get(key);
      if (d.style === 'orig') group.texts.orig = d.text;
      if (d.style === 'ts') group.texts.ts = d.text;
    });
    
    const result = [];
    groupedMap.forEach(group => {
      const parseKaraoke = (text) => {
        const karaokeTag = /{\\k[f]?(\d+)}([^{}]*)/g;
        let words = [];
        let accTime = group.startTime;
        let match;
        while ((match = karaokeTag.exec(text)) !== null) {
          const duration = parseInt(match[1]) * 0.01;
          words.push({ text: match[2], start: accTime, end: accTime + duration });
          accTime += duration;
        }
        return words;
      };
      const enWords = parseKaraoke(group.texts.orig);
      result.push({
        time: group.startTime,
        texts: [group.texts.orig.replace(/{.*?}/g, ''), group.texts.ts.replace(/{.*?}/g, '')],
        words: enWords,
        karaoke: enWords.length > 0
      });
    });
    return result.sort((a, b) => a.time - b.time);
  }

  /**
   * 解析 LRC 格式歌词（同步版本）
   */
  static parseLRC(content) {
    const lines = content.split('\n')
    const lyrics = []
    const timeRegex = /^\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\](.*)$/
    
    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine) continue
      
      const timeMatches = [...trimmedLine.matchAll(/\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g)]
      const textPart = trimmedLine.replace(/\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g, '').trim()
      
      if (timeMatches.length > 0 && textPart) {
        for (const match of timeMatches) {
          const minutes = parseInt(match[1])
          const seconds = parseInt(match[2])
          const milliseconds = match[3] ? parseInt(match[3].padEnd(3, '0').substring(0, 3)) : 0
          const time = minutes * 60 + seconds + milliseconds / 1000
          lyrics.push({ time, text: textPart })
        }
      } else {
        const singleMatch = trimmedLine.match(timeRegex)
        if (singleMatch) {
          const minutes = parseInt(singleMatch[1])
          const seconds = parseInt(singleMatch[2])
          const milliseconds = singleMatch[3] ? parseInt(singleMatch[3].padEnd(3, '0').substring(0, 3)) : 0
          const time = minutes * 60 + seconds + milliseconds / 1000
          const text = singleMatch[4].trim()
          if (text) {
            lyrics.push({ time, text })
          }
        }
      }
    }
    
    lyrics.sort((a, b) => a.time - b.time)
    return lyrics
  }

  /**
   * 解析 ASS 格式歌词（同步版本）
   */
  static parseASS(content) {
    const lines = content.split('\n')
    const lyrics = []
    let inEvents = false
    let formatFields = []
    
    for (const line of lines) {
      const trimmedLine = line.trim()
      
      if (trimmedLine === '[Events]') {
        inEvents = true
        continue
      }
      
      if (inEvents && trimmedLine.startsWith('[')) {
        inEvents = false
        continue
      }
      
      if (inEvents && trimmedLine.startsWith('Format:')) {
        formatFields = trimmedLine.substring(7).split(',').map(field => field.trim())
        continue
      }
      
      if (inEvents && trimmedLine.startsWith('Dialogue:')) {
        const parts = trimmedLine.substring(9).split(',')
        
        if (parts.length >= formatFields.length) {
          const startIndex = formatFields.indexOf('Start')
          const textIndex = formatFields.indexOf('Text')
          
          if (startIndex !== -1 && textIndex !== -1) {
            const startTime = this.parseASSTime(parts[startIndex])
            const text = parts.slice(textIndex).join(',').replace(/{[^}]*}/g, '').trim()
            
            if (text && startTime !== null) {
              lyrics.push({ time: startTime, text })
            }
          }
        }
      }
    }
    
    lyrics.sort((a, b) => a.time - b.time)
    return lyrics
  }

  /**
   * 解析 SRT 格式歌词
   */
  static parseSRT(content) {
    const blocks = content.trim().split(/\n\s*\n/)
    const lyrics = []
    const timeRegex = /(\d{1,2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2}),(\d{3})/
    
    for (const block of blocks) {
      const lines = block.trim().split('\n')
      if (lines.length < 2) continue
      
      const timeMatch = lines[1].match(timeRegex)
      if (!timeMatch) continue
      
      const startTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + 
                        parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000
      const text = lines.slice(2).join('\n').trim()
      
      if (text) {
        lyrics.push({ time: startTime, text })
      }
    }
    
    lyrics.sort((a, b) => a.time - b.time)
    return lyrics
  }

  /**
   * 解析 ASS 时间格式
   */
  static parseASSTime(timeStr) {
    const match = timeStr.match(/^(\d+):(\d{2}):(\d{2})\.(\d{2})$/)
    if (match) {
      return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + 
             parseInt(match[3]) + parseInt(match[4]) / 100
    }
    return null
  }

  /**
   * 将歌词数组转换为指定格式的字符串
   */
  static stringify(lyrics, format = 'lrc') {
    if (!lyrics || !Array.isArray(lyrics)) {
      return ''
    }

    switch (format.toLowerCase()) {
      case 'lrc':
        return this.stringifyLRC(lyrics)
      case 'ass':
        return this.stringifyASS(lyrics)
      case 'srt':
        return this.stringifySRT(lyrics)
      default:
        logger.warn(`Unsupported export format: ${format}`)
        return ''
    }
  }

  static stringifyLRC(lyrics) {
    return lyrics.map(item => {
      const minutes = Math.floor(item.time / 60)
      const seconds = Math.floor(item.time % 60)
      const milliseconds = Math.floor((item.time % 1) * 100)
      const timeTag = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}]`
      return `${timeTag}${item.text}`
    }).join('\n')
  }

  static stringifyASS(lyrics) {
    let ass = `[Script Info]
Title: Lyrics
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
    return ass + lyrics.map((item, index) => {
      const formatTime = (t) => {
        const h = Math.floor(t / 3600)
        const m = Math.floor((t % 3600) / 60)
        const s = Math.floor(t % 60)
        const cs = Math.floor((t % 1) * 100)
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`
      }
      const nextTime = index < lyrics.length - 1 ? lyrics[index + 1].time : item.time + 5
      return `Dialogue: 0,${formatTime(item.time)},${formatTime(nextTime)},Default,,0,0,0,,${item.text}`
    }).join('\n')
  }

  static stringifySRT(lyrics) {
    return lyrics.map((item, index) => {
      const formatTime = (t) => {
        const h = Math.floor(t / 3600)
        const m = Math.floor((t % 3600) / 60)
        const s = Math.floor(t % 60)
        const ms = Math.floor((t % 1) * 1000)
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`
      }
      const nextTime = index < lyrics.length - 1 ? lyrics[index + 1].time : item.time + 5
      return `${index + 1}\n${formatTime(item.time)} --> ${formatTime(nextTime)}\n${item.text}\n`
    }).join('\n')
  }
}

export default LyricsParser
