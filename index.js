import {
  eventSource,
  event_types,
  extension_prompt_roles,
  extension_prompt_types,
  getCurrentChatId,
  getRequestHeaders,
  is_send_press,
  saveSettingsDebounced,
  setExtensionPrompt,
  substituteParams,
  substituteParamsExtended,
} from '../../../../script.js';
import { getDataBankAttachments, getDataBankAttachmentsForSource, getFileAttachment } from '../../../chats.js';
import { debounce_timeout } from '../../../constants.js';
import {
  ModuleWorkerWrapper,
  extension_settings,
  getContext,
  renderExtensionTemplateAsync,
} from '../../../extensions.js';
import { POPUP_RESULT, POPUP_TYPE, callGenericPopup } from '../../../popup.js';
import { registerDebugFunction } from '../../../power-user.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { textgen_types, textgenerationwebui_settings } from '../../../textgen-settings.js';
import {
  debounce,
  getStringHash,
  onlyUnique,
  splitRecursive,
  trimToEndSentence,
  trimToStartSentence,
  waitUntilCondition,
} from '../../../utils.js';
import { getSortedEntries } from '../../../world-info.js';

/**
 * @typedef {object} HashedMessage
 * @property {string} text - The hashed message text
 * @property {number} hash - The hash used as the vector key
 * @property {number} index - The index of the message in the chat
 */

/**
 * @typedef {object} VectorItem
 * @property {string} type - Type of the item ('chat', 'file', 'world_info')
 * @property {string} text - The text content
 * @property {Object} metadata - Additional metadata for the item
 * @property {boolean} selected - Whether the item is selected for vectorization
 */

const MODULE_NAME = 'vectors-enhanced';

export const EXTENSION_PROMPT_TAG = '3_vectors';

const settings = {
  // Master switch - controls all plugin functionality
  master_enabled: true, // 主开关：控制整个插件的所有功能，默认启用

  // Vector source settings
  source: 'transformers',
  local_model: '', // 本地transformers模型名称
  vllm_model: '',
  vllm_url: '',
  ollama_model: 'rjmalagon/gte-qwen2-1.5b-instruct-embed-f16',
  ollama_url: '', // ollama API地址
  ollama_keep: false,

  // General vectorization settings
  auto_vectorize: true,
  chunk_size: 1000,
  overlap_percent: 10,
  score_threshold: 0.25,
  force_chunk_delimiter: '',
  lightweight_storage: false, // 大内容轻量化存储模式

  // Query settings
  enabled: true, // 是否启用向量查询
  query_messages: 3, // 查询使用的最近消息数
  max_results: 10, // 返回的最大结果数
  show_query_notification: false, // 是否显示查询结果通知
  detailed_notification: false, // 是否显示详细通知（来源分布）

  // Injection settings
  template: '<must_know>以下是从相关背景知识库，包含重要的上下文、设定或细节：\n{{text}}</must_know>',
  position: extension_prompt_types.IN_PROMPT,
  depth: 2,
  depth_role: extension_prompt_roles.SYSTEM,
  include_wi: false,

  // Content tags
  content_tags: {
    chat: 'past_chat',
    file: 'databank',
    world_info: 'world_part',
  },

  // Content selection
  selected_content: {
    chat: {
      enabled: false,
      range: { start: 0, end: -1 },
      types: { user: true, assistant: true },
      tags: '', // comma-separated tag names to extract
      include_hidden: false, // 是否包含隐藏消息
    },
    files: { enabled: false, selected: [] },
    world_info: { enabled: false, selected: {} }, // { worldId: [entryIds] }
  },

  // Content filtering
  content_blacklist: [], // Array of keywords to filter out content

  // Vector tasks management
  vector_tasks: {}, // { chatId: [{ taskId, name, timestamp, settings, enabled }] }
};

const moduleWorker = new ModuleWorkerWrapper(synchronizeChat);
const cachedVectors = new Map(); // Cache for vectorized content
let syncBlocked = false;

// 防重复通知机制
let lastNotificationTime = 0;
const NOTIFICATION_COOLDOWN = 5000; // 5秒冷却时间

// 向量化状态管理
let isVectorizing = false;
let vectorizationAbortController = null;

/**
 * Generates a unique task ID
 * @returns {string} Unique task ID
 */
function generateTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Gets all vector tasks for a chat
 * @param {string} chatId Chat ID
 * @returns {Array} Array of tasks
 */
function getChatTasks(chatId) {
  if (!settings.vector_tasks[chatId]) {
    settings.vector_tasks[chatId] = [];
  }
  return settings.vector_tasks[chatId];
}

/**
 * Adds a new vector task
 * @param {string} chatId Chat ID
 * @param {object} task Task object
 */
function addVectorTask(chatId, task) {
  const tasks = getChatTasks(chatId);
  tasks.push(task);
  settings.vector_tasks[chatId] = tasks;
  
  // 调试：确认任务被正确添加
  console.debug(`Vectors: 添加任务到 ${chatId}:`, task);
  console.debug(`Vectors: 当前任务列表:`, tasks);
  
  Object.assign(extension_settings.vectors_enhanced, settings);
  saveSettingsDebounced();
  
  // 调试：确认设置被正确保存
  console.debug(`Vectors: 保存后的扩展设置:`, extension_settings.vectors_enhanced.vector_tasks[chatId]);
}

/**
 * Removes a vector task
 * @param {string} chatId Chat ID
 * @param {string} taskId Task ID to remove
 */
async function removeVectorTask(chatId, taskId) {
  const tasks = getChatTasks(chatId);
  const index = tasks.findIndex(t => t.taskId === taskId);
  if (index !== -1) {
    // Delete the vector collection
    await purgeVectorIndex(`${chatId}_${taskId}`);
    // Remove from tasks list
    tasks.splice(index, 1);
    settings.vector_tasks[chatId] = tasks;
    Object.assign(extension_settings.vectors_enhanced, settings);
    saveSettingsDebounced();
  }
}

/**
 * Renames a vector task
 * @param {string} chatId Chat ID
 * @param {string} taskId Task ID to rename
 * @param {string} currentName Current task name
 */
async function renameVectorTask(chatId, taskId, currentName) {
  const newName = await callGenericPopup(
    '请输入新的任务名称：',
    POPUP_TYPE.INPUT,
    currentName,
    {
      okButton: '确认',
      cancelButton: '取消',
    }
  );

  if (newName && newName.trim() && newName.trim() !== currentName) {
    const tasks = getChatTasks(chatId);
    const taskIndex = tasks.findIndex(t => t.taskId === taskId);
    
    if (taskIndex !== -1) {
      tasks[taskIndex].name = newName.trim();
      settings.vector_tasks[chatId] = tasks;
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
      
      // Refresh the task list UI
      await updateTaskList();
      toastr.success('任务已重命名');
    }
  }
}

/**
 * Gets the Collection ID for a file embedded in the chat.
 * @param {string} fileUrl URL of the file
 * @returns {string} Collection ID
 */
function getFileCollectionId(fileUrl) {
  return `file_${getHashValue(fileUrl)}`;
}

/**
 * Gets the chunk delimiters for splitting text.
 * @returns {string[]} Array of chunk delimiters
 */
function getChunkDelimiters() {
  const delimiters = ['\n\n', '\n', ' ', ''];
  if (settings.force_chunk_delimiter) {
    delimiters.unshift(settings.force_chunk_delimiter);
  }
  return delimiters;
}

/**
 * Splits text into chunks with optional overlap.
 * @param {string} text Text to split
 * @param {number} chunkSize Size of each chunk
 * @param {number} overlapPercent Overlap percentage
 * @returns {string[]} Array of text chunks
 */
function splitTextIntoChunks(text, chunkSize, overlapPercent) {
  const delimiters = getChunkDelimiters();
  const overlapSize = Math.round((chunkSize * overlapPercent) / 100);
  const adjustedChunkSize = overlapSize > 0 ? chunkSize - overlapSize : chunkSize;

  const chunks = splitRecursive(text, adjustedChunkSize, delimiters);

  if (overlapSize > 0) {
    return chunks.map((chunk, index) => overlapChunks(chunk, index, chunks, overlapSize));
  }

  return chunks;
}

/**
 * Modifies text chunks to include overlap with adjacent chunks.
 * @param {string} chunk Current item
 * @param {number} index Current index
 * @param {string[]} chunks List of chunks
 * @param {number} overlapSize Size of the overlap
 * @returns {string} Overlapped chunks
 */
function overlapChunks(chunk, index, chunks, overlapSize) {
  const halfOverlap = Math.floor(overlapSize / 2);
  const nextChunk = chunks[index + 1];
  const prevChunk = chunks[index - 1];

  const nextOverlap = trimToEndSentence(nextChunk?.substring(0, halfOverlap)) || '';
  const prevOverlap = trimToStartSentence(prevChunk?.substring(prevChunk.length - halfOverlap)) || '';
  const overlappedChunk = [prevOverlap, chunk, nextOverlap].filter(x => x).join(' ');

  return overlappedChunk;
}

/**
 * Parses tag configuration with exclusion syntax
 * @param {string} tagConfig Tag configuration string
 * @returns {object} Object with mainTag and excludeTags
 */
function parseTagWithExclusions(tagConfig) {
  if (!tagConfig.includes(' - ')) {
    return { mainTag: tagConfig, excludeTags: [] };
  }

  const [mainTag, excludePart] = tagConfig.split(' - ');
  const excludeTags = excludePart
    .split(',')
    .map(t => t.trim())
    .filter(t => t)
    .map(tag => {
      // 检测正则表达式格式：/pattern/flags
      const regexMatch = tag.match(/^\/(.+)\/([gimuy]*)$/);
      if (regexMatch) {
        return {
          type: 'regex',
          pattern: regexMatch[1],
          flags: regexMatch[2] || 'gi',
        };
      }
      // 传统标签格式
      return {
        type: 'tag',
        name: tag,
      };
    });

  return {
    mainTag: mainTag.trim(),
    excludeTags: excludeTags,
  };
}

/**
 * Removes excluded tags from content
 * @param {string} content Content to process
 * @param {string[]} excludeTags Tags to exclude
 * @returns {string} Content with excluded tags removed
 */
function removeExcludedTags(content, excludeTags) {
  let result = content;

  for (const excludeItem of excludeTags) {
    try {
      if (excludeItem.type === 'regex') {
        // 正则表达式排除
        const regex = new RegExp(excludeItem.pattern, excludeItem.flags);
        result = result.replace(regex, '');
      } else {
        // 传统标签排除
        const tagName = excludeItem.name;
        if (tagName.includes('<') && tagName.includes('>')) {
          const tagMatch = tagName.match(/<(\w+)(?:\s[^>]*)?>/);
          if (tagMatch) {
            const name = tagMatch[1];
            const regex = new RegExp(`<${name}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${name}>`, 'gi');
            result = result.replace(regex, '');
          }
        } else {
          const regex = new RegExp(`<${tagName}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tagName}>`, 'gi');
          result = result.replace(regex, '');
        }
      }
    } catch (error) {
      console.warn(`标签排除错误: ${JSON.stringify(excludeItem)}`, error);
    }
  }

  return result
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\n\s+/g, '\n')
    .replace(/\s+\n/g, '\n')
    .trim();
}

/**
 * Checks if content should be skipped based on blacklist
 * @param {string} text Content to check
 * @param {string[]} blacklist Array of blacklist keywords
 * @returns {boolean} True if content should be skipped
 */
function shouldSkipContent(text, blacklist) {
  if (!blacklist || blacklist.length === 0) return false;

  const lowerText = text.toLowerCase();
  return blacklist.some(keyword => {
    const lowerKeyword = keyword.trim().toLowerCase();
    return lowerKeyword && lowerText.includes(lowerKeyword);
  });
}

/**
 * Extracts content from specific tags in a message
 * @param {string} text Message text
 * @param {string[]} tags Tags to extract (supports exclusion syntax)
 * @returns {string} Extracted content or original text if no tags specified
 */
function extractTagContent(text, tags) {
  if (!tags || tags.length === 0) return text;

  let extractedContent = [];
  const blacklist = settings.content_blacklist || [];

  for (const tagConfig of tags) {
    try {
      const { mainTag, excludeTags } = parseTagWithExclusions(tagConfig);

      // 第一步：提取主标签内容
      let mainContent = [];

      if (mainTag.includes(',')) {
        // 复杂标签配置：<details><summary>摘要</summary>,</details>
        const complexContent = extractComplexTag(text, mainTag);
        mainContent.push(...complexContent);
      } else if (mainTag.includes('<') && mainTag.includes('>')) {
        // HTML格式的简单标签：<content></content>
        const simpleContent = extractHtmlFormatTag(text, mainTag);
        mainContent.push(...simpleContent);
      } else {
        // 原始简单标签：content, thinking
        const simpleContent = extractSimpleTag(text, mainTag);
        mainContent.push(...simpleContent);
      }

      // 第二步：嵌套标签排除
      if (excludeTags.length > 0) {
        mainContent = mainContent
          .map(content => removeExcludedTags(content, excludeTags))
          .filter(content => content.trim()); // 移除空内容
      }

      // 第三步：黑名单过滤
      mainContent = mainContent.filter(content => {
        if (shouldSkipContent(content, blacklist)) {
          console.debug(`黑名单过滤跳过内容: ${content.substring(0, 50)}...`);
          return false;
        }
        return true;
      });

      extractedContent.push(...mainContent);
    } catch (error) {
      console.warn(`标签配置错误: ${tagConfig}`, error);
      // 继续处理其他标签，不因为一个错误而中断
    }
  }

  return extractedContent.length > 0 ? extractedContent.join('\n\n') : text;
}

/**
 * Extracts content using complex tag configuration
 * @param {string} text Text to search in
 * @param {string} tag Complex tag configuration like "<details><summary>摘要</summary>,</details>"
 * @returns {string[]} Array of extracted content
 */
function extractComplexTag(text, tag) {
  const parts = tag.split(',');
  if (parts.length !== 2) {
    throw new Error(`复杂标签配置格式错误，应该包含一个逗号: ${tag}`);
  }

  const startPattern = parts[0].trim(); // "<details><summary>摘要</summary>"
  const endPattern = parts[1].trim(); // "</details>"

  // 提取结束标签名
  const endTagMatch = endPattern.match(/<\/(\w+)>/);
  if (!endTagMatch) {
    throw new Error(`无法解析结束标签: ${endPattern}`);
  }
  const endTagName = endTagMatch[1]; // "details"

  // 构建匹配正则，提取中间内容
  const regex = new RegExp(`${escapeRegex(startPattern)}([\\s\\S]*?)<\\/${endTagName}>`, 'gi');

  const extractedContent = [];
  const matches = [...text.matchAll(regex)];

  matches.forEach(match => {
    if (match[1]) {
      // 提取中间的所有内容，包括HTML标签
      extractedContent.push(match[1].trim());
    }
  });

  return extractedContent;
}

/**
 * Extracts content using HTML format tag
 * @param {string} text Text to search in
 * @param {string} tag HTML format tag like "<content></content>"
 * @returns {string[]} Array of extracted content
 */
function extractHtmlFormatTag(text, tag) {
  // 提取标签名，处理可能的属性
  const tagMatch = tag.match(/<(\w+)(?:\s[^>]*)?>/);
  if (!tagMatch) {
    throw new Error(`无法解析HTML格式标签: ${tag}`);
  }
  const tagName = tagMatch[1];

  const extractedContent = [];
  const regex = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  const matches = [...text.matchAll(regex)];

  matches.forEach(match => {
    if (match[1]) {
      extractedContent.push(match[1].trim());
    }
  });

  // 检查是否有未闭合的标签
  const openTags = (text.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>`, 'gi')) || []).length;
  const closeTags = (text.match(new RegExp(`<\\/${tagName}>`, 'gi')) || []).length;

  if (openTags > closeTags) {
    console.warn(`警告: 发现 ${openTags - closeTags} 个未闭合的 <${tagName}> 标签`);
  }

  return extractedContent;
}

/**
 * Extracts content using simple tag name
 * @param {string} text Text to search in
 * @param {string} tag Simple tag name like "content" or "thinking"
 * @returns {string[]} Array of extracted content
 */
function extractSimpleTag(text, tag) {
  const extractedContent = [];
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const matches = [...text.matchAll(regex)];

  matches.forEach(match => {
    if (match[1]) {
      extractedContent.push(match[1].trim());
    }
  });

  // 检查是否有未闭合的标签
  const openTags = (text.match(new RegExp(`<${tag}>`, 'gi')) || []).length;
  const closeTags = (text.match(new RegExp(`<\\/${tag}>`, 'gi')) || []).length;

  if (openTags > closeTags) {
    console.warn(`警告: 发现 ${openTags - closeTags} 个未闭合的 <${tag}> 标签`);
  }

  return extractedContent;
}

/**
 * Escapes special regex characters in a string
 * @param {string} str String to escape
 * @returns {string} Escaped string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Gets all vectorizable content based on provided settings
 * @param {object} contentSettings Optional content settings, defaults to global settings
 * @returns {Promise<VectorItem[]>} Array of vector items
 */
async function getVectorizableContent(contentSettings = null) {
  const items = [];
  const context = getContext();
  const selectedContent = contentSettings || settings.selected_content;

  // Chat messages
  if (selectedContent.chat.enabled && context.chat) {
    const chatSettings = selectedContent.chat;
    const start = chatSettings.range?.start || 0;
    const end = chatSettings.range?.end || -1;
    const types = chatSettings.types || { user: true, assistant: true };
    const tags = chatSettings.tags || '';
    const blacklist = settings.content_blacklist || [];

    const messages = context.chat.slice(start, end === -1 ? undefined : end);
    const tagList = tags
      ? tags
          .split(',')
          .map(t => t.trim())
          .filter(t => t)
      : [];

    messages.forEach((msg, idx) => {
      // 处理隐藏消息
      if (msg.is_system === true && !chatSettings.include_hidden) {
        return; // 跳过隐藏的消息（除非明确要包含）
      }

      if (!types.user && msg.is_user) return;
      if (!types.assistant && !msg.is_user) return;

      const extractedText = extractTagContent(substituteParams(msg.mes), tagList);

      items.push({
        type: 'chat',
        text: extractedText,
        metadata: {
          index: start + idx,
          is_user: msg.is_user,
          name: msg.name,
          is_hidden: msg.is_system === true,
        },
        selected: true,
      });
    });
  }

  // Files
  if (selectedContent.files.enabled) {
    // 获取所有文件源，使用Map去重（以URL为键）
    const fileMap = new Map();
    
    // 逐个添加不同来源的文件，自动去重
    try {
      getDataBankAttachments().forEach(file => {
        if (file && file.url) fileMap.set(file.url, file);
      });
      
      getDataBankAttachmentsForSource('global').forEach(file => {
        if (file && file.url) fileMap.set(file.url, file);
      });
      
      getDataBankAttachmentsForSource('character').forEach(file => {
        if (file && file.url) fileMap.set(file.url, file);
      });
      
      getDataBankAttachmentsForSource('chat').forEach(file => {
        if (file && file.url) fileMap.set(file.url, file);
      });
      
      context.chat.filter(x => x.extra?.file).forEach(msg => {
        const file = msg.extra.file;
        if (file && file.url) fileMap.set(file.url, file);
      });
    } catch (error) {
      console.error('Vectors: Error getting files:', error);
    }
    
    const allFiles = Array.from(fileMap.values());
    console.debug(`Vectors: Total unique files found: ${allFiles.length}`);
    console.debug(`Vectors: Selected files in settings: ${selectedContent.files.selected.length}`, selectedContent.files.selected);

    let processedFileCount = 0;
    for (const file of allFiles) {
      if (!selectedContent.files.selected.includes(file.url)) continue;

      try {
        const text = await getFileAttachment(file.url);
        if (text && text.trim()) {
          items.push({
            type: 'file',
            text: text,
            metadata: {
              name: file.name,
              url: file.url,
              size: file.size,
            },
            selected: true,
          });
          processedFileCount++;
          console.debug(`Vectors: Successfully processed file: ${file.name}`);
        } else {
          console.warn(`Vectors: File ${file.name} is empty or failed to read`);
        }
      } catch (error) {
        console.error(`Vectors: Error processing file ${file.name}:`, error);
        // 也在用户界面显示文件处理失败的信息
        toastr.warning(`文件 "${file.name}" 处理失败: ${error.message}`);
      }
    }
    
    console.debug(`Vectors: Actually processed ${processedFileCount} files out of ${selectedContent.files.selected.length} selected`);
  }

  // World Info
  if (selectedContent.world_info.enabled) {
    const entries = await getSortedEntries();
    
    // 调试：显示实际选择的世界信息
    console.debug('Vectors: Selected world info:', selectedContent.world_info.selected);
    const totalSelected = Object.values(selectedContent.world_info.selected).flat().length;
    console.debug(`Vectors: Total selected world info entries: ${totalSelected}`);
    
    let processedWICount = 0;

    for (const entry of entries) {
      if (!entry.world || !entry.content || entry.disable) continue;

      const selectedEntries = selectedContent.world_info.selected[entry.world] || [];
      if (!selectedEntries.includes(entry.uid)) continue;

      items.push({
        type: 'world_info',
        text: entry.content,
        metadata: {
          world: entry.world,
          uid: entry.uid,
          key: entry.key.join(', '),
          comment: entry.comment,
        },
        selected: true,
      });
      
      processedWICount++;
      console.debug(`Vectors: Successfully processed world info entry: ${entry.comment || entry.uid} from world ${entry.world}`);
    }
    
    console.debug(`Vectors: Actually processed ${processedWICount} world info entries out of ${totalSelected} selected`);
  }

  // 最终调试信息
  const finalCounts = {
    chat: items.filter(item => item.type === 'chat').length,
    file: items.filter(item => item.type === 'file').length,
    world_info: items.filter(item => item.type === 'world_info').length,
    total: items.length
  };
  
  console.debug('Vectors: Final getVectorizableContent result:', {
    finalCounts,
    settings: {
      chat_enabled: selectedContent.chat.enabled,
      files_enabled: selectedContent.files.enabled,
      files_selected_count: selectedContent.files?.selected?.length || 0,
      wi_enabled: selectedContent.world_info.enabled,
      wi_selected_count: Object.values(selectedContent.world_info?.selected || {}).flat().length
    }
  });

  return items;
}

/**
 * Updates progress display
 * @param {number} current Current progress
 * @param {number} total Total items
 * @param {string} message Progress message
 */
function updateProgress(current, total, message) {
  const percent = Math.round((current / total) * 100);
  $('#vectors_enhanced_progress').show();
  $('#vectors_enhanced_progress .progress-bar-inner').css('width', `${percent}%`);
  $('#vectors_enhanced_progress .progress-text').text(`${message} (${current}/${total})`);
}

/**
 * Hides progress display
 */
function hideProgress() {
  $('#vectors_enhanced_progress').hide();
  $('#vectors_enhanced_progress .progress-bar-inner').css('width', '0%');
  $('#vectors_enhanced_progress .progress-text').text('准备中...');
}

/**
 * Generates a task name based on actual processed items
 * @param {object} contentSettings The actual content settings being processed
 * @param {Array} actualItems Array of actual items that were processed
 * @returns {Promise<string>} Task name
 */
async function generateTaskName(contentSettings, actualItems) {
  const parts = [];
  
  console.debug('Vectors: generateTaskName input:', {
    contentSettings,
    actualItemsCount: actualItems.length,
    actualItems: actualItems.map(item => ({ type: item.type, metadata: item.metadata }))
  });

  // Count actual items by type
  const itemCounts = {
    chat: 0,
    file: 0,
    world_info: 0
  };
  
  actualItems.forEach(item => {
    if (itemCounts.hasOwnProperty(item.type)) {
      itemCounts[item.type]++;
    }
  });
  
  console.debug('Vectors: Actual item counts:', itemCounts);

  // Chat range - use newRanges if available for accurate naming
  if (contentSettings.chat && contentSettings.chat.enabled && itemCounts.chat > 0) {
    if (contentSettings.chat.newRanges && contentSettings.chat.newRanges.length > 0) {
      // Use the actual new ranges for naming
      const rangeStrings = contentSettings.chat.newRanges.map(range => {
        const start = range.start;
        const end = range.end;
        if (end === -1) {
          return `消息 #${start} 到最后`;
        } else {
          return `消息 #${start}-${end}`;
        }
      });
      
      if (rangeStrings.length === 1) {
        parts.push(rangeStrings[0]);
      } else {
        // Multiple ranges - format them nicely
        parts.push(rangeStrings.join(', '));
      }
      console.debug('Vectors: Added chat part (multi-range):', parts[parts.length - 1]);
    } else {
      // Fallback to single range
      const start = contentSettings.chat.range?.start || 0;
      const end = contentSettings.chat.range?.end || -1;
      if (end === -1) {
        parts.push(`消息 #${start} 到最后`);
      } else {
        parts.push(`消息 #${start}-${end}`);
      }
      console.debug('Vectors: Added chat part (single range):', parts[parts.length - 1]);
    }
  }

  // Files - use actual file count
  if (contentSettings.files && contentSettings.files.enabled && itemCounts.file > 0) {
    parts.push(`${itemCounts.file} 个文件`);
    console.debug('Vectors: Added file part (actual count):', parts[parts.length - 1]);
  }

  // World info - use actual world info count
  if (contentSettings.world_info && contentSettings.world_info.enabled && itemCounts.world_info > 0) {
    parts.push(`${itemCounts.world_info} 条世界信息`);
    console.debug('Vectors: Added world info part (actual count):', parts[parts.length - 1]);
  }

  // If no specific content selected, use generic name
  if (parts.length === 0) {
    parts.push(`${actualItems.length} 个项目`);
    console.debug('Vectors: Added generic part:', parts[parts.length - 1]);
  }

  // Add timestamp
  const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const finalName = `${parts.join(', ')} (${time})`;
  console.debug('Vectors: Final task name:', finalName);
  return finalName;
}

/**
 * Updates the task list UI
 */
async function updateTaskList() {
  const chatId = getCurrentChatId();
  if (!chatId) return;

  const tasks = getChatTasks(chatId);
  const taskList = $('#vectors_enhanced_task_list');
  taskList.empty();

  if (tasks.length === 0) {
    taskList.append('<div class="text-muted">没有向量化任务</div>');
    return;
  }

  tasks.forEach((task, index) => {
    const taskDiv = $('<div class="vector-enhanced-task-item"></div>');

    const incrementalBadge = task.isIncremental ? '<span style="background: var(--SmartThemeQuoteColor); color: white; padding: 2px 6px; border-radius: 3px; font-size: 0.8em; margin-left: 0.5rem;">增量</span>' : '';
    
    const checkbox = $(`
            <label class="checkbox_label flex-container alignItemsCenter">
                <input type="checkbox" ${task.enabled ? 'checked' : ''} />
                <span class="flex1">
                    <strong>${task.name}</strong>${incrementalBadge}
                    <small class="text-muted"> - ${new Date(task.timestamp).toLocaleString('zh-CN')}</small>
                </span>
            </label>
        `);

    checkbox.find('input').on('change', function () {
      task.enabled = this.checked;
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

    const renameBtn = $(`<button class="menu_button menu_button_icon" title="重命名此任务">
            <i class="fa-solid fa-edit"></i>
        </button>`);

    renameBtn.on('click', async () => {
      await renameVectorTask(chatId, task.taskId, task.name);
    });

    const deleteBtn = $(`<button class="menu_button menu_button_icon" title="删除此任务">
            <i class="fa-solid fa-trash"></i>
        </button>`);

    deleteBtn.on('click', async () => {
      const confirm = await callGenericPopup('确定要删除这个向量化任务吗？', POPUP_TYPE.CONFIRM);
      if (confirm === POPUP_RESULT.AFFIRMATIVE) {
        await removeVectorTask(chatId, task.taskId);
        await updateTaskList();
        toastr.success('任务已删除');
      }
    });

    taskDiv.append(checkbox);
    taskDiv.append(renameBtn);
    taskDiv.append(deleteBtn);
    taskList.append(taskDiv);
  });
}

/**
 * Checks for existing tasks that overlap with current selection
 * @param {string} chatId Chat ID
 * @param {object} currentSettings Current content selection settings
 * @returns {object} Analysis result with conflicts and new content
 */
function analyzeTaskOverlap(chatId, currentSettings) {
  const existingTasks = getChatTasks(chatId).filter(t => t.enabled);
  const conflicts = [];
  const newContentSources = [];
  
  console.debug('Vectors: Starting overlap analysis:', {
    chatId,
    existingTaskCount: existingTasks.length,
    existingTasks: existingTasks.map(t => ({ name: t.name, taskId: t.taskId })),
    currentSettings: {
      chat: currentSettings.chat.enabled,
      files: currentSettings.files.enabled ? currentSettings.files.selected.length : 0,
      world_info: currentSettings.world_info.enabled ? Object.values(currentSettings.world_info.selected).flat().length : 0
    }
  });
  
  // Check chat message overlap
  if (currentSettings.chat.enabled) {
    const currentStart = currentSettings.chat.range?.start || 0;
    const currentEnd = currentSettings.chat.range?.end || -1;
    const currentTags = currentSettings.chat.tags || '';
    const currentTypes = currentSettings.chat.types || { user: true, assistant: true };
    const currentHidden = currentSettings.chat.include_hidden || false;
    
    let hasCompleteMatch = false;
    let hasPartialOverlap = false;
    
    for (const task of existingTasks) {
      const taskChat = task.settings?.chat;
      if (taskChat?.enabled) {
        const taskStart = taskChat.range?.start || 0;
        const taskEnd = taskChat.range?.end || -1;
        const taskTags = taskChat.tags || '';
        const taskTypes = taskChat.types || { user: true, assistant: true };
        const taskHidden = taskChat.include_hidden || false;
        
        // Check if settings are identical
        const sameSettings = (
          taskTags === currentTags &&
          JSON.stringify(taskTypes) === JSON.stringify(currentTypes) &&
          taskHidden === currentHidden
        );
        
        if (sameSettings) {
          // Check for exact match
          const isExactMatch = (taskStart === currentStart && taskEnd === currentEnd);
          
          // Check if current range is completely contained in existing task
          const isContained = (
            taskStart <= currentStart &&
            (taskEnd === -1 || (currentEnd !== -1 && currentEnd <= taskEnd))
          );
          
          // Check for any overlap (more precise logic)
          const hasOverlap = (() => {
            // Handle -1 (end) cases
            const actualCurrentEnd = currentEnd === -1 ? Infinity : currentEnd;
            const actualTaskEnd = taskEnd === -1 ? Infinity : taskEnd;
            
            // Ranges overlap if they intersect
            return (
              currentStart <= actualTaskEnd && 
              taskStart <= actualCurrentEnd
            );
          })();
          
          if (isExactMatch || isContained) {
            hasCompleteMatch = true;
            conflicts.push({
              type: 'chat_duplicate',
              taskName: task.name,
              taskRange: { start: taskStart, end: taskEnd },
              message: `楼层 #${currentStart}-#${currentEnd === -1 ? '最后' : currentEnd} 已在任务"${task.name}"中向量化`
            });
          } else if (hasOverlap) {
            hasPartialOverlap = true;
            conflicts.push({
              type: 'chat_partial',
              taskName: task.name,
              taskRange: { start: taskStart, end: taskEnd },
              currentRange: { start: currentStart, end: currentEnd },
              message: `楼层与任务"${task.name}"(#${taskStart}-#${taskEnd === -1 ? '最后' : taskEnd})存在重叠`
            });
          }
        }
      }
    }
    
    // Only add as new content if there's no complete match
    if (!hasCompleteMatch) {
      newContentSources.push('聊天记录');
    }
  }
  
  // Check file overlap
  if (currentSettings.files.enabled && currentSettings.files.selected.length > 0) {
    const existingFiles = new Set();
    const fileTaskMap = new Map(); // 记录每个文件在哪些任务中
    
    // 收集所有已存在的文件
    for (const task of existingTasks) {
      if (task.settings?.files?.enabled && task.settings.files.selected) {
        task.settings.files.selected.forEach(url => {
          existingFiles.add(url);
          if (!fileTaskMap.has(url)) {
            fileTaskMap.set(url, []);
          }
          fileTaskMap.get(url).push(task.name);
        });
      }
    }
    
    console.debug('Vectors: File overlap analysis:', {
      currentSelected: currentSettings.files.selected,
      currentSelectedCount: currentSettings.files.selected.length,
      existingFiles: Array.from(existingFiles),
      existingFilesCount: existingFiles.size,
      fileTaskMap: Object.fromEntries(fileTaskMap),
      allExistingTaskFiles: existingTasks.map(task => ({
        taskName: task.name,
        files: task.settings?.files?.selected || []
      }))
    });
    
    const newFiles = currentSettings.files.selected.filter(url => !existingFiles.has(url));
    const duplicateFiles = currentSettings.files.selected.filter(url => existingFiles.has(url));
    
    console.debug('Vectors: File analysis result:', {
      newFiles,
      duplicateFiles,
      newFileCount: newFiles.length,
      duplicateFileCount: duplicateFiles.length
    });
    
    if (duplicateFiles.length > 0) {
      conflicts.push({
        type: 'files_partial',
        message: `${duplicateFiles.length} 个文件已被向量化`,
        details: duplicateFiles,
        taskInfo: duplicateFiles.map(url => ({
          url,
          tasks: fileTaskMap.get(url) || []
        }))
      });
    }
    
    if (newFiles.length > 0) {
      newContentSources.push(`${newFiles.length} 个新文件`);
    }
  }
  
  // Check world info overlap
  if (currentSettings.world_info.enabled) {
    const existingEntries = new Set();
    for (const task of existingTasks) {
      if (task.settings?.world_info?.enabled && task.settings.world_info.selected) {
        Object.values(task.settings.world_info.selected).flat().forEach(uid => existingEntries.add(uid));
      }
    }
    
    const currentEntries = Object.values(currentSettings.world_info.selected).flat();
    const newEntries = currentEntries.filter(uid => !existingEntries.has(uid));
    const duplicateEntries = currentEntries.filter(uid => existingEntries.has(uid));
    
    if (duplicateEntries.length > 0) {
      conflicts.push({
        type: 'worldinfo_partial',
        message: `${duplicateEntries.length} 个世界信息条目已被向量化`,
        details: duplicateEntries
      });
    }
    
    if (newEntries.length > 0) {
      newContentSources.push(`${newEntries.length} 个新世界信息条目`);
    }
  }
  
  const result = {
    hasConflicts: conflicts.length > 0,
    conflicts,
    newContentSources,
    hasNewContent: newContentSources.length > 0
  };
  
  console.debug('Vectors: Overlap analysis complete:', {
    result,
    conflictDetails: conflicts.map(c => ({
      type: c.type,
      message: c.message,
      details: c.details || 'no details'
    }))
  });
  
  return result;
}

/**
 * Creates filtered settings with only new content
 * @param {object} currentSettings Current settings
 * @param {string} chatId Chat ID
 * @param {Array} conflicts Array of conflict objects
 * @returns {object} Filtered settings with only new content
 */
function createIncrementalSettings(currentSettings, chatId, conflicts) {
  const existingTasks = getChatTasks(chatId).filter(t => t.enabled);
  const newSettings = JSON.parse(JSON.stringify(currentSettings));
  
  // Initialize coveredRanges at function scope for debugging
  let coveredRanges = [];
  
  // Handle chat message ranges - calculate new range based on conflicts
  if (newSettings.chat.enabled) {
    const currentStart = currentSettings.chat.range?.start || 0;
    const currentEnd = currentSettings.chat.range?.end || -1;
    const currentTags = currentSettings.chat.tags || '';
    const currentTypes = currentSettings.chat.types || { user: true, assistant: true };
    const currentHidden = currentSettings.chat.include_hidden || false;
    
    // Find all existing covered ranges with same settings
    coveredRanges = [];
    for (const task of existingTasks) {
      const taskChat = task.settings?.chat;
      if (taskChat?.enabled) {
        const taskStart = taskChat.range?.start || 0;
        const taskEnd = taskChat.range?.end || -1;
        const taskTags = taskChat.tags || '';
        const taskTypes = taskChat.types || { user: true, assistant: true };
        const taskHidden = taskChat.include_hidden || false;
        
        // Only consider ranges with same settings
        const sameSettings = (
          taskTags === currentTags &&
          JSON.stringify(taskTypes) === JSON.stringify(currentTypes) &&
          taskHidden === currentHidden
        );
        
        if (sameSettings) {
          coveredRanges.push({ start: taskStart, end: taskEnd });
        }
      }
    }
    
    // Calculate the new range that's not covered using a more robust algorithm
    if (coveredRanges.length === 0) {
      // No existing ranges, keep current range
      // hasNewRange is already true by default
    } else {
      // Sort covered ranges by start position
      coveredRanges.sort((a, b) => a.start - b.start);
      
      // Find gaps and uncovered areas
      const newRanges = [];
      let checkStart = currentStart;
      const actualCurrentEnd = currentEnd === -1 ? 999999 : currentEnd; // Use large number for -1
      
      for (const covered of coveredRanges) {
        const coveredStart = covered.start;
        const coveredEnd = covered.end === -1 ? 999999 : covered.end;
        
        // Skip if covered range is completely outside current range
        if (coveredEnd < currentStart || coveredStart > actualCurrentEnd) {
          continue;
        }
        
        // If there's a gap before this covered range
        if (checkStart < coveredStart) {
          const gapEnd = Math.min(actualCurrentEnd, coveredStart - 1);
          if (checkStart <= gapEnd) {
            newRanges.push({ start: checkStart, end: gapEnd === 999999 ? -1 : gapEnd });
          }
        }
        
        // Move checkStart to after this covered range
        checkStart = Math.max(checkStart, coveredEnd + 1);
      }
      
      // Check if there's remaining range after all covered ranges
      if (checkStart <= actualCurrentEnd) {
        newRanges.push({ start: checkStart, end: currentEnd });
      }
      
      // Handle multiple new ranges
      if (newRanges.length > 0) {
        // Store all new ranges for display purposes
        newSettings.chat.newRanges = newRanges;
        
        // For processing, try to merge ranges if they're close together
        // or use a combined approach
        if (newRanges.length === 1) {
          // Single range - use directly
          newSettings.chat.range = newRanges[0];
        } else {
          // Multiple ranges - for now, use the range from smallest start to largest end
          // This will include some already-processed content, but incremental processing will filter it
          const starts = newRanges.map(r => r.start);
          const ends = newRanges.map(r => r.end === -1 ? -1 : r.end).filter(e => e !== -1);
          const minStart = Math.min(...starts);
          const maxEnd = ends.length > 0 ? Math.max(...ends) : -1;
          
          // Check if any range goes to end (-1)
          const hasEndRange = newRanges.some(r => r.end === -1);
          
          newSettings.chat.range = {
            start: minStart,
            end: hasEndRange ? -1 : maxEnd
          };
          
          // Mark this as a multi-range selection for processing
          newSettings.chat.isMultiRange = true;
        }
      } else {
        // No new content
        newSettings.chat.enabled = false;
      }
    }
  }
  
  console.debug('Vectors: createIncrementalSettings result:', {
    originalChat: currentSettings.chat,
    newChat: newSettings.chat,
    coveredRanges: newSettings.chat.enabled ? coveredRanges : 'N/A'
  });
  
  // Filter out existing files
  if (newSettings.files.enabled) {
    const existingFiles = new Set();
    for (const task of existingTasks) {
      if (task.settings?.files?.enabled && task.settings.files.selected) {
        task.settings.files.selected.forEach(url => existingFiles.add(url));
      }
    }
    newSettings.files.selected = newSettings.files.selected.filter(url => !existingFiles.has(url));
    if (newSettings.files.selected.length === 0) {
      newSettings.files.enabled = false;
    }
  }
  
  // Filter out existing world info
  if (newSettings.world_info.enabled) {
    const existingEntries = new Set();
    for (const task of existingTasks) {
      if (task.settings?.world_info?.enabled && task.settings.world_info.selected) {
        Object.values(task.settings.world_info.selected).flat().forEach(uid => existingEntries.add(uid));
      }
    }
    
    for (const [world, uids] of Object.entries(newSettings.world_info.selected)) {
      newSettings.world_info.selected[world] = uids.filter(uid => !existingEntries.has(uid));
      if (newSettings.world_info.selected[world].length === 0) {
        delete newSettings.world_info.selected[world];
      }
    }
    
    if (Object.keys(newSettings.world_info.selected).length === 0) {
      newSettings.world_info.enabled = false;
    }
  }
  
  return newSettings;
}

/**
 * Performs the actual vectorization with given settings
 * @param {object} contentSettings Settings for content selection
 * @param {string} chatId Chat ID
 * @param {boolean} isIncremental Whether this is incremental vectorization
 */
async function performVectorization(contentSettings, chatId, isIncremental) {
  // Temporarily override settings for content gathering
  const originalSettings = JSON.parse(JSON.stringify(settings.selected_content));
  settings.selected_content = contentSettings;
  
  try {
    const items = await getVectorizableContent(contentSettings);
    if (items.length === 0) {
      toastr.warning('未选择要向量化的内容');
      return;
    }

    // Generate task name
    const context = getContext();
    
    // 调试：显示传给generateTaskName的数据
    console.debug('Vectors: Content settings for task name generation:', {
      chat: contentSettings.chat,
      files: contentSettings.files,
      world_info: contentSettings.world_info,
      itemCount: items.length
    });
    
    let taskName = await generateTaskName(contentSettings, items);
    console.debug(`Vectors: Generated task name: ${taskName}`);
    
    // Add incremental prefix if needed
    if (isIncremental) {
      taskName = '[增量] ' + taskName;
    }

    // 设置向量化状态
    isVectorizing = true;
    vectorizationAbortController = new AbortController();
    
    // 更新UI状态
    $('#vectors_enhanced_vectorize').hide();
    $('#vectors_enhanced_abort').show();

    // Create new task and collection ID first
    const taskId = generateTaskId();
    const collectionId = `${chatId}_${taskId}`;
    let vectorsInserted = false; // 标记是否有向量被插入

    try {
      const progressMessage = isIncremental ? '增量向量化开始...' : '向量化开始...';
      toastr.info(progressMessage, '处理中');
      updateProgress(0, items.length, '准备向量化');

      // Create corrected settings based on actually processed items
      const correctedSettings = JSON.parse(JSON.stringify(contentSettings));
      
      // Update file list to only include actually processed files
      if (correctedSettings.files.enabled) {
        const actuallyProcessedFiles = items
          .filter(item => item.type === 'file')
          .map(item => item.metadata.url);
        correctedSettings.files.selected = actuallyProcessedFiles;
        
        console.debug('Vectors: Corrected file settings:', {
          originalSelected: contentSettings.files.selected,
          actuallyProcessed: actuallyProcessedFiles,
          originalCount: contentSettings.files.selected.length,
          actualCount: actuallyProcessedFiles.length
        });
      }
      
      // Update world info list to only include actually processed entries
      if (correctedSettings.world_info.enabled) {
        const actuallyProcessedEntries = items
          .filter(item => item.type === 'world_info')
          .map(item => item.metadata.uid);
        
        // Rebuild world_info.selected based on actually processed entries
        const newWorldInfoSelected = {};
        for (const uid of actuallyProcessedEntries) {
          // Find which world this entry belongs to
          const originalWorld = Object.keys(contentSettings.world_info.selected).find(world => 
            contentSettings.world_info.selected[world].includes(uid)
          );
          if (originalWorld) {
            if (!newWorldInfoSelected[originalWorld]) {
              newWorldInfoSelected[originalWorld] = [];
            }
            newWorldInfoSelected[originalWorld].push(uid);
          }
        }
        correctedSettings.world_info.selected = newWorldInfoSelected;
        
        console.debug('Vectors: Corrected world info settings:', {
          originalSelected: contentSettings.world_info.selected,
          actuallyProcessed: newWorldInfoSelected
        });
      }

      const task = {
        taskId: taskId,
        name: taskName,
        timestamp: Date.now(),
        settings: correctedSettings,
        enabled: true,
        itemCount: items.length,
        isIncremental: isIncremental
      };

      // Process items in chunks
      const allChunks = [];
      let processedItems = 0;

      for (const item of items) {
        // 检查是否被中断
        if (vectorizationAbortController.signal.aborted) {
          throw new Error('向量化被用户中断');
        }

        const chunks = splitTextIntoChunks(item.text, settings.chunk_size, settings.overlap_percent);
        chunks.forEach((chunk, idx) => {
          allChunks.push({
            hash: getHashValue(chunk),
            text: chunk,
            index: allChunks.length,
            metadata: {
              ...item.metadata,
              type: item.type,
              chunk_index: idx,
              chunk_total: chunks.length,
            },
          });
        });

        processedItems++;
        updateProgress(processedItems, items.length, '正在处理内容');
      }

      // Insert vectors in batches
      updateProgress(0, allChunks.length, '正在插入向量');
      const batchSize = 50;
      for (let i = 0; i < allChunks.length; i += batchSize) {
        // 检查是否被中断
        if (vectorizationAbortController.signal.aborted) {
          throw new Error('向量化被用户中断');
        }

        const batch = allChunks.slice(i, Math.min(i + batchSize, allChunks.length));
        await insertVectorItems(collectionId, batch, vectorizationAbortController.signal);
        vectorsInserted = true; // 标记已有向量插入
        updateProgress(Math.min(i + batchSize, allChunks.length), allChunks.length, '正在插入向量');
      }

      // 可选：为大量内容优化存储
      if (settings.lightweight_storage && allChunks.length > 100) {
        // 大内容模式：不保存文本到任务中，依赖文件读取
        console.debug(`Vectors: Large content detected (${allChunks.length} chunks), using lightweight storage`);
        task.lightweight = true;
      } else {
        // 普通模式：保存文本内容到任务中
        task.textContent = allChunks.map(chunk => ({
          hash: chunk.hash,
          text: chunk.text,
          metadata: chunk.metadata
        }));
      }

      // Add task to list
      console.debug('Vectors: Final task settings before saving:', {
        originalContentSettings: contentSettings,
        correctedSettings: correctedSettings,
        taskName: taskName,
        actualItemsProcessed: items.length
      });
      addVectorTask(chatId, task);

      // Update cache for this task
      cachedVectors.set(collectionId, {
        timestamp: Date.now(),
        items: allChunks,
        settings: JSON.parse(JSON.stringify(settings)),
      });

      hideProgress();
      const successMessage = isIncremental ? 
        `成功创建增量向量化任务 "${taskName}"：${items.length} 个新项目，${allChunks.length} 个块` :
        `成功创建向量化任务 "${taskName}"：${items.length} 个项目，${allChunks.length} 个块`;
      toastr.success(successMessage, '成功');

      // Refresh task list UI
      await updateTaskList();
    } catch (error) {
      console.error('向量化失败:', error);
      hideProgress();
      
      // Check if it was an intentional abort
      if (error.message === '向量化被用户中断') {
        // 清理已插入的部分数据
        if (vectorsInserted) {
          console.log(`Vectors: 清理被中断任务的向量数据: ${collectionId}`);
          try {
            await purgeVectorIndex(collectionId);
            console.log(`Vectors: 已清理集合 ${collectionId} 的部分数据`);
          } catch (cleanupError) {
            console.error('Vectors: 清理向量数据失败:', cleanupError);
          }
        }
        toastr.info('向量化已中断，已清理部分数据', '中断');
      } else {
        // 非中断错误也清理可能的部分数据
        if (vectorsInserted) {
          console.log(`Vectors: 清理失败任务的向量数据: ${collectionId}`);
          try {
            await purgeVectorIndex(collectionId);
          } catch (cleanupError) {
            console.error('Vectors: 清理向量数据失败:', cleanupError);
          }
        }
        toastr.error('向量化内容失败', '错误');
      }
    } finally {
      // 重置向量化状态
      isVectorizing = false;
      vectorizationAbortController = null;
      
      // 重置UI状态
      $('#vectors_enhanced_vectorize').show();
      $('#vectors_enhanced_abort').hide();
    }
  } finally {
    // Restore original settings
    settings.selected_content = originalSettings;
  }
}

/**
 * Actively cleanup invalid selections before processing
 */
async function cleanupInvalidSelections() {
  console.debug('Vectors: Starting active cleanup of invalid selections');
  
  let hasChanges = false;
  
  // Cleanup world info selections
  if (settings.selected_content.world_info.enabled) {
    const entries = await getSortedEntries();
    const allValidUids = new Set();
    const currentValidWorlds = new Set();
    
    entries.forEach(entry => {
      // Only include entries that are not disabled and have content
      if (entry.world && entry.content && !entry.disable) {
        allValidUids.add(entry.uid);
        currentValidWorlds.add(entry.world);
      }
    });
    
    console.debug('Vectors: Valid world info UIDs:', Array.from(allValidUids));
    console.debug('Vectors: Current valid worlds:', Array.from(currentValidWorlds));
    
    const originalSelected = JSON.parse(JSON.stringify(settings.selected_content.world_info.selected));
    const originalCount = Object.values(originalSelected).flat().length;
    
    // Clean each world's selection
    for (const [world, selectedUids] of Object.entries(settings.selected_content.world_info.selected)) {
      // Remove worlds that don't exist in current context
      if (!currentValidWorlds.has(world)) {
        console.debug(`Vectors: Removing world "${world}" - not available in current context`);
        delete settings.selected_content.world_info.selected[world];
        hasChanges = true;
        continue;
      }
      
      const validUids = selectedUids.filter(uid => {
        const isValid = allValidUids.has(uid);
        if (!isValid) {
          console.debug(`Vectors: Removing invalid world info UID: ${uid} from world ${world}`);
        }
        return isValid;
      });
      
      if (validUids.length !== selectedUids.length) {
        hasChanges = true;
        if (validUids.length === 0) {
          delete settings.selected_content.world_info.selected[world];
          console.debug(`Vectors: Removed empty world: ${world}`);
        } else {
          settings.selected_content.world_info.selected[world] = validUids;
        }
      }
    }
    
    const newCount = Object.values(settings.selected_content.world_info.selected).flat().length;
    const removedCount = originalCount - newCount;
    
    if (removedCount > 0) {
      console.debug(`Vectors: Cleaned up ${removedCount} invalid world info selections:`, {
        original: originalSelected,
        cleaned: settings.selected_content.world_info.selected,
        originalCount,
        newCount
      });
      hasChanges = true;
    }
  }
  
  // TODO: Add file cleanup here if needed
  
  if (hasChanges) {
    Object.assign(extension_settings.vectors_enhanced, settings);
    saveSettingsDebounced();
    console.debug('Vectors: Active cleanup completed with changes');
  } else {
    console.debug('Vectors: Active cleanup completed - no changes needed');
  }
}

/**
 * Vectorizes selected content
 * @returns {Promise<void>}
 */
async function vectorizeContent() {
  if (isVectorizing) {
    toastr.warning('已有向量化任务在进行中');
    return;
  }

  const chatId = getCurrentChatId();
  if (!chatId) {
    toastr.error('未选择聊天');
    return;
  }
  
  // Debug: Check current selection state before processing
  console.debug('Vectors: Current selection state before processing:', {
    chat: settings.selected_content.chat,
    files: settings.selected_content.files,
    world_info: settings.selected_content.world_info
  });
  
  // Active cleanup before processing
  await cleanupInvalidSelections();
  
  // Analyze overlap with existing tasks
  const overlapAnalysis = analyzeTaskOverlap(chatId, settings.selected_content);
  
  if (overlapAnalysis.hasConflicts) {
    if (overlapAnalysis.hasNewContent) {
      // Pre-check if incremental settings would have any content
      const incrementalSettings = createIncrementalSettings(settings.selected_content, chatId, overlapAnalysis.conflicts);
      const hasActualNewContent = (
        (incrementalSettings.chat.enabled) ||
        (incrementalSettings.files.enabled && incrementalSettings.files.selected.length > 0) ||
        (incrementalSettings.world_info.enabled && Object.keys(incrementalSettings.world_info.selected).length > 0)
      );
      
      if (!hasActualNewContent) {
        // All content is actually covered by existing tasks
        const conflictMessage = '当前选择的内容中没有需要处理的新增项目';
        toastr.warning(conflictMessage);
        return;
      }
      
      // Generate simplified conflict message
      const duplicatedParts = [];
      const newParts = [];
      
      // Process conflicts to extract duplicated items
      overlapAnalysis.conflicts.forEach(conflict => {
        if (conflict.type === 'chat_duplicate') {
          const start = conflict.taskRange.start;
          const end = conflict.taskRange.end;
          duplicatedParts.push(`楼层#${start}-#${end === -1 ? '最后' : end}`);
        } else if (conflict.type === 'chat_partial') {
          const start = conflict.taskRange.start;
          const end = conflict.taskRange.end;
          duplicatedParts.push(`楼层#${start}-#${end === -1 ? '最后' : end}`);
        } else if (conflict.type === 'files_partial') {
          duplicatedParts.push(`${conflict.details.length}个文件`);
        } else if (conflict.type === 'worldinfo_partial') {
          duplicatedParts.push(`${conflict.details.length}个世界信息条目`);
        }
      });
      
      // Calculate new content
      if (incrementalSettings.chat.enabled) {
        // Check if we have multiple new ranges
        if (incrementalSettings.chat.newRanges && incrementalSettings.chat.newRanges.length > 0) {
          // Display all new ranges
          const rangeStrings = incrementalSettings.chat.newRanges.map(range => {
            const start = range.start;
            const end = range.end;
            return `楼层#${start}-#${end === -1 ? '最后' : end}`;
          });
          newParts.push(rangeStrings.join('、'));
        } else {
          // Fallback to single range
          const start = incrementalSettings.chat.range?.start || 0;
          const end = incrementalSettings.chat.range?.end || -1;
          newParts.push(`楼层#${start}-#${end === -1 ? '最后' : end}`);
        }
      }
      if (incrementalSettings.files.enabled && incrementalSettings.files.selected.length > 0) {
        newParts.push(`${incrementalSettings.files.selected.length}个新文件`);
      }
      if (incrementalSettings.world_info.enabled && Object.keys(incrementalSettings.world_info.selected).length > 0) {
        const newEntryCount = Object.values(incrementalSettings.world_info.selected).flat().length;
        newParts.push(`${newEntryCount}个新世界信息条目`);
      }
      
      const conflictMessage = `检测到${duplicatedParts.join('、')}已被向量化，是否只处理新增的${newParts.join('、')}？`;
      
      const userChoice = await callGenericPopup(conflictMessage, POPUP_TYPE.CONFIRM, '', {
        okButton: '只向量化新增内容',
        cancelButton: '取消'
      });
      
      if (userChoice !== POPUP_RESULT.AFFIRMATIVE) {
        return;
      }
      
      // Use incremental settings
      await performVectorization(incrementalSettings, chatId, true);
    } else {
      const conflictMessage = '当前选择的内容中没有需要处理的新增项目';
      toastr.warning(conflictMessage);
      return;
    }
  } else {
    // No conflicts, proceed normally
    await performVectorization(settings.selected_content, chatId, false);
  }
}

/**
 * Exports vectorized content
 * @returns {Promise<void>}
 */
async function exportVectors() {
  const context = getContext();
  const chatId = getCurrentChatId();

  if (!chatId) {
    toastr.error('未选择聊天');
    return;
  }

  const items = await getVectorizableContent();
  if (items.length === 0) {
    toastr.warning('未选择要导出的内容');
    return;
  }

  // Build export content
  let exportText = `角色卡：${context.name || '未知'}\n`;
  exportText += `时间：${new Date().toLocaleString('zh-CN')}\n\n`;

  // Group items by type
  const grouped = items.reduce((acc, item) => {
    if (!acc[item.type]) acc[item.type] = [];
    acc[item.type].push(item);
    return acc;
  }, {});

  // Files
  exportText += '=== 数据库文件 ===\n';
  if (grouped.file && grouped.file.length > 0) {
    grouped.file.forEach(item => {
      exportText += `文件名：${item.metadata.name}\n`;
      exportText += `内容：\n${item.text}\n\n`;
    });
  } else {
    exportText += '无\n\n';
  }

  // World Info
  exportText += '=== 世界书 ===\n';
  if (grouped.world_info && grouped.world_info.length > 0) {
    grouped.world_info.forEach(item => {
      exportText += `世界：${item.metadata.world}\n`;
      exportText += `注释：${item.metadata.comment || '无'}\n`;
      exportText += `内容：${item.text}\n\n`;
    });
  } else {
    exportText += '无\n\n';
  }

  // Chat messages
  exportText += '=== 聊天记录 ===\n';
  if (grouped.chat && grouped.chat.length > 0) {
    grouped.chat.forEach(item => {
      exportText += `#${item.metadata.index}：${item.text}\n\n`;
    });
  } else {
    exportText += '无\n\n';
  }

  // Create and download file
  const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `向量导出_${context.name || chatId}_${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toastr.success('导出成功');
}

/**
 * Previews vectorizable content
 * @returns {Promise<void>}
 */
async function previewContent() {
  const items = await getVectorizableContent();
  if (items.length === 0) {
    toastr.warning('未选择要预览的内容');
    return;
  }

  // 统计过滤信息
  let totalOriginalBlocks = 0;
  let excludedBlocks = 0;
  let blacklistedBlocks = 0;
  let finalBlocks = 0;

  // 模拟处理过程以获取统计信息
  const blacklist = settings.content_blacklist || [];
  const chatSettings = settings.selected_content.chat;
  const tags = chatSettings.tags
    ? chatSettings.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t)
    : [];

  if (chatSettings.enabled && tags.length > 0) {
    const context = getContext();
    const start = chatSettings.range?.start || 0;
    const end = chatSettings.range?.end || -1;
    const messages = context.chat.slice(start, end === -1 ? undefined : end);

    messages.forEach(msg => {
      if (msg.is_system) return;
      if (!chatSettings.types.user && msg.is_user) return;
      if (!chatSettings.types.assistant && !msg.is_user) return;

      const originalText = substituteParams(msg.mes);

      for (const tagConfig of tags) {
        try {
          const { mainTag, excludeTags } = parseTagWithExclusions(tagConfig);

          // 统计原始提取的块
          let originalBlocks = [];
          if (mainTag.includes(',')) {
            originalBlocks = extractComplexTag(originalText, mainTag);
          } else if (mainTag.includes('<') && mainTag.includes('>')) {
            originalBlocks = extractHtmlFormatTag(originalText, mainTag);
          } else {
            originalBlocks = extractSimpleTag(originalText, mainTag);
          }

          totalOriginalBlocks += originalBlocks.length;

          // 统计排除的块
          let afterExclusion = originalBlocks;
          if (excludeTags.length > 0) {
            afterExclusion = originalBlocks
              .map(content => removeExcludedTags(content, excludeTags))
              .filter(content => content.trim());
            excludedBlocks += originalBlocks.length - afterExclusion.length;
          }

          // 统计黑名单过滤的块
          const afterBlacklist = afterExclusion.filter(content => {
            if (shouldSkipContent(content, blacklist)) {
              blacklistedBlocks++;
              return false;
            }
            return true;
          });

          finalBlocks += afterBlacklist.length;
        } catch (error) {
          console.warn(`统计时标签配置错误: ${tagConfig}`, error);
        }
      }
    });
  }

  let html = '<div class="vector-preview">';
  html += `<div class="preview-header">已选择内容（${items.length} 项）</div>`;

  // 添加过滤统计信息
  if (totalOriginalBlocks > 0) {
    html +=
      '<div class="preview-stats" style="background: var(--SmartThemeQuoteColor); padding: 0.5rem; margin-bottom: 1rem; border-radius: 4px;">';
    html += '<div style="font-weight: bold; margin-bottom: 0.25rem;">内容处理统计：</div>';
    html += `<div>• 原始提取块数：${totalOriginalBlocks}</div>`;
    if (excludedBlocks > 0) {
      html += `<div>• 嵌套标签排除：${excludedBlocks} 个块被移除</div>`;
    }
    if (blacklistedBlocks > 0) {
      html += `<div>• 黑名单过滤：${blacklistedBlocks} 个块被跳过</div>`;
    }
    html += `<div>• 最终向量化：${finalBlocks} 个块</div>`;
    html += '</div>';
  }

  html += '<div class="preview-sections">';

  // Group by type
  const grouped = items.reduce((acc, item) => {
    if (!acc[item.type]) acc[item.type] = [];
    acc[item.type].push(item);
    return acc;
  }, {});

  // Files section
  html += '<div class="preview-section">';
  html += `<div class="preview-section-title">文件（${grouped.file?.length || 0}）</div>`;
  html += '<div class="preview-section-content">';
  if (grouped.file && grouped.file.length > 0) {
    grouped.file.forEach(item => {
      const sizeKB = (item.metadata.size / 1024).toFixed(1);
      html += `<div class="preview-item">`;
      html += `<strong>${item.metadata.name}</strong> - ${sizeKB} KB`;
      html += `</div>`;
    });
  } else {
    html += '<div class="preview-empty">无文件</div>';
  }
  html += '</div></div>';

  // World Info section
  html += '<div class="preview-section">';
  html += `<div class="preview-section-title">世界信息（${grouped.world_info?.length || 0}）</div>`;
  html += '<div class="preview-section-content">';
  if (grouped.world_info && grouped.world_info.length > 0) {
    // Group by world
    const byWorld = {};
    grouped.world_info.forEach(item => {
      if (!byWorld[item.metadata.world]) byWorld[item.metadata.world] = [];
      byWorld[item.metadata.world].push(item);
    });

    for (const [world, entries] of Object.entries(byWorld)) {
      html += `<div class="preview-world-group">`;
      html += `<div class="preview-world-name">${world}</div>`;
      entries.forEach(entry => {
        html += `<div class="preview-world-entry">${entry.metadata.comment || '(无注释)'}</div>`;
      });
      html += `</div>`;
    }
  } else {
    html += '<div class="preview-empty">无世界信息</div>';
  }
  html += '</div></div>';

  // Chat messages section
  html += '<div class="preview-section">';
  html += `<div class="preview-section-title">聊天记录（${grouped.chat?.length || 0} 条消息）</div>`;
  html += '<div class="preview-section-content">';
  if (grouped.chat && grouped.chat.length > 0) {
    grouped.chat.forEach(item => {
      const msgType = item.metadata.is_user ? '用户' : 'AI';
      html += `<div class="preview-chat-message">`;
      html += `<div class="preview-chat-header">#${item.metadata.index} - ${msgType}（${item.metadata.name}）</div>`;
      html += `<div class="preview-chat-content">${item.text}</div>`;
      html += `</div>`;
    });
  } else {
    html += '<div class="preview-empty">无聊天记录</div>';
  }
  html += '</div></div>';

  html += '</div></div>';

  await callGenericPopup(html, POPUP_TYPE.TEXT, '', {
    okButton: '关闭',
    wide: true,
    large: true,
  });
}

/**
 * Cache object for storing hash values
 * @type {Map<string, number>}
 */
const hashCache = new Map();

/**
 * Gets the hash value for a given string
 * @param {string} str Input string
 * @returns {number} Hash value
 */
function getHashValue(str) {
  if (hashCache.has(str)) {
    return hashCache.get(str);
  }
  const hash = getStringHash(str);
  hashCache.set(str, hash);
  return hash;
}

/**
 * Synchronizes chat vectors
 * @param {number} batchSize Batch size for processing
 * @returns {Promise<number>} Number of remaining items
 */
async function synchronizeChat(batchSize = 5) {
  // 检查主开关是否启用
  if (!settings.master_enabled) {
    return -1;
  }

  if (!settings.auto_vectorize) {
    return -1;
  }

  try {
    await waitUntilCondition(() => !syncBlocked && !is_send_press, 1000);
  } catch {
    console.log('Vectors: Synchronization blocked by another process');
    return -1;
  }

  try {
    syncBlocked = true;
    // Auto-vectorization logic will be implemented based on settings
    return -1;
  } finally {
    syncBlocked = false;
  }
}

/**
 * Retrieves vectorized content for injection
 * @param {object[]} chat Chat messages
 * @param {number} contextSize Context size
 * @param {function} abort Abort function
 * @param {string} type Generation type
 */
async function rearrangeChat(chat, contextSize, abort, type) {
  try {
    if (type === 'quiet') {
      console.debug('Vectors: Skipping quiet prompt');
      return;
    }

    setExtensionPrompt(
      EXTENSION_PROMPT_TAG,
      '',
      settings.position,
      settings.depth,
      settings.include_wi,
      settings.depth_role,
    );

    // 检查主开关是否启用
    if (!settings.master_enabled) {
      console.debug('Vectors: Master switch disabled, skipping all functionality');
      return;
    }

    // 检查是否启用向量查询
    if (!settings.enabled) {
      console.debug('Vectors: Query disabled by user');
      return;
    }

    const chatId = getCurrentChatId();
    if (!chatId) {
      console.debug('Vectors: No chat ID available');
      return;
    }

    // Query vectors based on recent messages
    const queryMessages = Math.min(settings.query_messages || 3, chat.length);
    const queryText = chat
      .slice(-queryMessages)
      .map(x => x.mes)
      .join('\n');
    if (!queryText.trim()) return;

    // Get all enabled tasks for this chat
    const allTasks = getChatTasks(chatId);
    const tasks = allTasks.filter(t => t.enabled);
    
    console.debug(`Vectors: Chat ${chatId} has ${allTasks.length} total tasks, ${tasks.length} enabled`);
    allTasks.forEach(task => {
      console.debug(`Vectors: Task "${task.name}" (${task.taskId}) - enabled: ${task.enabled}`);
    });
    
    if (tasks.length === 0) {
      console.debug('Vectors: No enabled tasks for this chat');
      return;
    }

    // Query all enabled tasks
    const allResults = [];
    for (const task of tasks) {
      const collectionId = `${chatId}_${task.taskId}`;
      console.debug(`Vectors: Querying collection "${collectionId}" for task "${task.name}"`);
      
      try {
        const results = await queryCollection(collectionId, queryText, settings.max_results || 10);
        console.debug(`Vectors: Query results for task ${task.name}:`, results);
        console.debug(`Vectors: Result structure - has items: ${!!results?.items}, has hashes: ${!!results?.hashes}`);

        // 根据API返回的结构处理结果
        if (results) {
          // 如果API返回了items数组（包含text）
          if (results.items && Array.isArray(results.items)) {
            results.items.forEach(item => {
              if (item.text) {
                allResults.push({
                  text: item.text,
                  score: item.score || 0,
                  metadata: {
                    ...item.metadata,
                    taskName: task.name,
                    taskId: task.taskId,
                  },
                });
              }
            });
          }
          // 如果API只返回了hashes和metadata，从任务保存的文本内容中获取
          else if (results.hashes && results.metadata) {
            console.debug(`Vectors: API returned hashes only, retrieving text from task data`);
            
            // 首先尝试从缓存获取（性能最优）
            const cachedData = cachedVectors.get(collectionId);
            if (cachedData && cachedData.items) {
              console.debug(`Vectors: Using cached data for ${collectionId}`);
              results.hashes.forEach((hash, index) => {
                const cachedItem = cachedData.items.find(item => item.hash === hash);
                if (cachedItem && cachedItem.text) {
                  allResults.push({
                    text: cachedItem.text,
                    score: results.metadata[index]?.score || 0,
                    metadata: {
                      ...cachedItem.metadata,
                      ...(results.metadata[index] || {}),
                      taskName: task.name,
                      taskId: task.taskId,
                    },
                  });
                }
              });
            }
            // 缓存不可用，尝试其他方法获取文本
            else {
              // 如果任务有保存的文本内容，优先使用
              if (task.textContent && Array.isArray(task.textContent)) {
                console.debug(`Vectors: Using task saved text content for ${collectionId}`);
                results.hashes.forEach((hash, index) => {
                  const textItem = task.textContent.find(item => item.hash === hash);
                  if (textItem && textItem.text) {
                    allResults.push({
                      text: textItem.text,
                      score: results.metadata[index]?.score || 0,
                      metadata: {
                        ...textItem.metadata,
                        ...(results.metadata[index] || {}),
                        taskName: task.name,
                        taskId: task.taskId,
                      },
                    });
                  }
                });
              }
              // 对于轻量化任务或没有保存文本的任务，从文件读取
              else {
                console.debug(`Vectors: Attempting to retrieve text directly from vector files for ${collectionId}`);
                try {
                  const vectorTexts = await getVectorTexts(collectionId, results.hashes);
                  console.debug(`Vectors: Retrieved ${vectorTexts.length} texts from files`);
                  
                  if (vectorTexts && vectorTexts.length > 0) {
                    vectorTexts.forEach((item, index) => {
                      if (item.text) {
                        allResults.push({
                          text: item.text,
                          score: results.metadata[index]?.score || 0,
                          metadata: {
                            ...item.metadata,
                            ...(results.metadata[index] || {}),
                            taskName: task.name,
                            taskId: task.taskId,
                          },
                        });
                      }
                    });
                  } else {
                    console.error(`Vectors: Failed to retrieve text content from files for ${collectionId}`);
                  }
                } catch (retrieveError) {
                  console.error(`Vectors: Error retrieving texts from files for ${collectionId}:`, retrieveError);
                }
              }
            }
          }
        }
      } catch (error) {
        console.error(`Vectors: Failed to query task ${task.name}:`, error);
      }
    }

    // 初始化变量
    let topResults = [];
    let groupedResults = {};
    let insertedText = '';
    let totalChars = 0;

    if (allResults.length === 0) {
      console.debug('Vectors: No query results found');
    } else {
      console.debug(`Vectors: Found ${allResults.length} total results`);

      // Sort by score and take top results
      allResults.sort((a, b) => (b.score || 0) - (a.score || 0));
      topResults = allResults.slice(0, settings.max_results || 10);

      console.debug(`Vectors: Using top ${topResults.length} results`);

      // Group results by type
      topResults.forEach(result => {
        const type = result.metadata?.type || 'unknown';
        if (!groupedResults[type]) {
          groupedResults[type] = [];
        }
        groupedResults[type].push(result);
      });

      console.debug(
        'Vectors: Grouped results by type:',
        Object.keys(groupedResults).map(k => `${k}: ${groupedResults[k].length}`),
      );

      // Format results with tags
      const formattedParts = [];

      // Process chat messages
      if (groupedResults.chat && groupedResults.chat.length > 0) {
        const chatTexts = groupedResults.chat
          .sort((a, b) => (a.metadata?.index || 0) - (b.metadata?.index || 0))
          .map(m => m.text)
          .filter(onlyUnique)
          .join('\n\n');

        const tag = settings.content_tags?.chat || 'past_chat';
        formattedParts.push(`<${tag}>\n${chatTexts}\n</${tag}>`);
      }

      // Process world info
      if (groupedResults.world_info && groupedResults.world_info.length > 0) {
        const wiTexts = groupedResults.world_info
          .map(m => m.text)
          .filter(onlyUnique)
          .join('\n\n');

        const tag = settings.content_tags?.world_info || 'world_part';
        formattedParts.push(`<${tag}>\n${wiTexts}\n</${tag}>`);
      }

      // Process files
      if (groupedResults.file && groupedResults.file.length > 0) {
        const fileTexts = groupedResults.file
          .map(m => m.text)
          .filter(onlyUnique)
          .join('\n\n');

        const tag = settings.content_tags?.file || 'databank';
        formattedParts.push(`<${tag}>\n${fileTexts}\n</${tag}>`);
      }

      // Join all parts
      const relevantTexts = formattedParts.join('\n\n');

      console.debug(`Vectors: Formatted ${formattedParts.length} parts, total length: ${relevantTexts.length}`);

      if (relevantTexts) {
        insertedText = substituteParamsExtended(settings.template, { text: relevantTexts });
        console.debug(`Vectors: Final injected text length: ${insertedText.length}`);
        totalChars = insertedText.length;

        setExtensionPrompt(
          EXTENSION_PROMPT_TAG,
          insertedText,
          settings.position,
          settings.depth,
          settings.include_wi,
          settings.depth_role,
        );
      } else {
        console.debug('Vectors: No relevant texts found after formatting');
      }
    }

    // 显示查询结果通知（统一处理，无论是否有结果）
    if (settings.show_query_notification) {
      const currentTime = Date.now();
      
      // 防重复通知：检查冷却时间
      if (currentTime - lastNotificationTime < NOTIFICATION_COOLDOWN) {
        console.debug('Vectors: Notification skipped due to cooldown');
        return;
      }
      
      const totalResults = topResults.length;
      
      let message = `查询到${totalResults}个结果`;
      message += totalResults > 0 ? '，已注入' : '';
      
      // 详细模式：显示来源分布
      if (settings.detailed_notification && totalResults > 0) {
        const sourceStats = {
          chat: groupedResults.chat?.length || 0,
          file: groupedResults.file?.length || 0,
          world_info: groupedResults.world_info?.length || 0
        };
        
        if (sourceStats.chat || sourceStats.file || sourceStats.world_info) {
          const sources = [];
          if (sourceStats.chat) sources.push(`聊天记录${sourceStats.chat}条`);
          if (sourceStats.file) sources.push(`文件${sourceStats.file}条`);
          if (sourceStats.world_info) sources.push(`世界信息${sourceStats.world_info}条`);
          message += `\n来源：${sources.join('，')}`;
        }
      }
      
      const toastType = totalResults > 0 ? 'info' : 'warning';
      toastr[toastType](message, '向量查询结果', { timeOut: 3000 });
      
      // 更新最后通知时间
      lastNotificationTime = currentTime;
    }
  } catch (error) {
    console.error('Vectors: Failed to rearrange chat', error);
  }
}

window['vectors_rearrangeChat'] = rearrangeChat;

// 全局事件绑定 - 确保按钮始终有效
$(document).on('click', '#vectors_enhanced_preview', async function (e) {
  e.preventDefault();
  console.log('预览按钮被点击 (全局绑定)');

  if (!settings.master_enabled) {
    toastr.warning('请先启用聊天记录超级管理器');
    return;
  }

  try {
    await previewContent();
  } catch (error) {
    console.error('预览错误:', error);
    toastr.error('预览失败: ' + error.message);
  }
});

$(document).on('click', '#vectors_enhanced_export', async function (e) {
  e.preventDefault();
  console.log('导出按钮被点击 (全局绑定)');

  if (!settings.master_enabled) {
    toastr.warning('请先启用聊天记录超级管理器');
    return;
  }

  try {
    await exportVectors();
  } catch (error) {
    console.error('导出错误:', error);
    toastr.error('导出失败: ' + error.message);
  }
});

$(document).on('click', '#vectors_enhanced_vectorize', async function (e) {
  e.preventDefault();
  console.log('向量化按钮被点击 (全局绑定)');

  if (!settings.master_enabled) {
    toastr.warning('请先启用聊天记录超级管理器');
    return;
  }

  try {
    await vectorizeContent();
  } catch (error) {
    console.error('向量化错误:', error);
    toastr.error('向量化失败: ' + error.message);
  }
});

$(document).on('click', '#vectors_enhanced_abort', async function (e) {
  e.preventDefault();
  console.log('中断向量化按钮被点击 (全局绑定)');

  if (isVectorizing && vectorizationAbortController) {
    vectorizationAbortController.abort();
    toastr.info('正在中断向量化...', '中断');
  }
});


/**
 * Gets request body for vector operations
 * @param {object} args Additional arguments
 * @returns {object} Request body
 */
function getVectorsRequestBody(args = {}) {
  const body = Object.assign({}, args);

  switch (settings.source) {
    case 'transformers':
      // Local transformers
      if (settings.local_model) {
        body.model = settings.local_model;
      }
      break;
    case 'vllm':
      body.apiUrl = settings.vllm_url || textgenerationwebui_settings.server_urls[textgen_types.VLLM];
      body.model = settings.vllm_model;
      break;
    case 'ollama':
      body.model = settings.ollama_model;
      body.apiUrl =
        settings.ollama_url ||
        textgenerationwebui_settings.server_urls[textgen_types.OLLAMA] ||
        'http://localhost:11434';
      body.keep = !!settings.ollama_keep;
      break;
  }

  body.source = settings.source;
  return body;
}

/**
 * Throws if the vector source is invalid
 */
function throwIfSourceInvalid() {
  if (settings.source === 'vllm') {
    if (!settings.vllm_url && !textgenerationwebui_settings.server_urls[textgen_types.VLLM]) {
      throw new Error('vLLM URL not configured');
    }
    if (!settings.vllm_model) {
      throw new Error('vLLM model not specified');
    }
  }

  if (settings.source === 'ollama') {
    if (!settings.ollama_url && !textgenerationwebui_settings.server_urls[textgen_types.OLLAMA]) {
      throw new Error('Ollama URL not configured');
    }
    if (!settings.ollama_model) {
      throw new Error('Ollama model not specified');
    }
    // ollama_url 是可选的，因为有默认值 http://localhost:11434
  }
}

/**
 * Gets saved hashes for a collection
 * @param {string} collectionId Collection ID
 * @returns {Promise<number[]>} Array of hashes
 */
async function getSavedHashes(collectionId) {
  const response = await fetch('/api/vector/list', {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({
      ...getVectorsRequestBody(),
      collectionId: collectionId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get saved hashes for collection ${collectionId}`);
  }

  return await response.json();
}

/**
 * Inserts vector items into a collection
 * @param {string} collectionId Collection ID
 * @param {object[]} items Items to insert
 * @param {AbortSignal} signal Optional abort signal
 * @returns {Promise<void>}
 */
async function insertVectorItems(collectionId, items, signal = null) {
  throwIfSourceInvalid();

  const response = await fetch('/api/vector/insert', {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({
      ...getVectorsRequestBody(),
      collectionId: collectionId,
      items: items,
    }),
    signal: signal, // 添加中断信号支持
  });

  if (!response.ok) {
    throw new Error(`Failed to insert vector items for collection ${collectionId}`);
  }
}

/**
 * Queries a collection
 * @param {string} collectionId Collection ID
 * @param {string} searchText Search text
 * @param {number} topK Number of results
 * @returns {Promise<{hashes: number[], metadata: object[]}>}
 */
async function queryCollection(collectionId, searchText, topK) {
  const response = await fetch('/api/vector/query', {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({
      ...getVectorsRequestBody(),
      collectionId: collectionId,
      searchText: searchText,
      topK: topK,
      threshold: settings.score_threshold,
      includeText: true, // 请求包含文本内容
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to query collection ${collectionId}`);
  }

  const result = await response.json();
  console.debug(`Vectors: Raw query result for ${collectionId}:`, result);
  return result;
}

/**
 * Gets text content for specific hashes from vector collection
 * @param {string} collectionId Collection ID
 * @param {number[]} hashes Array of hashes to get text for
 * @returns {Promise<Array>} Array of {hash, text, metadata} objects
 */
async function getVectorTexts(collectionId, hashes) {
  try {
    const response = await fetch('/api/vector/retrieve', {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify({
        ...getVectorsRequestBody(),
        collectionId: collectionId,
        hashes: hashes,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to retrieve texts for collection ${collectionId}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Vectors: Failed to retrieve texts', error);
    return [];
  }
}

/**
 * Purges a vector index
 * @param {string} collectionId Collection ID
 * @returns {Promise<boolean>} Success status
 */
async function purgeVectorIndex(collectionId) {
  try {
    const response = await fetch('/api/vector/purge', {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify({
        ...getVectorsRequestBody(),
        collectionId: collectionId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Could not delete vector index for collection ${collectionId}`);
    }

    console.log(`Vectors: Purged vector index for collection ${collectionId}`);
    cachedVectors.delete(collectionId);
    return true;
  } catch (error) {
    console.error('Vectors: Failed to purge', error);
    return false;
  }
}

/**
 * Updates UI based on settings
 */
function toggleSettings() {
  $('#vectors_enhanced_vllm_settings').toggle(settings.source === 'vllm');
  $('#vectors_enhanced_ollama_settings').toggle(settings.source === 'ollama');
  $('#vectors_enhanced_local_settings').toggle(settings.source === 'transformers');
  $('#vectors_enhanced_transformers_settings').toggle(settings.source === 'transformers');
}

/**
 * Updates UI state based on master switch
 */
function updateMasterSwitchState() {
  const isEnabled = settings.master_enabled;

  // 控制主要设置区域的显示/隐藏
  $('#vectors_enhanced_main_settings').toggle(isEnabled);
  $('#vectors_enhanced_content_settings').toggle(isEnabled);
  $('#vectors_enhanced_tasks_settings').toggle(isEnabled);
  $('#vectors_enhanced_actions_settings').toggle(isEnabled);

  // 如果禁用，还需要禁用所有输入控件（作为额外保护）
  const settingsContainer = $('#vectors_enhanced_container');
  settingsContainer
    .find('input, select, textarea, button')
    .not('#vectors_enhanced_master_enabled')
    .prop('disabled', !isEnabled);

  // 更新视觉效果
  if (isEnabled) {
    settingsContainer.removeClass('vectors-disabled');
  } else {
    settingsContainer.addClass('vectors-disabled');
  }
}

/**
 * Updates content selection UI
 */
function updateContentSelection() {
  // This will be called when settings change to update the UI
  $('#vectors_enhanced_chat_settings').toggle(settings.selected_content.chat.enabled);
  $('#vectors_enhanced_files_settings').toggle(settings.selected_content.files.enabled);
  $('#vectors_enhanced_wi_settings').toggle(settings.selected_content.world_info.enabled);
}

/**
 * Updates the file list UI
 */
async function updateFileList() {
  console.debug('Vectors: Updating file list...');
  const fileList = $('#vectors_enhanced_files_list');
  console.debug('Vectors: File list element found:', fileList.length > 0);
  fileList.empty();

  const context = getContext();
  console.debug('Vectors: Context:', context);
  
  let allFiles = [];
  
  try {
    const dataBankFiles = getDataBankAttachments();
    const globalFiles = getDataBankAttachmentsForSource('global');
    const characterFiles = getDataBankAttachmentsForSource('character');
    const chatFiles = getDataBankAttachmentsForSource('chat');
    const extraFiles = context.chat?.filter(x => x.extra?.file).map(x => x.extra.file) || [];
    
    console.debug('Vectors: File sources:', {
      dataBank: dataBankFiles.length,
      global: globalFiles.length,
      character: characterFiles.length,
      chat: chatFiles.length,
      extra: extraFiles.length
    });
    
    // 去重复：使用URL作为唯一键
    const fileMap = new Map();
    [...dataBankFiles, ...globalFiles, ...characterFiles, ...chatFiles, ...extraFiles].forEach(file => {
      if (file && file.url) {
        fileMap.set(file.url, file);
      }
    });
    
    allFiles = Array.from(fileMap.values());
    
    console.debug('Vectors: Total files after deduplication:', allFiles.length);
    
    // Clean up invalid file selections (files that no longer exist)
    const allFileUrls = new Set(allFiles.map(f => f.url));
    const originalSelected = [...settings.selected_content.files.selected];
    settings.selected_content.files.selected = settings.selected_content.files.selected.filter(url => 
      allFileUrls.has(url)
    );
    
    const removedCount = originalSelected.length - settings.selected_content.files.selected.length;
    if (removedCount > 0) {
      console.debug(`Vectors: Cleaned up ${removedCount} invalid file selections:`, {
        original: originalSelected,
        cleaned: settings.selected_content.files.selected,
        removed: originalSelected.filter(url => !allFileUrls.has(url))
      });
      
      // Save the cleaned settings
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    }
  } catch (error) {
    console.error('Vectors: Error getting files:', error);
    fileList.append('<div class="text-muted">获取文件列表时出错</div>');
    return;
  }

  if (allFiles.length === 0) {
    fileList.append('<div class="text-muted">没有可用文件</div>');
    return;
  }

  // Group files by source - use the deduplicated files
  const dataBankUrls = new Set(getDataBankAttachments().map(f => f.url));
  const chatFileUrls = new Set((context.chat?.filter(x => x.extra?.file).map(x => x.extra.file) || []).map(f => f.url));
  
  const dataBankFiles = allFiles.filter(file => dataBankUrls.has(file.url));
  const chatFiles = allFiles.filter(file => chatFileUrls.has(file.url) && !dataBankUrls.has(file.url));

  if (dataBankFiles.length > 0) {
    fileList.append('<div class="file-group-header">数据库文件</div>');
    dataBankFiles.forEach(file => {
      const isChecked = settings.selected_content.files.selected.includes(file.url);
      const checkbox = $(`
                <label class="checkbox_label flex-container alignItemsCenter" title="${file.name}">
                    <input type="checkbox" value="${file.url}" ${isChecked ? 'checked' : ''} />
                    <span class="flex1 text-overflow-ellipsis">${file.name} (${(file.size / 1024).toFixed(1)} KB)</span>
                </label>
            `);

      checkbox.find('input').on('change', function () {
        if (this.checked) {
          if (!settings.selected_content.files.selected.includes(file.url)) {
            settings.selected_content.files.selected.push(file.url);
          }
        } else {
          settings.selected_content.files.selected = settings.selected_content.files.selected.filter(
            url => url !== file.url,
          );
        }
        Object.assign(extension_settings.vectors_enhanced, settings);
        saveSettingsDebounced();
      });

      fileList.append(checkbox);
    });
  }

  if (chatFiles.length > 0) {
    if (dataBankFiles.length > 0) fileList.append('<hr class="m-t-0-5 m-b-0-5">');
    fileList.append('<div class="file-group-header">聊天附件</div>');
    chatFiles.forEach(file => {
      const isChecked = settings.selected_content.files.selected.includes(file.url);
      const checkbox = $(`
                <label class="checkbox_label flex-container alignItemsCenter" title="${file.name}">
                    <input type="checkbox" value="${file.url}" ${isChecked ? 'checked' : ''} />
                    <span class="flex1 text-overflow-ellipsis">${file.name} (${(file.size / 1024).toFixed(1)} KB)</span>
                </label>
            `);

      checkbox.find('input').on('change', function () {
        if (this.checked) {
          if (!settings.selected_content.files.selected.includes(file.url)) {
            settings.selected_content.files.selected.push(file.url);
          }
        } else {
          settings.selected_content.files.selected = settings.selected_content.files.selected.filter(
            url => url !== file.url,
          );
        }
        Object.assign(extension_settings.vectors_enhanced, settings);
        saveSettingsDebounced();
      });

      fileList.append(checkbox);
    });
  }
}

/**
 * Updates the World Info list UI
 */
async function updateWorldInfoList() {
  const entries = await getSortedEntries();
  const wiList = $('#vectors_enhanced_wi_list');
  wiList.empty();

  if (!entries || entries.length === 0) {
    wiList.append('<div class="text-muted">没有可用的世界信息条目</div>');
    return;
  }

  // Group entries by world
  const grouped = {};
  entries.forEach(entry => {
    if (!entry.world || entry.disable || !entry.content) return;
    if (!grouped[entry.world]) grouped[entry.world] = [];
    grouped[entry.world].push(entry);
  });

  if (Object.keys(grouped).length === 0) {
    wiList.append('<div class="text-muted">未找到有效的世界信息条目</div>');
    return;
  }

  // Clean up invalid world info selections (entries that no longer exist or worlds not in current context)
  const allValidUids = new Set();
  const currentValidWorlds = new Set(Object.keys(grouped));
  Object.values(grouped).flat().forEach(entry => allValidUids.add(entry.uid));
  
  let hasChanges = false;
  const originalSelected = JSON.parse(JSON.stringify(settings.selected_content.world_info.selected));
  
  // Clean each world's selection
  for (const [world, selectedUids] of Object.entries(settings.selected_content.world_info.selected)) {
    // Remove worlds that don't exist in current context
    if (!currentValidWorlds.has(world)) {
      console.debug(`Vectors: Removing world "${world}" - not available in current context`);
      delete settings.selected_content.world_info.selected[world];
      hasChanges = true;
      continue;
    }
    
    const validUids = selectedUids.filter(uid => allValidUids.has(uid));
    if (validUids.length !== selectedUids.length) {
      hasChanges = true;
      if (validUids.length === 0) {
        delete settings.selected_content.world_info.selected[world];
      } else {
        settings.selected_content.world_info.selected[world] = validUids;
      }
    }
  }
  
  if (hasChanges) {
    const currentSelected = JSON.parse(JSON.stringify(settings.selected_content.world_info.selected));
    const originalCount = Object.values(originalSelected).flat().length;
    const currentCount = Object.values(currentSelected).flat().length;
    const removedCount = originalCount - currentCount;
    
    console.debug(`Vectors: Cleaned up ${removedCount} invalid world info selections:`, {
      original: originalSelected,
      cleaned: currentSelected,
      originalCount,
      currentCount
    });
    
    // Save the cleaned settings
    Object.assign(extension_settings.vectors_enhanced, settings);
    saveSettingsDebounced();
  }

  for (const [world, worldEntries] of Object.entries(grouped)) {
    const worldDiv = $('<div class="wi-world-group"></div>');

    // 世界名称和全选复选框
    const selectedEntries = settings.selected_content.world_info.selected[world] || [];
    const allChecked = worldEntries.length > 0 && worldEntries.every(e => selectedEntries.includes(e.uid));

    const worldHeader = $(`
            <div class="wi-world-header flex-container alignItemsCenter">
                <label class="checkbox_label flex1">
                    <input type="checkbox" class="world-select-all" data-world="${world}" ${
      allChecked ? 'checked' : ''
    } />
                    <span class="wi-world-name">${world}</span>
                </label>
            </div>
        `);

    // 全选复选框事件
    worldHeader.find('.world-select-all').on('change', function () {
      const isChecked = this.checked;

      if (isChecked) {
        settings.selected_content.world_info.selected[world] = worldEntries.map(e => e.uid);
      } else {
        delete settings.selected_content.world_info.selected[world];
      }

      // 更新所有子条目
      worldDiv.find('.wi-entry input').prop('checked', isChecked);

      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

    worldDiv.append(worldHeader);

    // 条目列表
    worldEntries.forEach(entry => {
      const isChecked = selectedEntries.includes(entry.uid);

      const checkbox = $(`
                <label class="checkbox_label wi-entry flex-container alignItemsCenter">
                    <input type="checkbox" value="${entry.uid}" data-world="${world}" ${isChecked ? 'checked' : ''} />
                    <span class="flex1">${entry.comment || '(无注释)'}</span>
                </label>
            `);

      checkbox.find('input').on('change', function () {
        if (!settings.selected_content.world_info.selected[world]) {
          settings.selected_content.world_info.selected[world] = [];
        }

        if (this.checked) {
          if (!settings.selected_content.world_info.selected[world].includes(entry.uid)) {
            settings.selected_content.world_info.selected[world].push(entry.uid);
          }
        } else {
          settings.selected_content.world_info.selected[world] = settings.selected_content.world_info.selected[
            world
          ].filter(id => id !== entry.uid);
        }

        // 更新全选复选框状态
        const allChecked = worldEntries.every(e =>
          settings.selected_content.world_info.selected[world]?.includes(e.uid),
        );
        worldHeader.find('.world-select-all').prop('checked', allChecked);

        // Clean up empty world arrays
        if (settings.selected_content.world_info.selected[world].length === 0) {
          delete settings.selected_content.world_info.selected[world];
        }

        Object.assign(extension_settings.vectors_enhanced, settings);
        saveSettingsDebounced();
      });

      worldDiv.append(checkbox);
    });

    wiList.append(worldDiv);
  }
}

/**
 * Updates chat message range settings
 */
function updateChatSettings() {
  const context = getContext();
  const messageCount = context.chat?.length || 0;

  $('#vectors_enhanced_chat_start').attr('max', messageCount);
  $('#vectors_enhanced_chat_end').attr('min', -1).attr('max', messageCount);
}

// Event handlers
const onChatEvent = debounce(async () => {
  if (settings.auto_vectorize) {
    await moduleWorker.update();
  }
  // Update UI lists when chat changes
  await updateFileList();
  updateChatSettings();
  await updateTaskList();
}, debounce_timeout.relaxed);

jQuery(async () => {
  // 使用独立的设置键避免冲突
  const SETTINGS_KEY = 'vectors_enhanced';

  if (!extension_settings[SETTINGS_KEY]) {
    extension_settings[SETTINGS_KEY] = settings;
  }

  // 深度合并设置，确保所有必需的属性都存在
  Object.assign(settings, extension_settings[SETTINGS_KEY]);
  
  // 调试：输出加载的设置
  console.debug('Vectors: 从扩展设置加载的数据:', extension_settings[SETTINGS_KEY]);
  console.debug('Vectors: 合并后的设置:', settings);
  console.debug('Vectors: 加载的任务数据:', settings.vector_tasks);

  // 确保 chat types 存在（处理旧版本兼容性）
  if (!settings.selected_content.chat.types) {
    settings.selected_content.chat.types = { user: true, assistant: true };
  }

  // 确保 include_hidden 属性存在
  if (settings.selected_content.chat.include_hidden === undefined) {
    settings.selected_content.chat.include_hidden = false;
  }

  // 确保所有必需的结构都存在
  if (!settings.selected_content.chat.range) {
    settings.selected_content.chat.range = { start: 0, end: -1 };
  }

  // 确保 vector_tasks 存在
  if (!settings.vector_tasks) {
    settings.vector_tasks = {};
  }

  // 保存修正后的设置
  Object.assign(extension_settings[SETTINGS_KEY], settings);
  saveSettingsDebounced();

  // 第三方插件需要使用完整路径
  const template = await renderExtensionTemplateAsync('third-party/vectors-enhanced', 'settings');
  $('#extensions_settings2').append(template);

  // Initialize master switch first
  $('#vectors_enhanced_master_enabled')
    .prop('checked', settings.master_enabled)
    .on('change', function () {
      settings.master_enabled = $(this).prop('checked');
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
      updateMasterSwitchState();
    });

  // Initialize master switch state
  updateMasterSwitchState();

  // Initialize UI elements
  $('#vectors_enhanced_source')
    .val(settings.source)
    .on('change', () => {
      settings.source = String($('#vectors_enhanced_source').val());
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
      toggleSettings();
    });

  $('#vectors_enhanced_vllm_model')
    .val(settings.vllm_model)
    .on('input', () => {
      settings.vllm_model = String($('#vectors_enhanced_vllm_model').val());
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  $('#vectors_enhanced_vllm_url')
    .val(settings.vllm_url)
    .on('input', () => {
      settings.vllm_url = String($('#vectors_enhanced_vllm_url').val());
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  $('#vectors_enhanced_local_model')
    .val(settings.local_model)
    .on('input', () => {
      settings.local_model = String($('#vectors_enhanced_local_model').val());
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  // Ollama settings handlers
  $('#vectors_enhanced_ollama_model')
    .val(settings.ollama_model)
    .on('input', () => {
      settings.ollama_model = String($('#vectors_enhanced_ollama_model').val());
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  $('#vectors_enhanced_ollama_url')
    .val(settings.ollama_url)
    .on('input', () => {
      settings.ollama_url = String($('#vectors_enhanced_ollama_url').val());
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  $('#vectors_enhanced_ollama_keep')
    .prop('checked', settings.ollama_keep)
    .on('input', () => {
      settings.ollama_keep = $('#vectors_enhanced_ollama_keep').prop('checked');
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  $('#vectors_enhanced_auto_vectorize')
    .prop('checked', settings.auto_vectorize)
    .on('input', () => {
      settings.auto_vectorize = $('#vectors_enhanced_auto_vectorize').prop('checked');
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  $('#vectors_enhanced_chunk_size')
    .val(settings.chunk_size)
    .on('input', () => {
      settings.chunk_size = Number($('#vectors_enhanced_chunk_size').val());
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  $('#vectors_enhanced_overlap_percent')
    .val(settings.overlap_percent)
    .on('input', () => {
      settings.overlap_percent = Number($('#vectors_enhanced_overlap_percent').val());
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  $('#vectors_enhanced_score_threshold')
    .val(settings.score_threshold)
    .on('input', () => {
      settings.score_threshold = Number($('#vectors_enhanced_score_threshold').val());
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  $('#vectors_enhanced_force_chunk_delimiter')
    .val(settings.force_chunk_delimiter)
    .on('input', () => {
      settings.force_chunk_delimiter = String($('#vectors_enhanced_force_chunk_delimiter').val());
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  $('#vectors_enhanced_enabled')
    .prop('checked', settings.enabled)
    .on('input', () => {
      settings.enabled = $('#vectors_enhanced_enabled').prop('checked');
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  $('#vectors_enhanced_query_messages')
    .val(settings.query_messages)
    .on('input', () => {
      settings.query_messages = Number($('#vectors_enhanced_query_messages').val());
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  $('#vectors_enhanced_max_results')
    .val(settings.max_results)
    .on('input', () => {
      settings.max_results = Number($('#vectors_enhanced_max_results').val());
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  // 显示查询结果通知设置
  $('#vectors_enhanced_show_query_notification')
    .prop('checked', settings.show_query_notification)
    .on('input', () => {
      settings.show_query_notification = $('#vectors_enhanced_show_query_notification').prop('checked');
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
      // 控制详细选项的显示/隐藏
      $('#vectors_enhanced_notification_details').toggle(settings.show_query_notification);
    });

  // 详细通知模式设置
  $('#vectors_enhanced_detailed_notification')
    .prop('checked', settings.detailed_notification)
    .on('input', () => {
      settings.detailed_notification = $('#vectors_enhanced_detailed_notification').prop('checked');
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  // 内容标签设置事件处理器
  $('#vectors_enhanced_tag_chat').on('input', () => {
    const value = $('#vectors_enhanced_tag_chat').val().trim() || 'past_chat';
    settings.content_tags.chat = value;
    Object.assign(extension_settings.vectors_enhanced, settings);
    saveSettingsDebounced();
  });

  $('#vectors_enhanced_tag_wi').on('input', () => {
    const value = $('#vectors_enhanced_tag_wi').val().trim() || 'world_part';
    settings.content_tags.world_info = value;
    Object.assign(extension_settings.vectors_enhanced, settings);
    saveSettingsDebounced();
  });

  $('#vectors_enhanced_tag_file').on('input', () => {
    const value = $('#vectors_enhanced_tag_file').val().trim() || 'databank';
    settings.content_tags.file = value;
    Object.assign(extension_settings.vectors_enhanced, settings);
    saveSettingsDebounced();
  });

  $('#vectors_enhanced_template')
    .val(settings.template)
    .on('input', () => {
      settings.template = String($('#vectors_enhanced_template').val());
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  $('#vectors_enhanced_depth')
    .val(settings.depth)
    .on('input', () => {
      settings.depth = Number($('#vectors_enhanced_depth').val());
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  $(`input[name="vectors_position"][value="${settings.position}"]`).prop('checked', true);
  $('input[name="vectors_position"]').on('change', () => {
    settings.position = Number($('input[name="vectors_position"]:checked').val());
    Object.assign(extension_settings.vectors_enhanced, settings);
    saveSettingsDebounced();
  });

  $('#vectors_enhanced_depth_role')
    .val(settings.depth_role)
    .on('change', () => {
      settings.depth_role = Number($('#vectors_enhanced_depth_role').val());
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  $('#vectors_enhanced_include_wi')
    .prop('checked', settings.include_wi)
    .on('input', () => {
      settings.include_wi = $('#vectors_enhanced_include_wi').prop('checked');
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  // Content selection handlers
  $('#vectors_enhanced_chat_enabled')
    .prop('checked', settings.selected_content.chat.enabled)
    .on('input', () => {
      settings.selected_content.chat.enabled = $('#vectors_enhanced_chat_enabled').prop('checked');
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
      updateContentSelection();
    });

  $('#vectors_enhanced_files_enabled')
    .prop('checked', settings.selected_content.files.enabled)
    .on('input', async () => {
      settings.selected_content.files.enabled = $('#vectors_enhanced_files_enabled').prop('checked');
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
      updateContentSelection();
      if (settings.selected_content.files.enabled) {
        await updateFileList();
      }
    });

  $('#vectors_enhanced_wi_enabled')
    .prop('checked', settings.selected_content.world_info.enabled)
    .on('input', async () => {
      settings.selected_content.world_info.enabled = $('#vectors_enhanced_wi_enabled').prop('checked');
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
      updateContentSelection();
      if (settings.selected_content.world_info.enabled) {
        await updateWorldInfoList();
      }
    });

  // Chat settings handlers - 确保所有属性都存在
  const chatRange = settings.selected_content.chat.range || { start: 0, end: -1 };
  const chatTypes = settings.selected_content.chat.types || { user: true, assistant: true };
  const chatTags = settings.selected_content.chat.tags || '';

  $('#vectors_enhanced_chat_start')
    .val(chatRange.start)
    .on('input', () => {
      if (!settings.selected_content.chat.range) {
        settings.selected_content.chat.range = { start: 0, end: -1 };
      }
      settings.selected_content.chat.range.start = Number($('#vectors_enhanced_chat_start').val());
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  $('#vectors_enhanced_chat_end')
    .val(chatRange.end)
    .on('input', () => {
      if (!settings.selected_content.chat.range) {
        settings.selected_content.chat.range = { start: 0, end: -1 };
      }
      settings.selected_content.chat.range.end = Number($('#vectors_enhanced_chat_end').val());
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  // Message type checkboxes
  $('#vectors_enhanced_chat_user')
    .prop('checked', chatTypes.user)
    .on('input', () => {
      if (!settings.selected_content.chat.types) {
        settings.selected_content.chat.types = { user: true, assistant: true };
      }
      settings.selected_content.chat.types.user = $('#vectors_enhanced_chat_user').prop('checked');
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  $('#vectors_enhanced_chat_assistant')
    .prop('checked', chatTypes.assistant)
    .on('input', () => {
      if (!settings.selected_content.chat.types) {
        settings.selected_content.chat.types = { user: true, assistant: true };
      }
      settings.selected_content.chat.types.assistant = $('#vectors_enhanced_chat_assistant').prop('checked');
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  // Tags input
  $('#vectors_enhanced_chat_tags')
    .val(chatTags)
    .on('input', () => {
      settings.selected_content.chat.tags = String($('#vectors_enhanced_chat_tags').val());
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  // Include hidden messages checkbox
  $('#vectors_enhanced_chat_include_hidden')
    .prop('checked', settings.selected_content.chat.include_hidden || false)
    .on('input', () => {
      if (!settings.selected_content.chat) {
        settings.selected_content.chat = {};
      }
      settings.selected_content.chat.include_hidden = $('#vectors_enhanced_chat_include_hidden').prop('checked');
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

  // Refresh buttons
  $('#vectors_enhanced_files_refresh').on('click', async () => {
    await updateFileList();
    toastr.info('文件列表已刷新');
  });

  $('#vectors_enhanced_wi_refresh').on('click', async () => {
    await updateWorldInfoList();
    toastr.info('世界信息列表已刷新');
  });

  // Initialize UI
  toggleSettings();
  updateContentSelection();
  updateChatSettings();
  
  // 初始化通知详细选项的显示状态
  $('#vectors_enhanced_notification_details').toggle(settings.show_query_notification);

  // 加载内容标签设置（确保向后兼容）
  if (!settings.content_tags) {
    settings.content_tags = {
      chat: 'past_chat',
      file: 'databank',
      world_info: 'world_part',
    };
  }
  $('#vectors_enhanced_tag_chat').val(settings.content_tags.chat);
  $('#vectors_enhanced_tag_wi').val(settings.content_tags.world_info);
  $('#vectors_enhanced_tag_file').val(settings.content_tags.file);

  // Initialize lists if enabled
  if (settings.selected_content.files.enabled) {
    await updateFileList();
  }
  if (settings.selected_content.world_info.enabled) {
    await updateWorldInfoList();
  }

  // Initialize task list
  await updateTaskList();

  // Initialize hidden messages info
  updateHiddenMessagesInfo();

  // Event listeners
  eventSource.on(event_types.MESSAGE_DELETED, onChatEvent);
  eventSource.on(event_types.MESSAGE_EDITED, onChatEvent);
  eventSource.on(event_types.MESSAGE_SENT, onChatEvent);
  eventSource.on(event_types.MESSAGE_RECEIVED, onChatEvent);
  eventSource.on(event_types.MESSAGE_SWIPED, onChatEvent);
  eventSource.on(event_types.CHAT_DELETED, chatId => {
    cachedVectors.delete(chatId);
    delete settings.vector_tasks[chatId];
    Object.assign(extension_settings.vectors_enhanced, settings);
    saveSettingsDebounced();
  });
  eventSource.on(event_types.GROUP_CHAT_DELETED, chatId => {
    cachedVectors.delete(chatId);
    delete settings.vector_tasks[chatId];
    Object.assign(extension_settings.vectors_enhanced, settings);
    saveSettingsDebounced();
  });
  eventSource.on(event_types.CHAT_CHANGED, async () => {
    await updateTaskList();
    updateHiddenMessagesInfo();
    // Auto-cleanup invalid world info selections when switching chats
    if (settings.selected_content.world_info.enabled) {
      await cleanupInvalidSelections();
      await updateWorldInfoList();
    }
  });

  // 监听聊天重新加载事件，以便在使用 /hide 和 /unhide 命令后更新
  eventSource.on(event_types.CHAT_LOADED, async () => {
    updateHiddenMessagesInfo();
  });

  // Register slash commands
  SlashCommandParser.addCommandObject(
    SlashCommand.fromProps({
      name: 'vec-preview',
      callback: async () => {
        await previewContent();
        return '';
      },
      helpString: '预览选中的向量化内容',
    }),
  );

  SlashCommandParser.addCommandObject(
    SlashCommand.fromProps({
      name: 'vec-export',
      callback: async () => {
        await exportVectors();
        return '';
      },
      helpString: '导出向量化内容到文本文件',
    }),
  );

  SlashCommandParser.addCommandObject(
    SlashCommand.fromProps({
      name: 'vec-process',
      callback: async () => {
        await vectorizeContent();
        return '';
      },
      helpString: '处理并向量化选中的内容',
    }),
  );

  // 调试函数注册 - 已注释掉用于生产环境
  /*
  registerDebugFunction('purge-vectors', '清除所有向量', '删除当前聊天的所有向量数据', async () => {
    const chatId = getCurrentChatId();
    if (!chatId) {
      toastr.error('未选择聊天');
      return;
    }
    if (await purgeVectorIndex(chatId)) {
      toastr.success('向量已清除');
    }
  });

  registerDebugFunction('check-vectors', '检查向量状态', '检查当前聊天的向量任务和数据状态', async () => {
    await debugVectorStatus();
  });

  // 注册隐藏消息调试函数
  registerDebugFunction('debug-hidden-messages', '调试隐藏消息', '探索消息隐藏机制', debugHiddenMessages);
  registerDebugFunction('debug-slash-commands', '调试斜杠命令', '测试斜杠命令执行', debugSlashCommands);
  registerDebugFunction('debug-content-selection', '调试内容选择', '显示当前内容选择状态', debugContentSelection);
  registerDebugFunction('clear-world-info-selection', '清除世界信息选择', '清除所有世界信息选择状态', clearWorldInfoSelection);
  registerDebugFunction('debug-file-overlap', '调试文件重复检测', '深度分析文件重复检测逻辑', debugFileOverlap);
  registerDebugFunction('debug-ui-sync', '调试UI同步', '检查UI与设置的同步状态', debugUiSync);
  registerDebugFunction('cleanup-selections', '清理无效选择', '主动清理所有无效的文件和世界信息选择', async () => {
    await cleanupInvalidSelections();
    toastr.success('选择清理完成，详情见控制台');
  });
  registerDebugFunction('deep-world-info-debug', '深度世界信息调试', '深度分析世界信息状态和来源', debugWorldInfoDeep);
  */

  // 内容过滤黑名单设置
  $('#vectors_enhanced_content_blacklist').on('input', function () {
    const blacklistText = $(this).val();
    settings.content_blacklist = blacklistText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line);
    Object.assign(extension_settings.vectors_enhanced, settings);
    saveSettingsDebounced();
  });

  // 内容过滤黑名单UI初始化
  $('#vectors_enhanced_content_blacklist').val(
    Array.isArray(settings.content_blacklist) ? settings.content_blacklist.join('\n') : '',
  );

  // 隐藏消息管理按钮事件处理器
  $('#vectors_enhanced_hide_range').on('click', async () => {
    const start = Number($('#vectors_enhanced_chat_start').val()) || 0;
    const end = Number($('#vectors_enhanced_chat_end').val()) || -1;
    await toggleMessageRangeVisibility(start, end, true);
    updateHiddenMessagesInfo();
  });

  $('#vectors_enhanced_unhide_range').on('click', async () => {
    const start = Number($('#vectors_enhanced_chat_start').val()) || 0;
    const end = Number($('#vectors_enhanced_chat_end').val()) || -1;
    await toggleMessageRangeVisibility(start, end, false);
    updateHiddenMessagesInfo();
  });

  $('#vectors_enhanced_show_hidden').on('click', async () => {
    await showHiddenMessages();
  });

  // 标签示例按钮事件
  $('#vectors_enhanced_tag_examples').on('click', async () => {
    await showTagExamples();
  });

  // 初始化隐藏消息信息显示
  updateHiddenMessagesInfo();

  // 调试按钮事件处理器 - 已注释用于生产环境
  /*
  $('#vectors_debug_world_info').on('click', async () => {
    await debugWorldInfoDeep();
  });

  $('#vectors_debug_ui_sync').on('click', () => {
    debugUiSync();
  });

  $('#vectors_cleanup_selections').on('click', async () => {
    await cleanupInvalidSelections();
    toastr.success('选择清理完成，详情见控制台');
  });

  $('#vectors_debug_content').on('click', () => {
    debugContentSelection();
  });

  $('#vectors_debug_file_overlap').on('click', () => {
    debugFileOverlap();
  });

  $('#vectors_clear_world_info').on('click', async () => {
    await clearWorldInfoSelection();
  });
  */

  // 监听聊天变化以更新隐藏消息信息
  eventSource.on(event_types.CHAT_CHANGED, () => {
    updateHiddenMessagesInfo();
  });

  // 初始化调试模块（如果启用）- 不阻塞主初始化
  initializeDebugModule().catch(err => {
    console.debug('[Vectors] Debug module initialization failed (this is normal in production):', err.message);
  });
});

/**
 * 初始化调试模块
 * 根据环境条件动态加载调试功能
 */
async function initializeDebugModule() {
  try {
    // 检查是否应该加载调试模块
    const shouldLoadDebug = (
      window.location.hostname === 'localhost' ||
      window.location.search.includes('debug=true') ||
      localStorage.getItem('vectors_debug_enabled') === 'true'
    );
    
    if (!shouldLoadDebug) {
      console.debug('[Vectors] Debug module not loaded (not in debug environment)');
      return;
    }
    
    console.log('[Vectors] Loading debug module...');
    
    // 动态导入调试模块
    const { createDebugger } = await import('./debug/debugger.js');
    
    // 创建API接口对象
    const debugAPI = createDebugAPI();
    
    // 创建并初始化调试器
    const debuggerInstance = await createDebugger(debugAPI);
    
    console.log('[Vectors] Debug module loaded successfully');
    
  } catch (error) {
    console.warn('[Vectors] Failed to load debug module (this is normal in production):', error.message);
  }
}

/**
 * 创建调试API接口
 * 为调试模块提供访问主插件功能的接口
 */
function createDebugAPI() {
  return {
    // jQuery 访问
    jQuery: $,
    
    // 设置管理
    getSettings: () => settings,
    extension_settings: extension_settings,
    saveSettingsDebounced: saveSettingsDebounced,
    
    // 聊天管理
    getCurrentChatId: getCurrentChatId,
    getChatTasks: getChatTasks,
    
    // 内容访问
    getSortedEntries: getSortedEntries,
    getHiddenMessages: getHiddenMessages,
    
    // 核心功能
    cleanupInvalidSelections: cleanupInvalidSelections,
    updateWorldInfoList: updateWorldInfoList,
    updateTaskList: updateTaskList,
    analyzeTaskOverlap: analyzeTaskOverlap,
    
    // UI更新
    updateMasterSwitchState: updateMasterSwitchState,
    updateChatSettings: updateChatSettings,
    updateFileList: updateFileList,
    updateHiddenMessagesInfo: updateHiddenMessagesInfo,
    
    // 消息管理
    toggleMessageVisibility: toggleMessageVisibility,
    toggleMessageRangeVisibility: toggleMessageRangeVisibility,
    
    // 向量操作（如果可用）
    getSavedHashes: typeof getSavedHashes !== 'undefined' ? getSavedHashes : null,
    purgeVectorIndex: typeof purgeVectorIndex !== 'undefined' ? purgeVectorIndex : null,
    
    // 缓存访问（只读）
    cachedVectors: cachedVectors,
    
    // 通知系统
    toastr: typeof toastr !== 'undefined' ? toastr : null,
    
    // 事件系统
    eventSource: eventSource,
    event_types: event_types,
    
    // 调试注册（如果可用）
    registerDebugFunction: typeof registerDebugFunction !== 'undefined' ? registerDebugFunction : null,
    
    // 上下文访问
    getContext: getContext,
    
    // 工具函数
    generateTaskId: generateTaskId,
    extractTagContent: extractTagContent,
    
    // 模块信息
    MODULE_NAME: MODULE_NAME,
    EXTENSION_PROMPT_TAG: EXTENSION_PROMPT_TAG
  };
}

/*
// === 调试函数区域 - 已注释掉用于生产环境 ===

/**
 * 调试函数：检查向量状态
 */
/*
async function debugVectorStatus() {
  console.log('=== 向量状态调试 ===');
  
  const chatId = getCurrentChatId();
  if (!chatId) {
    console.log('错误：未选择聊天');
    toastr.error('未选择聊天');
    return;
  }
  
  console.log(`当前聊天ID: ${chatId}`);
  
  // 检查任务列表
  const allTasks = getChatTasks(chatId);
  const enabledTasks = allTasks.filter(t => t.enabled);
  
  console.log(`总任务数: ${allTasks.length}, 启用任务数: ${enabledTasks.length}`);
  
  allTasks.forEach((task, index) => {
    console.log(`任务 ${index + 1}:`);
    console.log(`  - 名称: ${task.name}`);
    console.log(`  - ID: ${task.taskId}`);
    console.log(`  - 启用: ${task.enabled}`);
    console.log(`  - 时间: ${new Date(task.timestamp).toLocaleString()}`);
    console.log(`  - Collection ID: ${chatId}_${task.taskId}`);
  });
  
  // 检查向量数据
  for (const task of allTasks) {
    const collectionId = `${chatId}_${task.taskId}`;
    try {
      console.log(`\n检查集合: ${collectionId}`);
      const hashes = await getSavedHashes(collectionId);
      console.log(`  - 向量数量: ${hashes.length}`);
      if (hashes.length > 0) {
        console.log(`  - 样本哈希: ${hashes.slice(0, 3).join(', ')}${hashes.length > 3 ? '...' : ''}`);
      }
    } catch (error) {
      console.log(`  - 错误: ${error.message}`);
    }
  }
  
  // 检查缓存
  console.log(`\n缓存状态:`);
  console.log(`  - 缓存项数量: ${cachedVectors.size}`);
  for (const [key, value] of cachedVectors.entries()) {
    console.log(`  - ${key}: ${value.items?.length || 0} 个项目, 时间: ${new Date(value.timestamp).toLocaleString()}`);
  }
  
  console.log('=== 调试完成 ===');
  
  toastr.info(`任务: ${allTasks.length}个 (${enabledTasks.length}个启用), 详情见控制台`, '向量状态检查');
}
*/

/**
 * 调试函数：探索消息隐藏机制
 */
/*
function debugHiddenMessages() {
  const context = getContext();
  if (!context.chat || context.chat.length === 0) {
    console.log('调试：没有可用的聊天消息');
    return;
  }

  console.log('=== 开始探索消息隐藏机制 ===');
  console.log(`总消息数: ${context.chat.length}`);

  // 检查前5条消息的完整结构
  console.log('\n前5条消息的完整结构:');
  context.chat.slice(0, 5).forEach((msg, index) => {
    console.log(`\n消息 #${index}:`, msg);

    // 检查可能的隐藏属性
    const possibleHiddenProps = ['hidden', 'is_hidden', 'hide', 'isHidden', 'visible', 'is_visible'];
    console.log(`检查可能的隐藏属性:`);
    possibleHiddenProps.forEach(prop => {
      if (prop in msg) {
        console.log(`  - ${prop}: ${msg[prop]}`);
      }
    });

    // 检查 extra 对象
    if (msg.extra) {
      console.log(`  extra 对象:`, msg.extra);
    }
  });

  console.log('\n=== 探索结束 ===');
}
*/

/**
 * 调试函数：测试斜杠命令执行
 * @returns {Promise<void>}
 */
/*
async function debugSlashCommands() {
  console.log('=== 测试斜杠命令执行 ===');

  try {
    // 检查可能的命令执行方法
    const context = getContext();
    console.log('\n检查上下文对象:', context);

    // 方法1：直接修改消息的 is_system 属性
    if (context.chat && context.chat.length > 0) {
      console.log('\n测试直接修改消息属性:');
      const testMessage = context.chat[0];
      console.log('第一条消息的 is_system 状态:', testMessage.is_system);
      console.log('可以通过修改 is_system 属性来隐藏/显示消息');
    }

    // 方法2：查看全局函数
    const globalFunctions = Object.keys(window).filter(
      key => key.includes('hide') || key.includes('slash') || key.includes('command'),
    );
    console.log('\n相关的全局函数:', globalFunctions);

    // 方法3：检查 jQuery 事件
    console.log('\n检查消息元素的事件处理器...');
    const messageElement = $('.mes').first();
    if (messageElement.length > 0) {
      const events = $._data(messageElement[0], 'events');
      console.log('消息元素的事件:', events);
    }
  } catch (error) {
    console.error('调试斜杠命令时出错:', error);
  }

  console.log('=== 测试结束 ===');
}
*/

/**
 * 调试函数：显示当前内容选择状态
 */
/*
function debugContentSelection() {
  console.log('=== 内容选择状态调试 ===');
  
  console.log('全局设置状态:', {
    master_enabled: settings.master_enabled,
    selected_content: settings.selected_content
  });
  
  // 调试聊天设置
  const chatSettings = settings.selected_content.chat;
  console.log('聊天记录设置:', {
    enabled: chatSettings.enabled,
    range: chatSettings.range,
    types: chatSettings.types,
    tags: chatSettings.tags,
    include_hidden: chatSettings.include_hidden
  });
  
  // 调试文件设置
  const filesSettings = settings.selected_content.files;
  console.log('文件设置:', {
    enabled: filesSettings.enabled,
    selected_count: filesSettings.selected.length,
    selected_files: filesSettings.selected
  });
  
  // 调试世界信息设置
  const wiSettings = settings.selected_content.world_info;
  console.log('世界信息设置:', {
    enabled: wiSettings.enabled,
    selected_worlds: Object.keys(wiSettings.selected),
    total_entries: Object.values(wiSettings.selected).flat().length,
    detailed_selection: wiSettings.selected
  });
  
  // 调试UI元素状态
  console.log('UI元素状态:');
  console.log('- 聊天启用复选框:', $('#vectors_enhanced_chat_enabled').prop('checked'));
  console.log('- 文件启用复选框:', $('#vectors_enhanced_files_enabled').prop('checked'));
  console.log('- 世界信息启用复选框:', $('#vectors_enhanced_wi_enabled').prop('checked'));
  
  // 调试隐藏消息
  const hiddenMessages = getHiddenMessages();
  console.log('隐藏消息状态:', {
    count: hiddenMessages.length,
    messages: hiddenMessages
  });
  
  console.log('=== 调试完成 ===');
  
  toastr.info(`内容选择状态已输出到控制台\n聊天:${chatSettings.enabled}, 文件:${filesSettings.enabled}, 世界信息:${wiSettings.enabled}`, '内容选择调试');
}
*/

/**
 * 调试函数：清除所有世界信息选择状态
 */
/*
async function clearWorldInfoSelection() {
  console.log('=== 清除世界信息选择 ===');
  
  const beforeState = JSON.stringify(settings.selected_content.world_info.selected);
  console.log('清除前的选择状态:', beforeState);
  
  // 清除所有世界信息选择
  settings.selected_content.world_info.selected = {};
  settings.selected_content.world_info.enabled = false;
  
  // 保存设置
  Object.assign(extension_settings.vectors_enhanced, settings);
  saveSettingsDebounced();
  
  // 更新UI
  $('#vectors_enhanced_wi_enabled').prop('checked', false);
  updateContentSelection();
  await updateWorldInfoList();
  
  console.log('清除后的选择状态:', JSON.stringify(settings.selected_content.world_info.selected));
  console.log('=== 清除完成 ===');
  
  toastr.success('已清除所有世界信息选择状态', '清除完成');
}
*/

/**
 * 调试函数：深度分析文件重复检测逻辑
 */
/*
function debugFileOverlap() {
  console.log('=== 文件重复检测深度调试 ===');
  
  const chatId = getCurrentChatId();
  if (!chatId) {
    console.log('错误：未选择聊天');
    toastr.error('未选择聊天');
    return;
  }
  
  // 获取当前设置
  const currentSettings = settings.selected_content;
  console.log('当前文件选择设置:', {
    enabled: currentSettings.files.enabled,
    selected: currentSettings.files.selected,
    selectedCount: currentSettings.files.selected.length
  });
  
  // 获取所有任务
  const allTasks = getChatTasks(chatId);
  const enabledTasks = allTasks.filter(t => t.enabled);
  
  console.log('任务状态:', {
    totalTasks: allTasks.length,
    enabledTasks: enabledTasks.length
  });
  
  // 详细分析每个任务的文件
  enabledTasks.forEach((task, index) => {
    console.log(`\\n任务 ${index + 1}: "${task.name}"`);
    console.log('- ID:', task.taskId);
    console.log('- 文件设置:', task.settings?.files);
    if (task.settings?.files?.enabled && task.settings.files.selected) {
      console.log('- 文件列表:', task.settings.files.selected);
      console.log('- 文件数量:', task.settings.files.selected.length);
    } else {
      console.log('- 没有文件或文件未启用');
    }
  });
  
  // 运行重复检测分析
  console.log('\\n=== 运行重复检测分析 ===');
  if (currentSettings.files.enabled && currentSettings.files.selected.length > 0) {
    const overlapAnalysis = analyzeTaskOverlap(chatId, currentSettings);
    console.log('重复检测结果:', overlapAnalysis);
    
    // 手动验证
    console.log('\\n=== 手动验证 ===');
    const existingFiles = new Set();
    enabledTasks.forEach(task => {
      if (task.settings?.files?.enabled && task.settings.files.selected) {
        task.settings.files.selected.forEach(url => {
          console.log(`文件 "${url}" 来自任务 "${task.name}"`);
          existingFiles.add(url);
        });
      }
    });
    
    console.log('所有现有文件URL:', Array.from(existingFiles));
    console.log('当前选择的文件URL:', currentSettings.files.selected);
    
    const actualDuplicates = currentSettings.files.selected.filter(url => existingFiles.has(url));
    const actualNew = currentSettings.files.selected.filter(url => !existingFiles.has(url));
    
    console.log('实际重复文件:', actualDuplicates);
    console.log('实际新文件:', actualNew);
    console.log('重复数量验证:', actualDuplicates.length);
  } else {
    console.log('当前未启用文件或未选择文件');
  }
  
  console.log('=== 调试完成 ===');
  
  toastr.info('文件重复检测调试信息已输出到控制台', '调试完成');
}
*/

/**
 * 调试函数：检查UI与设置的同步状态
 */
/*
function debugUiSync() {
  console.log('=== UI同步状态调试 ===');
  
  // 检查文件UI状态
  console.log('\\n=== 文件选择状态 ===');
  console.log('设置中的文件选择:', {
    enabled: settings.selected_content.files.enabled,
    selected: settings.selected_content.files.selected,
    count: settings.selected_content.files.selected.length
  });
  
  // 检查UI中实际勾选的文件
  const checkedFiles = [];
  $('#vectors_enhanced_files_list input[type="checkbox"]:checked').each(function() {
    checkedFiles.push($(this).val());
  });
  
  console.log('UI中勾选的文件:', {
    checkedFiles,
    count: checkedFiles.length
  });
  
  // 比较差异
  const settingsSet = new Set(settings.selected_content.files.selected);
  const uiSet = new Set(checkedFiles);
  
  const onlyInSettings = settings.selected_content.files.selected.filter(url => !uiSet.has(url));
  const onlyInUI = checkedFiles.filter(url => !settingsSet.has(url));
  
  console.log('同步状态分析:', {
    isSync: onlyInSettings.length === 0 && onlyInUI.length === 0,
    onlyInSettings: onlyInSettings,
    onlyInUI: onlyInUI
  });
  
  // 检查世界信息状态
  console.log('\\n=== 世界信息选择状态 ===');
  console.log('设置中的世界信息选择:', {
    enabled: settings.selected_content.world_info.enabled,
    selected: settings.selected_content.world_info.selected,
    totalCount: Object.values(settings.selected_content.world_info.selected).flat().length
  });
  
  const checkedWI = [];
  $('#vectors_enhanced_wi_list input[type="checkbox"]:checked').each(function() {
    if (!$(this).hasClass('world-select-all')) {
      checkedWI.push($(this).val());
    }
  });
  
  console.log('UI中勾选的世界信息:', {
    checkedWI,
    count: checkedWI.length
  });
  
  // 比较世界信息差异
  const settingsWI = Object.values(settings.selected_content.world_info.selected).flat();
  const settingsWISet = new Set(settingsWI);
  const uiWISet = new Set(checkedWI);
  
  const onlyInSettingsWI = settingsWI.filter(uid => !uiWISet.has(uid));
  const onlyInUIWI = checkedWI.filter(uid => !settingsWISet.has(uid));
  
  console.log('世界信息同步状态:', {
    isSync: onlyInSettingsWI.length === 0 && onlyInUIWI.length === 0,
    onlyInSettings: onlyInSettingsWI,
    onlyInUI: onlyInUIWI,
    settingsCount: settingsWI.length,
    uiCount: checkedWI.length
  });
  
  // 检查聊天设置
  console.log('\\n=== 聊天设置状态 ===');
  console.log('设置中的聊天配置:', settings.selected_content.chat);
  console.log('UI中的聊天配置:', {
    enabled: $('#vectors_enhanced_chat_enabled').prop('checked'),
    start: $('#vectors_enhanced_chat_start').val(),
    end: $('#vectors_enhanced_chat_end').val(),
    user: $('#vectors_enhanced_chat_user').prop('checked'),
    assistant: $('#vectors_enhanced_chat_assistant').prop('checked'),
    include_hidden: $('#vectors_enhanced_chat_include_hidden').prop('checked'),
    tags: $('#vectors_enhanced_chat_tags').val()
  });
  
  console.log('=== 调试完成 ===');
  
  const syncIssues = onlyInSettings.length + onlyInUI.length + onlyInSettingsWI.length + onlyInUIWI.length;
  toastr.info(`UI同步检查完成，发现 ${syncIssues} 个不同步项目，详情见控制台`, 'UI同步调试');
}
*/

/**
 * 调试函数：深度分析世界信息状态和来源
 */
/*
async function debugWorldInfoDeep() {
  console.log('=== 深度世界信息调试 ===');
  
  const chatId = getCurrentChatId();
  console.log('当前聊天ID:', chatId);
  
  // 获取所有世界信息条目
  const allEntries = await getSortedEntries();
  console.log(`\\n总共获取到 ${allEntries.length} 个世界信息条目`);
  
  // 按来源分组分析
  const sourceAnalysis = {
    global: [],
    character: [],
    chat: [],
    other: []
  };
  
  allEntries.forEach(entry => {
    // 分析条目来源（这个可能需要根据实际的world-info.js实现调整）
    if (entry.world) {
      // 简单的启发式分类
      if (entry.world.includes('global') || entry.world === 'global') {
        sourceAnalysis.global.push(entry);
      } else if (entry.world.includes('character') || entry.world.includes('角色')) {
        sourceAnalysis.character.push(entry);
      } else if (entry.world.includes('chat') || entry.world.includes('聊天')) {
        sourceAnalysis.chat.push(entry);
      } else {
        sourceAnalysis.other.push(entry);
      }
    }
  });
  
  console.log('\\n=== 按来源分析 ===');
  Object.entries(sourceAnalysis).forEach(([source, entries]) => {
    console.log(`${source.toUpperCase()}: ${entries.length} 个条目`);
    entries.forEach(entry => {
      console.log(`  - ${entry.world}: ${entry.comment || entry.uid} (disabled: ${entry.disable})`);
    });
  });
  
  // 分析所有世界
  const worldGroups = {};
  allEntries.forEach(entry => {
    if (!worldGroups[entry.world]) {
      worldGroups[entry.world] = [];
    }
    worldGroups[entry.world].push(entry);
  });
  
  console.log('\\n=== 按世界分组 ===');
  Object.entries(worldGroups).forEach(([world, entries]) => {
    const enabledCount = entries.filter(e => !e.disable).length;
    const totalCount = entries.length;
    console.log(`${world}: ${enabledCount}/${totalCount} 个启用条目`);
    
    entries.forEach(entry => {
      const status = entry.disable ? '❌禁用' : '✅启用';
      const hasContent = entry.content ? '有内容' : '❌无内容';
      console.log(`  - ${status} ${hasContent} ${entry.comment || entry.uid}`);
    });
  });
  
  // 分析当前设置
  console.log('\\n=== 当前设置分析 ===');
  console.log('设置中的世界信息选择:', settings.selected_content.world_info.selected);
  
  Object.entries(settings.selected_content.world_info.selected).forEach(([world, uids]) => {
    console.log(`\\n世界 "${world}": 选择了 ${uids.length} 个条目`);
    
    uids.forEach(uid => {
      const entry = allEntries.find(e => e.uid === uid);
      if (entry) {
        const status = entry.disable ? '❌禁用' : '✅启用';
        const hasContent = entry.content ? '有内容' : '❌无内容';
        console.log(`  - ${status} ${hasContent} ${entry.comment || uid} (UID: ${uid})`);
      } else {
        console.log(`  - ❌不存在 UID: ${uid}`);
      }
    });
  });
  
  // 分析UI显示的内容
  console.log('\\n=== UI显示分析 ===');
  const visibleWorlds = new Set();
  $('#vectors_enhanced_wi_list .wi-world-group').each(function() {
    const worldName = $(this).find('.wi-world-name').text();
    visibleWorlds.add(worldName);
  });
  
  console.log('UI中显示的世界:', Array.from(visibleWorlds));
  
  // 找出差异
  const settingsWorlds = new Set(Object.keys(settings.selected_content.world_info.selected));
  const onlyInSettings = Array.from(settingsWorlds).filter(w => !visibleWorlds.has(w));
  const onlyInUI = Array.from(visibleWorlds).filter(w => !settingsWorlds.has(w));
  
  console.log('\\n=== 差异分析 ===');
  console.log('只在设置中存在的世界:', onlyInSettings);
  console.log('只在UI中显示的世界:', onlyInUI);
  
  console.log('=== 调试完成 ===');
  
  toastr.info('深度世界信息调试完成，详情见控制台', '调试完成');
}

// === 调试函数区域结束 ===
*/

/**
 * 显示当前隐藏的消息列表
 * @returns {Promise<void>}
 */
async function showHiddenMessages() {
  const hidden = getHiddenMessages();

  if (hidden.length === 0) {
    await callGenericPopup('当前没有隐藏的消息', POPUP_TYPE.TEXT, '', { okButton: '关闭' });
    return;
  }

  // 计算隐藏消息的楼层范围
  const indexes = hidden.map(msg => msg.index).sort((a, b) => a - b);
  const ranges = [];
  let start = indexes[0];
  let end = indexes[0];

  for (let i = 1; i < indexes.length; i++) {
    if (indexes[i] === end + 1) {
      end = indexes[i];
    } else {
      ranges.push(start === end ? `第${start}层` : `第${start}-${end}层`);
      start = end = indexes[i];
    }
  }
  ranges.push(start === end ? `第${start}层` : `第${start}-${end}层`);

  const rangeText = ranges.join('，');

  let html = '<div class="hidden-messages-popup">';
  html += `<h3 style="color: var(--SmartThemeQuoteColor); margin-bottom: 1rem; font-size: 1.2em; text-align: left;">已隐藏楼层：${rangeText}</h3>`;
  html +=
    '<div class="hidden-messages-all-content" style="max-height: 60vh; overflow-y: auto; padding: 1rem; background-color: var(--SmartThemeBlurTintColor); border-radius: 6px; text-align: left; white-space: pre-wrap; word-break: break-word;">';

  // 按索引排序并显示所有隐藏消息
  hidden
    .sort((a, b) => a.index - b.index)
    .forEach((msg, idx) => {
      const msgType = msg.is_user ? '用户' : 'AI';
      html += `<span style="color: var(--SmartThemeQuoteColor); font-weight: bold;">#${msg.index} - ${msgType}（${msg.name}）：</span>\n${msg.text}\n\n`;
    });

  html += '</div></div>';

  await callGenericPopup(html, POPUP_TYPE.TEXT, '', {
    okButton: '关闭',
    wide: true,
    large: true,
  });
}

/**
 * 显示标签提取示例
 * @returns {Promise<void>}
 */
async function showTagExamples() {
  try {
    // 读取标签提取示例文件
    const response = await fetch('/scripts/extensions/third-party/vectors-enhanced/标签提取示例.md');
    if (!response.ok) {
      throw new Error('无法加载标签示例文件');
    }
    
    const rawContent = await response.text();
    const content = rawContent
      // 首先清理整个文件的末尾空白和奇怪字符
      .replace(/\s+$/, '')        // 去除文件末尾所有空白
      .replace(/[^\x00-\x7F\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g, ''); // 保留ASCII、中文、标点
    
    // HTML转义函数
    function escapeHtml(text) {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
    
    // 将Markdown转换为HTML  
    // 先用占位符保护代码块
    const codeBlocks = [];
    let htmlContent = content
      // 保护代码块：用占位符替换，避免被后续处理影响
      .replace(/```html\n([\s\S]*?)\n```/g, (match, code) => {
        const cleanCode = code.trim()
          .split('\n')
          .filter(line => line.trim().length > 0)
          .map(line => line.replace(/^\s+/, '').replace(/\s+$/, ''))
          .join('\n');
        const placeholder = `__CODEBLOCK_HTML_${codeBlocks.length}__`;
        codeBlocks.push(`<pre style="background: var(--SmartThemeBlurTintColor); padding: 1.2rem; margin: 1.5rem 0; border-radius: 6px; overflow-x: auto; border: 1px solid var(--SmartThemeQuoteColor); white-space: pre;"><code style="font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 0.9em; line-height: 1.4;">${escapeHtml(cleanCode)}</code></pre>`);
        return placeholder;
      })
      .replace(/```\n([\s\S]*?)\n```/g, (match, code) => {
        const cleanCode = code.trim()
          .split('\n')
          .filter(line => line.trim().length > 0)
          .map(line => line.replace(/^\s+/, '').replace(/\s+$/, ''))
          .join('\n');
        const placeholder = `__CODEBLOCK_${codeBlocks.length}__`;
        codeBlocks.push(`<pre style="background: var(--SmartThemeBlurTintColor); padding: 1.2rem; margin: 1.5rem 0; border-radius: 6px; overflow-x: auto; border: 1px solid var(--SmartThemeEmColor); white-space: pre;"><code style="font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 0.9em; line-height: 1.4;">${escapeHtml(cleanCode)}</code></pre>`);
        return placeholder;
      })
      // 处理行内代码
      .replace(/`([^`]+)`/g, (match, code) => {
        return `<code style="background: var(--SmartThemeBlurTintColor); padding: 0.3rem 0.5rem; border-radius: 4px; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 0.9em; border: 1px solid var(--SmartThemeQuoteColor);">${escapeHtml(code)}</code>`;
      })
      // 处理标题
      .replace(/^# (.*)/gm, '<h1 style="color: var(--SmartThemeQuoteColor); margin: 2rem 0 1.5rem 0; font-size: 1.8em; border-bottom: 2px solid var(--SmartThemeQuoteColor); padding-bottom: 0.5rem;"><i class="fa-solid fa-bookmark"></i> $1</h1>')
      .replace(/^## (.*)/gm, '<h2 style="color: var(--SmartThemeQuoteColor); margin: 2rem 0 1rem 0; font-size: 1.4em; border-left: 4px solid var(--SmartThemeQuoteColor); padding-left: 1rem;">$1</h2>')
      .replace(/^### (.*)/gm, '<h3 style="color: var(--SmartThemeEmColor); margin: 1.5rem 0 0.8rem 0; font-size: 1.2em;">$1</h3>')
      // 处理粗体和斜体
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--SmartThemeQuoteColor);">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em style="color: var(--SmartThemeEmColor);">$1</em>')
      // 处理列表
      .replace(/^- (.*)/gm, '<li style="margin: 0.5rem 0; padding-left: 0.5rem;">$1</li>')
      .replace(/^\d+\. (.*)/gm, '<li style="margin: 0.5rem 0; padding-left: 0.5rem;">$1</li>')
      // 处理段落（排除占位符）
      .replace(/\n\n+/g, '</p><p style="margin: 1rem 0; line-height: 1.6;">')
      .replace(/^(?!<[h123]|<pre|<li|__CODEBLOCK)(.+)$/gm, '<p style="margin: 1rem 0; line-height: 1.6;">$1</p>');

    // 后处理：包装列表并温和清理HTML
    htmlContent = htmlContent
      // 包装列表项为ul标签
      .replace(/(<li[^>]*>.*?<\/li>)(\s*<li[^>]*>.*?<\/li>)*/gs, '<ul style="margin: 1rem 0; padding-left: 1.5rem;">$&</ul>')
      // 温和清理，避免破坏内容
      .replace(/<p[^>]*>\s*<\/p>/g, '')           // 删除空段落
      .replace(/>\s*\n\s*</g, '><')               // 只删除标签间的换行，保留空格
      .replace(/\n{3,}/g, '\n\n')                 // 最多保留双换行
      .trim();

    // 最后恢复代码块占位符
    codeBlocks.forEach((codeBlock, index) => {
      htmlContent = htmlContent
        .replace(`__CODEBLOCK_HTML_${index}__`, codeBlock)
        .replace(`__CODEBLOCK_${index}__`, codeBlock);
    });
    
    const html = `
      <div class="tag-examples-popup" style="
        max-height: 75vh; 
        overflow-y: auto; 
        text-align: left; 
        line-height: 1.7;
        font-size: 1em;
        padding: 1.5rem;
        background: #1a1a1a;
        color: #e0e0e0;
        border-radius: 8px;
      ">
        <div style="
          background: linear-gradient(135deg, var(--SmartThemeQuoteColor), var(--SmartThemeEmColor));
          color: white;
          padding: 1rem 1.5rem;
          margin: -1.5rem -1.5rem 1.5rem -1.5rem;
          border-radius: 8px 8px 0 0;
          text-align: center;
          font-size: 1.2em;
          font-weight: bold;
        ">
          <i class="fa-solid fa-lightbulb"></i> 标签提取功能使用指南
        </div>
        ${htmlContent}
      </div>
    `;
    
    await callGenericPopup(html, POPUP_TYPE.TEXT, '', {
      okButton: '关闭',
      wide: true,
      large: true,
    });
    
  } catch (error) {
    console.error('显示标签示例失败:', error);
    toastr.error('无法加载标签示例: ' + error.message);
  }
}

/**
 * 更新隐藏消息信息显示
 */
function updateHiddenMessagesInfo() {
  const hidden = getHiddenMessages();
  const infoDiv = $('#vectors_enhanced_hidden_info');
  const countSpan = $('#vectors_enhanced_hidden_count');
  const listDiv = $('#vectors_enhanced_hidden_list');

  if (hidden.length > 0) {
    infoDiv.show();
    listDiv.empty();

    // 计算隐藏消息的楼层范围
    const indexes = hidden.map(msg => msg.index).sort((a, b) => a - b);
    const ranges = [];
    let start = indexes[0];
    let end = indexes[0];

    for (let i = 1; i < indexes.length; i++) {
      if (indexes[i] === end + 1) {
        end = indexes[i];
      } else {
        ranges.push(start === end ? `第${start}层` : `第${start}-${end}层`);
        start = end = indexes[i];
      }
    }
    ranges.push(start === end ? `第${start}层` : `第${start}-${end}层`);

    const rangeText = ranges.join('，');
    countSpan.text(rangeText);
  } else {
    infoDiv.hide();
    countSpan.text('0');
  }
}

/**
 * 切换消息的隐藏状态
 * @param {number} messageIndex 消息索引
 * @param {boolean} hide 是否隐藏
 * @returns {Promise<boolean>} 是否成功
 */
async function toggleMessageVisibility(messageIndex, hide) {
  const context = getContext();
  if (!context.chat || messageIndex < 0 || messageIndex >= context.chat.length) {
    console.error('无效的消息索引:', messageIndex);
    return false;
  }

  try {
    // 修改消息的 is_system 属性
    context.chat[messageIndex].is_system = hide;

    // 触发保存
    await context.saveChat();

    // 刷新界面
    await context.reloadCurrentChat();

    return true;
  } catch (error) {
    console.error('切换消息可见性失败:', error);
    return false;
  }
}

/**
 * 批量切换消息范围的隐藏状态
 * @param {number} startIndex 开始索引
 * @param {number} endIndex 结束索引（不包含）
 * @param {boolean} hide 是否隐藏
 * @returns {Promise<void>}
 */
async function toggleMessageRangeVisibility(startIndex, endIndex, hide) {
  const context = getContext();
  if (!context.chat) {
    toastr.error('没有可用的聊天记录');
    return;
  }

  const start = Math.max(0, startIndex);
  const end = Math.min(context.chat.length, endIndex === -1 ? context.chat.length : endIndex);

  if (start >= end) {
    toastr.error('无效的消息范围');
    return;
  }

  try {
    // 批量修改消息的 is_system 属性
    for (let i = start; i < end; i++) {
      context.chat[i].is_system = hide;
    }

    // 触发保存
    await context.saveChat();

    // 刷新界面
    await context.reloadCurrentChat();

    const action = hide ? '隐藏' : '显示';
    toastr.success(`已${action}消息 #${start} 到 #${end - 1}`);
  } catch (error) {
    console.error('批量切换消息可见性失败:', error);
    toastr.error('操作失败');
  }
}

/**
 * 获取当前隐藏的消息列表
 * @returns {Array} 隐藏消息数组
 */
function getHiddenMessages() {
  const context = getContext();
  if (!context.chat) return [];

  const hidden = [];
  context.chat.forEach((msg, index) => {
    if (msg.is_system === true) {
      hidden.push({
        index: index,
        text: msg.mes ? msg.mes.substring(0, 100) + (msg.mes.length > 100 ? '...' : '') : '',
        is_user: msg.is_user,
        name: msg.name,
      });
    }
  });

  return hidden;
}
