// @ts-nocheck
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
  waitUntilCondition,
} from '../../../utils.js';
import { getSortedEntries } from '../../../world-info.js';
import { splitTextIntoChunks as splitTextIntoChunksUtil } from './src/utils/textChunking.js';
import { shouldSkipContent } from './src/utils/contentFilter.js';
import { extractTagContent, extractSimpleTag, extractComplexTag, extractHtmlFormatTag } from './src/utils/tagExtractor.js';
import { scanTextForTags, generateTagSuggestions } from './src/utils/tagScanner.js';
import { updateContentSelection as updateContentSelectionNew, updateMasterSwitchState as updateMasterSwitchStateNew, toggleSettings as toggleSettingsNew, hideProgress as hideProgressNew, updateProgress as updateProgressNew, triggerDownload } from './src/ui/domUtils.js';
import { SettingsManager } from './src/ui/settingsManager.js';
import { ConfigManager } from './src/infrastructure/ConfigManager.js';
import { updateChatSettings } from './src/ui/components/ChatSettings.js';
import { renderTagRulesUI } from './src/ui/components/TagRulesEditor.js';
import { updateTaskList } from './src/ui/components/TaskList.js';
import { updateFileList } from './src/ui/components/FileList.js';
import { updateWorldInfoList } from './src/ui/components/WorldInfoList.js';
import { clearTagSuggestions, displayTagSuggestions, showTagExamples } from './src/ui/components/TagUI.js';
import { MessageUI } from './src/ui/components/MessageUI.js';
import { ActionButtons } from './src/ui/components/ActionButtons.js';
import { SettingsPanel } from './src/ui/components/SettingsPanel.js';
import { VectorizationSettings } from './src/ui/components/VectorizationSettings.js';
import { QuerySettings } from './src/ui/components/QuerySettings.js';
import { InjectionSettings } from './src/ui/components/InjectionSettings.js';
import { ContentSelectionSettings } from './src/ui/components/ContentSelectionSettings.js';
import { ProgressManager } from './src/ui/components/ProgressManager.js';
import { EventManager } from './src/ui/EventManager.js';
import { StateManager } from './src/ui/StateManager.js';
import { getMessages, createVectorItem, getHiddenMessages } from './src/utils/chatUtils.js';
import { StorageAdapter } from './src/infrastructure/storage/StorageAdapter.js';
import { VectorizationAdapter } from './src/infrastructure/api/VectorizationAdapter.js';
import { eventBus } from './src/infrastructure/events/eventBus.instance.js';

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


// Global ActionButtons instance (initialized in jQuery ready)
let globalActionButtons = null;

// Global SettingsPanel instance (initialized in jQuery ready)
let globalSettingsPanel = null;

// Global UI infrastructure instances (initialized in jQuery ready)
let globalProgressManager = null;
let globalEventManager = null;
let globalStateManager = null;
let globalSettingsManager = null;

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
  overlap_percent: 0,
  score_threshold: 0.25,
  force_chunk_delimiter: '',
  lightweight_storage: false, // 大内容轻量化存储模式

  // Query settings
  enabled: true, // 是否启用向量查询
  query_messages: 3, // 查询使用的最近消息数
  max_results: 10, // 返回的最大结果数
  show_query_notification: false, // 是否显示查询结果通知
  detailed_notification: false, // 是否显示详细通知（来源分布）

  // Rerank settings
  rerank_enabled: false,
  rerank_url: 'https://api.siliconflow.cn/v1/rerank',
  rerank_apiKey: '',
  rerank_model: 'Pro/BAAI/bge-reranker-v2-m3',
  rerank_top_n: 20,
  rerank_hybrid_alpha: 0.7, // Rerank score weight
  rerank_success_notify: true, // 是否显示Rerank成功通知

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
      tag_rules: [], // structured tag rules
      include_hidden: false, // 是否包含隐藏消息
    },
    files: { enabled: false, selected: [] },
    world_info: { enabled: false, selected: {} }, // { worldId: [entryIds] }
  },

  // Content filtering
  content_blacklist: [], // Array of keywords to filter out content

  // Vector tasks management
  vector_tasks: {}, // { chatId: [{ taskId, name, timestamp, settings, enabled }] }
  tag_rules_version: 2,

};

const moduleWorker = new ModuleWorkerWrapper(synchronizeChat);
const cachedVectors = new Map(); // Cache for vectorized content
let syncBlocked = false;

// 创建存储适配器实例
let storageAdapter = null;
// 创建向量化适配器实例
let vectorizationAdapter = null;

// 防重复通知机制
let lastNotificationTime = 0;
const NOTIFICATION_COOLDOWN = 5000; // 5秒冷却时间
let lastRerankNotifyTime = 0;

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
  if (!chatId || chatId === 'null' || chatId === 'undefined') {
    console.warn('Vectors: getChatTasks called with invalid chatId:', chatId);
    return [];
  }
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
  if (!chatId || chatId === 'null' || chatId === 'undefined') {
    console.error('Vectors: addVectorTask called with invalid chatId:', chatId);
    return;
  }
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
  if (!chatId || chatId === 'null' || chatId === 'undefined') {
    console.error('Vectors: removeVectorTask called with invalid chatId:', chatId);
    return;
  }
  const tasks = getChatTasks(chatId);
  const index = tasks.findIndex(t => t.taskId === taskId);
  if (index !== -1) {
    // Delete the vector collection
    await storageAdapter.purgeVectorIndex(`${chatId}_${taskId}`);
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
  // Try to generate a smart name as default if we have task data
  let defaultName = currentName;
  const tasks = getChatTasks(chatId);
  const task = tasks.find(t => t.taskId === taskId);

  if (task && task.actualProcessedItems && (task.actualProcessedItems.chat || task.actualProcessedItems.files || task.actualProcessedItems.world_info)) {
    // Import TaskNameGenerator
    const { TaskNameGenerator } = await import('./src/utils/taskNaming.js');

    // Construct items for name generation
    const items = [];

    // Add chat items
    if (task.actualProcessedItems.chat) {
      task.actualProcessedItems.chat.forEach(index => {
        items.push({
          type: 'chat',
          metadata: { index: index, is_user: index % 2 === 1 }
        });
      });
    }

    // Generate smart name as default
    defaultName = TaskNameGenerator.generateSmartName(items, task.settings);
  }

  const newName = await callGenericPopup(
    '请输入新的任务名称：',
    POPUP_TYPE.INPUT,
    defaultName,
    {
      okButton: '确认',
      cancelButton: '取消',
    }
  );

  if (newName && newName.trim() && newName.trim() !== task.name) {
    const taskIndex = tasks.findIndex(t => t.taskId === taskId);

    if (taskIndex !== -1) {
      tasks[taskIndex].name = newName.trim();
      settings.vector_tasks[chatId] = tasks;
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();

      // Refresh the task list UI
      await updateTaskList(getChatTasks, renameVectorTask, removeVectorTask);
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
 * Wrapper function for splitTextIntoChunks to maintain backward compatibility
 * @param {string} text Text to split
 * @param {number} chunkSize Size of each chunk
 * @param {number} overlapPercent Overlap percentage
 * @returns {string[]} Array of text chunks
 */
function splitTextIntoChunks(text, chunkSize, overlapPercent) {
  return splitTextIntoChunksUtil(text, chunkSize, overlapPercent, settings.force_chunk_delimiter);
}

/**
 * Gets all available files from different sources
 * @returns {Map<string, object>} Map of file URL to file object
 */
function getAllAvailableFiles() {
  const fileMap = new Map();
  const context = getContext();

  try {
    // Add files from different sources
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

    // Add files from chat messages
    if (context.chat) {
      context.chat.filter(x => x.extra?.file).forEach(msg => {
        const file = msg.extra.file;
        if (file && file.url) fileMap.set(file.url, file);
      });
    }
  } catch (error) {
    console.error('Vectors: Error getting files:', error);
  }

  return fileMap;
}

/**
 * Parses tag configuration with exclusion syntax
 * @param {string} tagConfig Tag configuration string
 * @returns {object} Object with mainTag and excludeTags
 */


// Note: Content filtering functions have been moved to src/utils/contentFilter.js
// Note: escapeRegex has been moved to src/utils/contentFilter.js

/**
 * Gets all raw content for scanning, bypassing tag extraction rules.
 * @returns {Promise<VectorItem[]>} Array of vector items with raw text
 */
async function getRawContentForScanning() {
  const items = [];
  const context = getContext();
  const selectedContent = settings.selected_content;

  // Chat messages
  if (selectedContent.chat.enabled && context.chat) {
    const chatSettings = selectedContent.chat;

    // 使用新的 getMessages 函数获取过滤后的消息
    const messageOptions = {
      includeHidden: chatSettings.include_hidden || false,
      types: chatSettings.types || { user: true, assistant: true },
      range: chatSettings.range
    };

    const messages = getMessages(context.chat, messageOptions);

    messages.forEach(msg => {
      // Use raw message content, bypassing extractTagContent
      items.push(createVectorItem(msg, msg.text));
    });
  }

  // Files
  if (selectedContent.files.enabled) {
    const fileMap = getAllAvailableFiles();
    const allFiles = Array.from(fileMap.values());
    for (const file of allFiles) {
      if (!selectedContent.files.selected.includes(file.url)) continue;
      try {
        const text = await getFileAttachment(file.url);
        if (text && text.trim()) {
          items.push({ type: 'file', text: text, metadata: { name: file.name }, selected: true });
        }
      } catch (error) {
        console.error(`Vectors: Error processing file for scanning ${file.name}:`, error);
      }
    }
  }

  // World Info
  if (selectedContent.world_info.enabled) {
    const entries = await getSortedEntries();
    for (const entry of entries) {
      if (!entry.world || !entry.content || entry.disable) continue;
      const selectedEntries = selectedContent.world_info.selected[entry.world] || [];
      if (!selectedEntries.includes(entry.uid)) continue;
      items.push({ type: 'world_info', text: entry.content, metadata: { world: entry.world, uid: entry.uid }, selected: true });
    }
  }

  return items;
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
        const rules = chatSettings.tag_rules || [];

        // 使用新的 getMessages 函数获取过滤后的消息
        const messageOptions = {
            includeHidden: chatSettings.include_hidden || false,
            types: chatSettings.types || { user: true, assistant: true },
            range: chatSettings.range,
            newRanges: chatSettings.newRanges
        };

        const messages = getMessages(context.chat, messageOptions);

        messages.forEach(msg => {
            // 检查是否为首楼（index === 0）或用户楼层（msg.is_user === true）
            // 如果是，则不应用标签提取规则，直接使用原始文本
            let extractedText;
            if (msg.index === 0 || msg.is_user === true) {
                // 首楼或用户楼层：使用完整的原始文本，不应用标签提取规则
                extractedText = msg.text;
            } else {
                // 其他楼层：应用标签提取规则
                extractedText = extractTagContent(msg.text, rules);
            }

            items.push(createVectorItem(msg, extractedText));
        });
    }

  // Files
  if (selectedContent.files.enabled) {
    const fileMap = getAllAvailableFiles();
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
 * Generates a task name based on actual processed items
 * @param {object} contentSettings The actual content settings being processed
 * @param {Array} actualItems Array of actual items that were processed
 * @returns {Promise<string>} Task name
 */
async function generateTaskName(contentSettings, actualItems) {
  console.log('Debug: Generating task name with settings:', JSON.stringify(contentSettings, null, 2));
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
    const chatItems = actualItems.filter(item => item.type === 'chat');
    if (chatItems.length > 0) {
        const indices = chatItems.map(item => item.metadata.index).sort((a, b) => a - b);

        // Format non-continuous ranges properly
        const ranges = [];
        let start = indices[0];
        let end = indices[0];

        for (let i = 1; i < indices.length; i++) {
            if (indices[i] === end + 1) {
                // Continuous, extend the range
                end = indices[i];
            } else {
                // Not continuous, save current range and start new one
                if (start === end) {
                    ranges.push(`#${start}`);
                } else {
                    ranges.push(`#${start}-${end}`);
                }
                start = indices[i];
                end = indices[i];
            }
        }

        // Add the last range
        if (start === end) {
            ranges.push(`#${start}`);
        } else {
            ranges.push(`#${start}-${end}`);
        }

        // Join ranges with proper formatting
        if (ranges.length === 1) {
            parts.push(`消息 ${ranges[0]}`);
        } else if (ranges.length <= 3) {
            parts.push(`消息 ${ranges.join('、')}`);
        } else {
            // For many ranges, show first few and count
            parts.push(`消息 ${ranges.slice(0, 2).join('、')}等 (${chatItems.length}条)`);
        }

        console.debug('Vectors: Added chat part (from actual items):', parts[parts.length - 1]);
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
        // Store all new ranges for display and processing purposes.
        // Our enhanced getVectorizableContent will now use this array directly.
        newSettings.chat.newRanges = newRanges;

        // We no longer create a single, large, incorrect range.
        // We also don't need to set isMultiRange anymore.
        // The original `range` property in newSettings will be ignored by the new getVectorizableContent logic.
    } else {
        // No new content found for chat messages.
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

  console.log('Debug: Incremental settings created:', JSON.stringify(newSettings, null, 2));
  return newSettings;
}

/**
 * Performs the actual vectorization with given settings
 * @param {object} contentSettings Settings for content selection
 * @param {string} chatId Chat ID
 * @param {boolean} isIncremental Whether this is incremental vectorization
 */

/**
 * Pipeline version of performVectorization
 * Uses the complete text processing pipeline: Extract → Process → Dispatch → Execute
 * @param {Object} contentSettings - Content settings
 * @param {string} chatId - Chat ID
 * @param {boolean} isIncremental - Whether this is incremental
 * @param {Array} items - Items to vectorize
 * @returns {Promise<Object>} Result with success status and metadata
 */
async function performVectorization(contentSettings, chatId, isIncremental, items, options = {}) {
  console.log('Pipeline: Starting FULL pipeline processing with settings:', JSON.stringify(contentSettings, null, 2));
  const { skipDeduplication = false, taskType = 'vectorization' } = options;

  // Import all pipeline components
  const { pipelineIntegration } = await import('./src/core/pipeline/PipelineIntegration.js');
  const { ChatExtractor } = await import('./src/core/extractors/ChatExtractor.js');
  const { FileExtractor } = await import('./src/core/extractors/FileExtractor.js');
  const { WorldInfoExtractor } = await import('./src/core/extractors/WorldInfoExtractor.js');

  try {
    // Initialize pipeline with full functionality
    if (!pipelineIntegration.isEnabled()) {
      console.log('Pipeline: Initializing complete pipeline system...');
      await pipelineIntegration.initialize({
        vectorizationAdapter: vectorizationAdapter,
        settings: settings
      });
      pipelineIntegration.setEnabled(true);
    }

    // Generate task metadata
    let taskName = await generateTaskName(contentSettings, items);
    if (isIncremental) {
      taskName = '[增量] ' + taskName;
    }

    // Set vectorization state
    isVectorizing = true;
    vectorizationAbortController = new AbortController();

    // Update UI state
    $('#vectors_enhanced_vectorize').hide();
    $('#vectors_enhanced_abort').show();

    // Create task and collection IDs
    const taskId = generateTaskId();
    const collectionId = `${chatId}_${taskId}`;
    let vectorsInserted = false;

    try {
      const progressMessage = isIncremental ? '增量向量化开始...' : '向量化开始...';
      toastr.info(progressMessage, '处理中');

      // === PHASE 1: USE PRE-EXTRACTED ITEMS (Skip Re-extraction) ===
      console.log('Pipeline: Phase 1 - Using pre-extracted items (Skip Re-extraction)');
      console.log(`Pipeline: getVectorizableContent() already provided ${items.length} items`);

      if (globalProgressManager) {
        globalProgressManager.show(0, items.length, '准备项目');
      } else {
        updateProgressNew(0, items.length, '准备项目');
      }

      // Group items by type without re-extraction
      const extractedContent = [];

      // Group chat items
      const chatItems = items.filter(item => item.type === 'chat');
      if (chatItems.length > 0 && contentSettings.chat?.enabled) {
        console.log(`Pipeline: Prepared ${chatItems.length} chat items for processing`);
        extractedContent.push({
          type: 'chat',
          content: chatItems, // 保持数组格式！不合并！
          metadata: {
            extractorType: 'PreExtracted',
            itemCount: chatItems.length,
            source: 'getVectorizableContent'
          }
        });
      }

      // Group file items
      const fileItems = items.filter(item => item.type === 'file');
      if (fileItems.length > 0 && contentSettings.files?.enabled) {
        console.log(`Pipeline: Prepared ${fileItems.length} file items for processing`);
        extractedContent.push({
          type: 'files',
          content: fileItems, // 保持数组格式！不合并！
          metadata: {
            extractorType: 'PreExtracted',
            itemCount: fileItems.length,
            source: 'getVectorizableContent'
          }
        });
      }

      // Group world info items
      const worldInfoItems = items.filter(item => item.type === 'world_info');
      if (worldInfoItems.length > 0 && contentSettings.world_info?.enabled) {
        console.log(`Pipeline: Prepared ${worldInfoItems.length} world info items for processing`);
        extractedContent.push({
          type: 'world_info',
          content: worldInfoItems, // 保持数组格式！不合并！
          metadata: {
            extractorType: 'PreExtracted',
            itemCount: worldInfoItems.length,
            source: 'getVectorizableContent'
          }
        });
      }

      if (globalProgressManager) {
        globalProgressManager.update(items.length, items.length, '项目准备完成');
      }

      console.log(`Pipeline: Prepared ${extractedContent.length} content blocks containing ${items.length} total items`);
      console.log('Pipeline: Content block summary:', extractedContent.map(block => ({
        type: block.type,
        itemCount: Array.isArray(block.content) ? block.content.length : 1,
        isArray: Array.isArray(block.content),
        firstItemPreview: Array.isArray(block.content) && block.content.length > 0
          ? block.content[0].text?.substring(0, 50) + '...'
          : 'N/A'
      })));

      // === PHASE 2: TEXT PROCESSING ===
      console.log('Pipeline: Phase 2 - Text Processing through Pipeline');
      if (globalProgressManager) {
        globalProgressManager.show(0, extractedContent.length, '文本处理');
      }

      // Get pipeline components
      const pipeline = pipelineIntegration.pipeline;
      const dispatcher = pipelineIntegration.dispatcher;

      // Create processing context
      const processingContext = {
        chatId,
        taskId,
        collectionId,
        isIncremental,
        settings: contentSettings,
        abortSignal: vectorizationAbortController.signal,
        source: 'chat_vectorization',
        vectorizationSettings: {
          source: settings.source,
          chunk_size: settings.chunk_size,
          overlap_percent: settings.overlap_percent
        }
      };

      const allProcessedChunks = [];

      // Process each content block through the pipeline
      for (let i = 0; i < extractedContent.length; i++) {
        if (vectorizationAbortController.signal.aborted) {
          throw new Error('向量化被用户中断');
        }

        const contentBlock = extractedContent[i];
        console.log(`Pipeline: Processing content block ${i + 1}/${extractedContent.length} (${contentBlock.type})`);

        // === PHASE 3: TASK DISPATCH ===
        console.log('Pipeline: Phase 3 - Task Dispatch');

        // Prepare input for dispatcher
        const dispatchInput = {
          content: contentBlock.content,
          metadata: {
            ...contentBlock.metadata,
            type: contentBlock.type,
            collectionId: collectionId,
            source: 'pipeline_extraction'
          }
        };

        console.log(`Pipeline: Dispatch input for ${contentBlock.type}:`, {
          isArray: Array.isArray(dispatchInput.content),
          contentLength: Array.isArray(dispatchInput.content)
            ? dispatchInput.content.length
            : dispatchInput.content?.length,
          contentPreview: Array.isArray(dispatchInput.content)
            ? dispatchInput.content.slice(0, 2).map(item => ({
                type: item?.type,
                hasText: !!item?.text,
                textLength: item?.text?.length,
                textPreview: item?.text?.substring(0, 50) + '...'
              }))
            : dispatchInput.content?.substring(0, 100) + '...',
          metadata: dispatchInput.metadata
        });

        // Dispatch through the text dispatcher
        const dispatchResult = await dispatcher.dispatch(
          dispatchInput,
          'vectorization',
          contentSettings,
          processingContext
        );

        console.log(`Pipeline: Dispatch result for ${contentBlock.type}:`, {
          success: dispatchResult.success,
          vectorized: dispatchResult.vectorized,
          processingTime: dispatchResult._pipeline?.processingTime
        });

        // Convert pipeline result to chunks format
        if (dispatchResult.success && dispatchResult.vectors) {
          const chunks = dispatchResult.vectors.map((vector, idx) => ({
            hash: getHashValue(vector.text || vector.content),
            text: vector.text || vector.content,
            index: allProcessedChunks.length + idx,
            metadata: {
              ...vector.metadata,
              ...contentBlock.metadata,
              type: contentBlock.type,
              chunk_index: idx,
              chunk_total: dispatchResult.vectors.length,
              pipeline_processed: true
            }
          }));

          allProcessedChunks.push(...chunks);
        }

        if (globalProgressManager) {
          globalProgressManager.update(i + 1, extractedContent.length, `处理 ${contentBlock.type} 完成`);
        }
      }

      console.log(`Pipeline: Processing complete. Generated ${allProcessedChunks.length} chunks through full pipeline`);
      console.log('Pipeline: allProcessedChunks details:', allProcessedChunks.map(chunk => ({
        hasText: !!chunk.text,
        textLength: chunk.text?.length,
        textPreview: chunk.text?.substring(0, 50) + '...',
        hasMetadata: !!chunk.metadata,
        metadata: chunk.metadata
      })));

      // === PHASE 4: VECTOR STORAGE ===
      console.log('Pipeline: Phase 4 - Vector Storage');
      if (globalProgressManager) {
        globalProgressManager.show(0, allProcessedChunks.length, '向量存储');
      }

      // Store vectors using existing storage adapter
      const batchSize = 50;
      for (let i = 0; i < allProcessedChunks.length; i += batchSize) {
        if (vectorizationAbortController.signal.aborted) {
          throw new Error('向量化被用户中断');
        }

        const batch = allProcessedChunks.slice(i, Math.min(i + batchSize, allProcessedChunks.length));
        await storageAdapter.insertVectorItems(collectionId, batch, vectorizationAbortController.signal, { skipDeduplication });
        vectorsInserted = true;

        if (globalProgressManager) {
          globalProgressManager.update(Math.min(i + batchSize, allProcessedChunks.length), allProcessedChunks.length, '向量存储中...');
        }
      }

      // Create corrected settings (reuse existing logic)
      const correctedSettings = JSON.parse(JSON.stringify(contentSettings));

      // ... (copy the settings correction logic from original function)
      if (correctedSettings.chat.enabled) {
        const chatItems = items.filter(item => item.type === 'chat');
        if (chatItems.length > 0) {
          const indices = chatItems.map(item => item.metadata.index);
          correctedSettings.chat.range.start = Math.min(...indices);
          correctedSettings.chat.range.end = Math.max(...indices);
        } else {
          correctedSettings.chat.enabled = false;
        }
      }

      if (correctedSettings.files.enabled) {
        const actuallyProcessedFiles = items
          .filter(item => item.type === 'file')
          .map(item => item.metadata.url);
        correctedSettings.files.selected = actuallyProcessedFiles;
      }

      if (correctedSettings.world_info.enabled) {
        const actuallyProcessedEntries = items
          .filter(item => item.type === 'world_info')
          .map(item => item.metadata.uid);
        const newWorldInfoSelected = {};
        for (const uid of actuallyProcessedEntries) {
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
      }

      // Extract actually processed items by type
      const actualProcessedItems = {
        chat: items.filter(item => item.type === 'chat').map(item => item.metadata.index),
        files: items.filter(item => item.type === 'file').map(item => item.metadata.url),
        world_info: items.filter(item => item.type === 'world_info').map(item => item.metadata.uid)
      };

      // Create task object
      const task = {
        taskId: taskId,
        name: taskName,
        timestamp: Date.now(),
        settings: correctedSettings,
        enabled: true,
        itemCount: allProcessedChunks.length,
        originalItemCount: items.length,
        isIncremental: isIncremental,
        actualProcessedItems: actualProcessedItems,
        version: '2.0' // Mark as pipeline version
      };

      // Add text content to task (similar to original implementation)
      if (settings.lightweight_storage && allProcessedChunks.length > 100) {
        // Large content mode
        console.debug(`Vectors: Large content detected (${allProcessedChunks.length} chunks), using lightweight storage`);
        task.lightweight = true;
      } else {
        // Normal mode: save text content to task
        task.textContent = allProcessedChunks.map(chunk => ({
          hash: chunk.hash,
          text: chunk.text,
          metadata: chunk.metadata
        }));
      }

      // Add task to list
      addVectorTask(chatId, task);

      // Update cache
      cachedVectors.set(collectionId, {
        timestamp: Date.now(),
        items: allProcessedChunks, // Use allProcessedChunks from pipeline processing
        settings: JSON.parse(JSON.stringify(settings)),
      });

      // Complete progress
      if (globalProgressManager) {
        globalProgressManager.complete('向量化完成');
      } else {
        hideProgressNew();
      }

      const successMessage = isIncremental ?
        `成功创建增量向量化任务 "${taskName}"：${items.length} 个新项目，${allProcessedChunks.length} 个块` :
        `成功创建向量化任务 "${taskName}"：${items.length} 个项目，${allProcessedChunks.length} 个块`;
      toastr.success(successMessage, '向量化完成');

      // Refresh task list UI
      await updateTaskList(getChatTasks, renameVectorTask, removeVectorTask);

      return {
        success: true,
        taskId,
        collectionId,
        itemCount: allProcessedChunks.length,
        originalItemCount: items.length,
        pipelineProcessed: true
      };

    } catch (error) {
      console.error('Pipeline vectorization failed:', error);

      // Use ProgressManager
      if (globalProgressManager) {
        globalProgressManager.error('向量化失败');
      } else {
        hideProgressNew();
      }

      // Handle abort
      if (error.message === '向量化被用户中断' || vectorizationAbortController.signal.aborted) {
        if (vectorsInserted) {
          await storageAdapter.purgeVectorIndex(collectionId);
        }
        toastr.info('向量化已中断，已清理部分数据', '中断');
      } else {
        if (vectorsInserted) {
          await storageAdapter.purgeVectorIndex(collectionId);
        }
        toastr.error('向量化内容失败', '错误');
      }

      throw error;

    } finally {
      // Reset state
      isVectorizing = false;
      vectorizationAbortController = null;
      $('#vectors_enhanced_vectorize').show();
      $('#vectors_enhanced_abort').hide();
    }

  } catch (error) {
    console.error('Pipeline vectorization main flow error:', error);
    toastr.error('向量化处理中发生严重错误，请检查控制台。');

    // Ensure UI state reset
    isVectorizing = false;
    vectorizationAbortController = null;
    $('#vectors_enhanced_vectorize').show();
    $('#vectors_enhanced_abort').hide();

    if (globalProgressManager) {
      globalProgressManager.error('严重错误');
    } else {
      hideProgressNew();
    }

    return {
      success: false,
      error: error.message
    };
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
 * Gets a set of unique identifiers for all items already processed in enabled tasks.
 * @param {string} chatId Chat ID
 * @returns {{chat: Set<number>, file: Set<string>, world_info: Set<string>}}
 */
function getProcessedItemIdentifiers(chatId) {
    const identifiers = {
        chat: new Set(),
        file: new Set(),
        world_info: new Set()
    };
    const enabledTasks = getChatTasks(chatId).filter(t => t.enabled);

    for (const task of enabledTasks) {
        // Use actualProcessedItems if available (new tasks)
        if (task.actualProcessedItems) {
            // New tasks with actual processed items tracking
            if (task.actualProcessedItems.chat) {
                task.actualProcessedItems.chat.forEach(index => identifiers.chat.add(index));
            }
            if (task.actualProcessedItems.files) {
                task.actualProcessedItems.files.forEach(url => identifiers.file.add(url));
            }
            if (task.actualProcessedItems.world_info) {
                task.actualProcessedItems.world_info.forEach(uid => identifiers.world_info.add(uid));
            }
        } else {
            // Legacy tasks without actualProcessedItems - fallback to settings ranges
            const taskSettings = task.settings;
            if (taskSettings.chat && taskSettings.chat.enabled) {
                const start = taskSettings.chat.range.start;
                const end = taskSettings.chat.range.end === -1
                    ? getContext().chat.length - 1
                    : taskSettings.chat.range.end;
                for (let i = start; i <= end; i++) {
                    identifiers.chat.add(i);
                }
            }
            if (taskSettings.files && taskSettings.files.enabled) {
                taskSettings.files.selected.forEach(url => identifiers.file.add(url));
            }
            if (taskSettings.world_info && taskSettings.world_info.enabled) {
                Object.values(taskSettings.world_info.selected).flat().forEach(uid => identifiers.world_info.add(uid));
            }
        }
    }
    return identifiers;
}

/**
 * Formats an array of chat items into a human-readable range string.
 * e.g., [0, 1, 5, 6, 7, 10] becomes "#0-#1, #5-#7, #10"
 * @param {Array<object>} chatItems - Array of chat items, each with metadata.index
 * @returns {string} A formatted string representing the ranges.
 */
function formatRanges(chatItems) {
    if (!chatItems || chatItems.length === 0) {
        return '没有新的聊天记录';
    }

    const indices = chatItems.map(item => item.metadata.index).sort((a, b) => a - b);

    const ranges = [];
    let start = indices[0];
    let end = indices[0];

    for (let i = 1; i < indices.length; i++) {
        if (indices[i] === end + 1) {
            end = indices[i];
        } else {
            ranges.push(start === end ? `#${start}` : `#${start}-${end}`);
            start = end = indices[i];
        }
    }
    ranges.push(start === end ? `#${start}` : `#${start}-${end}`);

    return `楼层 ${ranges.join('、')}`;
}

/**
 * 格式化消息项的楼层范围（用于向量化弹窗）
 * 例如：[5, 6, 7, 10] 变成 "5-7层、10层"
 * @param {Array<object>} messageItems - 消息项数组，每个项包含 metadata.index
 * @returns {string} 格式化的楼层范围字符串
 */
function formatMessageRanges(messageItems) {
    if (!messageItems || messageItems.length === 0) {
        return '无';
    }

    const indices = messageItems.map(item => item.metadata.index).sort((a, b) => a - b);
    const ranges = [];
    let start = indices[0];
    let end = indices[0];

    for (let i = 1; i < indices.length; i++) {
        if (indices[i] === end + 1) {
            end = indices[i];
        } else {
            ranges.push(start === end ? `${start}层` : `${start}-${end}层`);
            start = end = indices[i];
        }
    }
    ranges.push(start === end ? `${start}层` : `${start}-${end}层`);

    return ranges.join('、');
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
    if (!chatId || chatId === 'null' || chatId === 'undefined') {
        toastr.error('未选择聊天');
        return;
    }

    await cleanupInvalidSelections();

    // 1. Get initial items based on UI selection
    const initialItems = await getVectorizableContent();

    // 2. Filter out empty items to get "valid" items
    const validItems = initialItems.filter(item => item.text && item.text.trim() !== '');
    if (validItems.length === 0) {
        toastr.warning('未选择要向量化的内容或过滤后内容为空');
        return;
    }

    // 3. Get identifiers of already processed items
    const processedIdentifiers = getProcessedItemIdentifiers(chatId);

    // 4. Filter valid items to get only "new" items
    const newItems = validItems.filter(item => {
        switch (item.type) {
            case 'chat': return !processedIdentifiers.chat.has(item.metadata.index);
            case 'file': return !processedIdentifiers.file.has(item.metadata.url);
            case 'world_info': return !processedIdentifiers.world_info.has(item.metadata.uid);
            default: return true;
        }
    });

    // 5. Determine interaction flow based on what was filtered
    const hasEmptyItems = validItems.length < initialItems.length;
    const hasProcessedItems = newItems.length < validItems.length;

    let itemsToProcess = newItems;
    let isIncremental = hasProcessedItems; // Any task with pre-existing items is considered incremental

    if (newItems.length === 0) {
        // Case: All selected items have already been processed.
        const processedChatItems = validItems.filter(i => i.type === 'chat' && processedIdentifiers.chat.has(i.metadata.index));
        const processedFileItems = validItems.filter(i => i.type === 'file' && processedIdentifiers.file.has(i.metadata.url));
        const processedWorldInfoItems = validItems.filter(i => i.type === 'world_info' && processedIdentifiers.world_info.has(i.metadata.uid));

        const processedParts = [];
        if (processedChatItems.length > 0) processedParts.push(`聊天记录: ${formatRanges(processedChatItems)}`);
        if (processedFileItems.length > 0) processedParts.push(`文件: ${processedFileItems.length}个`);
        if (processedWorldInfoItems.length > 0) processedParts.push(`世界信息: ${processedWorldInfoItems.length}条`);

        const confirm = await callGenericPopup(
            `<div>
                <p>所有选定内容均已被向量化：</p>
                <ul style="text-align: left; margin: 10px 0;">
                    ${processedParts.map(part => `<li>${part}</li>`).join('')}
                </ul>
                <p>是否要强制重新向量化这些内容？</p>
            </div>`,
            POPUP_TYPE.CONFIRM,
            { okButton: '是', cancelButton: '否' }
        );

        if (confirm !== POPUP_RESULT.AFFIRMATIVE) {
            return; // User chose 'No' or cancelled
        }

        // User chose 'Yes', force re-vectorization of all valid items
        itemsToProcess = validItems;
        isIncremental = false;
    }
    else if (hasProcessedItems && newItems.length > 0) {
        // Case: Partial overlap. Some items are new, some are already processed.
        const newChatItems = newItems.filter(i => i.type === 'chat');
        const newFileItems = newItems.filter(i => i.type === 'file');
        const newWorldInfoItems = newItems.filter(i => i.type === 'world_info');

        const processedChatItems = validItems.filter(i => i.type === 'chat' && processedIdentifiers.chat.has(i.metadata.index));
        const processedFileItems = validItems.filter(i => i.type === 'file' && processedIdentifiers.file.has(i.metadata.url));
        const processedWorldInfoItems = validItems.filter(i => i.type === 'world_info' && processedIdentifiers.world_info.has(i.metadata.uid));

        const newParts = [];
        const processedParts = [];

        if (newChatItems.length > 0) newParts.push(`新增聊天: ${formatRanges(newChatItems)}`);
        if (newFileItems.length > 0) newParts.push(`新增文件: ${newFileItems.length}个`);
        if (newWorldInfoItems.length > 0) newParts.push(`新增世界信息: ${newWorldInfoItems.length}条`);

        if (processedChatItems.length > 0) processedParts.push(`已处理聊天: ${formatRanges(processedChatItems)}`);
        if (processedFileItems.length > 0) processedParts.push(`已处理文件: ${processedFileItems.length}个`);
        if (processedWorldInfoItems.length > 0) processedParts.push(`已处理世界信息: ${processedWorldInfoItems.length}条`);

        const confirm = await callGenericPopup(
            `<div>
                <p><strong>检测到部分内容已被处理：</strong></p>
                <div style="text-align: left; margin: 10px 0;">
                    <p>已处理：</p>
                    <ul style="margin: 5px 0 15px 20px;">
                        ${processedParts.map(part => `<li>${part}</li>`).join('')}
                    </ul>
                    <p>新增内容：</p>
                    <ul style="margin: 5px 0 10px 20px;">
                        ${newParts.map(part => `<li>${part}</li>`).join('')}
                    </ul>
                </div>
                <p>是否只进行增量向量化（只处理新增内容）？</p>
            </div>`,
            POPUP_TYPE.CONFIRM,
            { okButton: '是', cancelButton: '否' }
        );

        if (confirm !== POPUP_RESULT.AFFIRMATIVE) {
            // User chose 'No' or cancelled
            return;
        }

        // User chose 'Yes', so we proceed with incremental vectorization (the default).
        itemsToProcess = newItems;
        isIncremental = true;
    }
    else if (hasEmptyItems) {
        // 分析有效项目的详细信息
        const validChatItems = validItems.filter(item => item.type === 'chat');
        const validFileItems = validItems.filter(item => item.type === 'file');
        const validWorldInfoItems = validItems.filter(item => item.type === 'world_info');

        // 按消息类型分组聊天项目
        const userMessages = validChatItems.filter(item => item.metadata.is_user === true);
        const aiMessages = validChatItems.filter(item => item.metadata.is_user === false);

        // 格式化楼层信息
        let detailParts = [];

        if (userMessages.length > 0) {
            const userRanges = formatMessageRanges(userMessages);
            detailParts.push(`用户消息（${userRanges}）`);
        }

        if (aiMessages.length > 0) {
            const aiRanges = formatMessageRanges(aiMessages);
            detailParts.push(`AI消息（${aiRanges}）`);
        }

        if (validFileItems.length > 0) {
            detailParts.push(`${validFileItems.length}个文件`);
        }

        if (validWorldInfoItems.length > 0) {
            detailParts.push(`${validWorldInfoItems.length}条世界信息`);
        }

        const detailText = detailParts.length > 0 ? `\n\n包含：${detailParts.join('、')}` : '';

        const confirm = await callGenericPopup(
            `您选择了 ${initialItems.length} 个项目，但只有 ${validItems.length} 个包含有效内容。${detailText}\n\n是否继续处理这 ${validItems.length} 个项目？`,
            POPUP_TYPE.CONFIRM,
            { okButton: '继续', cancelButton: '取消' }
        );
        if (confirm !== POPUP_RESULT.AFFIRMATIVE) return;
        // In this case, we process ALL valid items, not just new ones (as there are no "processed" items)
        itemsToProcess = validItems;
        isIncremental = false; // This is a new task, not an incremental addition
    }

    // 6. Perform vectorization with the final, clean set of items
    console.log('Vectors: Using pipeline implementation for vectorization');
    await performVectorization(JSON.parse(JSON.stringify(settings.selected_content)), chatId, isIncremental, itemsToProcess);
}

/**
 * Exports vectorized content
 * @returns {Promise<void>}
 */
async function exportVectors() {
  const context = getContext();
  const chatId = getCurrentChatId();

  if (!chatId || chatId === 'null' || chatId === 'undefined') {
    toastr.error('未选择聊天');
    return;
  }

  let items = await getVectorizableContent();
  // Filter out empty items for consistency with vectorization process
  items = items.filter(item => item.text && item.text.trim() !== '');

  if (items.length === 0) {
    toastr.warning('未选择要导出的内容或过滤后内容为空');
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
  const filename = `向量导出_${context.name || chatId}_${Date.now()}.txt`;
  triggerDownload(exportText, filename);

  toastr.success('导出成功');
}

/**
 * Previews vectorizable content
 * @returns {Promise<void>}
 */

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
  // 开始计时 - 记录查询开始时间
  const queryStartTime = performance.now();

  // 辅助函数：记录耗时并返回
  const logTimingAndReturn = (reason = '', isError = false) => {
    const queryEndTime = performance.now();
    const totalDuration = queryEndTime - queryStartTime;
    if (reason) {
      const status = isError ? '失败' : '跳过';
      console.log(`🔍 Vectors Enhanced: 查询${status} (${reason}) - 耗时: ${totalDuration.toFixed(2)}ms`);
    }
  };

  try {
    if (type === 'quiet') {
      console.debug('Vectors: Skipping quiet prompt');
      // quiet 模式不需要计时
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
      logTimingAndReturn('主开关已禁用');
      return;
    }

    // 检查是否启用向量查询
    if (!settings.enabled) {
      console.debug('Vectors: Query disabled by user');
      logTimingAndReturn('向量查询已禁用');
      return;
    }

    const chatId = getCurrentChatId();
    if (!chatId || chatId === 'null' || chatId === 'undefined') {
      console.debug('Vectors: No chat ID available');
      logTimingAndReturn('无聊天ID');
      return;
    }

    // Query vectors based on recent messages
    const queryMessages = Math.min(settings.query_messages || 3, chat.length);
    const queryText = chat
      .slice(-queryMessages)
      .map(x => x.mes)
      .join('\n');
    if (!queryText.trim()) {
      logTimingAndReturn('查询文本为空');
      return;
    }

    // Get all enabled tasks for this chat
    const allTasks = getChatTasks(chatId);
    const tasks = allTasks.filter(t => t.enabled);

    console.debug(`Vectors: Chat ${chatId} has ${allTasks.length} total tasks, ${tasks.length} enabled`);
    allTasks.forEach(task => {
      console.debug(`Vectors: Task "${task.name}" (${task.taskId}) - enabled: ${task.enabled}`);
    });

    if (tasks.length === 0) {
      console.debug('Vectors: No enabled tasks for this chat');
      logTimingAndReturn('无启用的任务');
      return;
    }

    // Query all enabled tasks
    let allResults = [];
    // 为了确保能从所有任务中获得最相关的结果，每个任务查询稍多一些
    const perTaskLimit = Math.max(Math.ceil((settings.max_results || 10) * 1.5), 20);

    for (const task of tasks) {
      const collectionId = `${chatId}_${task.taskId}`;
      console.debug(`Vectors: Querying collection "${collectionId}" for task "${task.name}"`);

      try {
        const results = await storageAdapter.queryCollection(collectionId, queryText, perTaskLimit, settings.score_threshold);
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
                  const vectorTexts = await storageAdapter.getVectorTexts(collectionId, results.hashes);
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

    // Rerank results if enabled
    if (settings.rerank_enabled && allResults.length > 0) {
        console.debug('Vectors: Reranking enabled. Starting rerank process...');
        try {
            const documentsToRerank = allResults.map(x => ({
                text: x.text,
                index: x.original_index
            }));

            const rerankResponse = await fetch(settings.rerank_url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.rerank_apiKey}`
                },
                body: JSON.stringify({
                    query: queryText,
                    documents: documentsToRerank.map(x => x.text),
                    model: settings.rerank_model,
                    "top_n": settings.rerank_top_n,
                })
            });

            if (!rerankResponse.ok) {
                throw new Error(`Rerank API failed: ${rerankResponse.statusText}`);
            }

            const rerankedData = await rerankResponse.json();
            console.debug('Vectors: Rerank API response:', rerankedData);

            // Combine scores and sort
            const alpha = settings.rerank_hybrid_alpha;
            allResults = allResults.map(result => {
                const rerankedResult = rerankedData.results.find(r => r.index === result.original_index);
                const relevanceScore = rerankedResult ? rerankedResult.relevance_score : 0;

                // Calculate hybrid score
                const hybridScore = relevanceScore * alpha + result.score * (1 - alpha);

                return {
                    ...result,
                    hybrid_score: hybridScore,
                    rerank_score: relevanceScore,
                };
            });

            // Sort by the new hybrid score
            allResults.sort((a, b) => (b.hybrid_score || 0) - (a.hybrid_score || 0));
            console.debug('Vectors: Results after reranking and hybrid scoring:', allResults.slice(0, 10));

         } catch (error) {
             console.error('Vectors: Reranking failed. Falling back to original similarity search.', error);
            toastr.error('Rerank失败，使用原始搜索结果。');
            // If rerank fails, sort by original score
            allResults.sort((a, b) => (b.score || 0) - (a.score || 0));
        }
    } else {
        // If reranking is not enabled, sort by original score
        allResults.sort((a, b) => (b.score || 0) - (a.score || 0));
    }

    // 在排序后，限制结果数量为 max_results
    const maxResults = settings.max_results || 10;
    if (allResults.length > maxResults) {
      console.debug(`Vectors: Limiting results from ${allResults.length} to ${maxResults}`);
      allResults = allResults.slice(0, maxResults);
    }

    // 初始化变量
    let topResults = [];
    let groupedResults = {};
    let insertedText = '';
    let totalChars = 0;

    if (allResults.length === 0) {
      console.debug('Vectors: No query results found');
    } else {
      console.debug(`Vectors: Found ${allResults.length} total results after limiting`);

      // 如果启用了rerank，可能会进一步减少结果数
      const finalResultCount = settings.rerank_enabled ? Math.min(settings.rerank_top_n, allResults.length) : allResults.length;
      topResults = allResults.slice(0, finalResultCount);

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
        logTimingAndReturn('通知冷却中');
        return;
      }

      const finalCount = topResults.length;    // 最终注入的数量

      let message;
      if (settings.rerank_enabled && finalCount > 0) {
        // 如果启用了重排，显示重排后的数量
        message = `查询到 ${allResults.length} 个块，重排后注入 ${finalCount} 个块。`;
      } else {
        // 如果没有启用重排，allResults 已经被限制为 max_results
        message = `查询到 ${allResults.length} 个块` + (finalCount > 0 ? '，已注入。' : '。');
      }

      // 详细模式：显示来源分布
      if (settings.detailed_notification && finalCount > 0) {
        const sourceStats = {
          chat: groupedResults.chat?.length || 0,
          file: groupedResults.file?.length || 0,
          world_info: groupedResults.world_info?.length || 0,
        };

        if (sourceStats.chat || sourceStats.file || sourceStats.world_info) {
          const sources = [];
          if (sourceStats.chat) sources.push(`聊天记录${sourceStats.chat}条`);
          if (sourceStats.file) sources.push(`文件${sourceStats.file}条`);
          if (sourceStats.world_info) sources.push(`世界信息${sourceStats.world_info}条`);
          message += `\n来源：${sources.join('，')}`;
        }
      }

      const toastType = finalCount > 0 ? 'info' : 'warning';
      toastr[toastType](message, '向量查询结果', { timeOut: 3000 });

      // 更新最后通知时间
      lastNotificationTime = currentTime;
    }

    // 计算总耗时并输出到控制台
    const queryEndTime = performance.now();
    const totalDuration = queryEndTime - queryStartTime;
    const resultCount = allResults.length;
    const injectedCount = topResults.length;
    console.log(`🔍 Vectors Enhanced: 查询到注入完成 - 总耗时: ${totalDuration.toFixed(2)}ms (查询${resultCount}条, 注入${injectedCount}条)`);

  } catch (error) {
    console.error('Vectors: Failed to rearrange chat', error);
    logTimingAndReturn('执行出错', true);
  }
}

window['vectors_rearrangeChat'] = rearrangeChat;



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












// Event handlers
const onChatEvent = debounce(async () => {
  if (settings.auto_vectorize) {
    await moduleWorker.update();
  }
  // Update UI lists when chat changes
  await updateFileList();
  updateChatSettings();
  await updateTaskList(getChatTasks, renameVectorTask, removeVectorTask);
}, debounce_timeout.relaxed);

/**
 * Cleans up invalid chat IDs from vector_tasks
 */
function cleanupInvalidChatIds() {
  if (!settings.vector_tasks) {
    return;
  }
  
  let hasChanges = false;
  const invalidKeys = [];
  
  for (const [chatId, tasks] of Object.entries(settings.vector_tasks)) {
    if (!chatId || chatId === 'null' || chatId === 'undefined' || chatId.trim() === '') {
      invalidKeys.push(chatId);
      hasChanges = true;
    }
  }
  
  if (hasChanges) {
    console.warn('Vectors: Cleaning up invalid chat IDs:', invalidKeys);
    invalidKeys.forEach(key => {
      delete settings.vector_tasks[key];
    });
    console.log('Vectors: Cleaned up invalid chat IDs from vector_tasks');
  }
}

/**
 * Migrates old tag settings to the new structured format.
 * This is a one-time migration that runs if the old `tags` property is found.
 */
function migrateTagSettings() {
  // Check if migration is needed by detecting the presence of the old 'tags' property.
  if (settings.selected_content?.chat?.hasOwnProperty('tags')) {
    console.log('[Vectors] Tag settings migrated to new format.');

    const oldTags = settings.selected_content.chat.tags;
    const newRules = [];

    if (typeof oldTags === 'string' && oldTags.trim()) {
      // Example: "content - thinking" becomes [{type:'include', value:'content'}, {type:'exclude', value:'thinking'}]
      const parts = oldTags.split(' - ');
      const includePart = parts[0].trim();
      const excludePart = parts.length > 1 ? parts[1].trim() : '';

      if (includePart) {
        includePart.split(',').forEach(tag => {
          const trimmedTag = tag.trim();
          if (trimmedTag) {
            newRules.push({ type: 'include', value: trimmedTag, enabled: true });
          }
        });
      }

      if (excludePart) {
        excludePart.split(',').forEach(tag => {
          const trimmedTag = tag.trim();
          if (trimmedTag) {
            newRules.push({ type: 'exclude', value: trimmedTag, enabled: true });
          }
        });
      }
    }

    // Assign the new rules and clean up old properties
    settings.selected_content.chat.tag_rules = newRules;
    delete settings.selected_content.chat.tags;
    settings.tag_rules_version = 2;

    // Settings will be saved later in the initialization process.
  }
}

jQuery(async () => {
  try {
    console.log('Vectors Enhanced: Starting initialization...');

    // 使用独立的设置键避免冲突
    const SETTINGS_KEY = 'vectors_enhanced';

    if (!extension_settings[SETTINGS_KEY]) {
      extension_settings[SETTINGS_KEY] = settings;
    }

    // 深度合并设置，确保所有必需的属性都存在
    Object.assign(settings, extension_settings[SETTINGS_KEY]);

  // 在设置加载后运行迁移
  migrateTagSettings();
  
  // 清理无效的聊天ID
  cleanupInvalidChatIds();

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

  // 确保rerank成功通知设置存在
  if (settings.rerank_success_notify === undefined) {
    settings.rerank_success_notify = true;
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

  // 创建 SettingsPanel 实例
  console.log('Vectors Enhanced: Creating SettingsPanel...');
  const settingsPanel = new SettingsPanel({
    renderExtensionTemplateAsync,
    targetSelector: '#extensions_settings2'
  });

  // 初始化 SettingsPanel
  console.log('Vectors Enhanced: Initializing SettingsPanel...');
  await settingsPanel.init();

  // 设置全局SettingsPanel引用
  globalSettingsPanel = settingsPanel;

  // 创建 ConfigManager 实例
  console.log('Vectors Enhanced: Creating ConfigManager...');
  const configManager = new ConfigManager(extension_settings, saveSettingsDebounced);

  // 创建并初始化设置子组件
  console.log('Vectors Enhanced: Creating settings sub-components...');

  const vectorizationSettings = new VectorizationSettings({
    settings,
    configManager,
    onSettingsChange: (field, value) => {
      console.debug(`VectorizationSettings: ${field} changed to:`, value);
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    }
  });

  const querySettings = new QuerySettings({
    settings,
    configManager,
    onSettingsChange: (field, value) => {
      console.debug(`QuerySettings: ${field} changed to:`, value);
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    }
  });

  const injectionSettings = new InjectionSettings({
    settings,
    configManager,
    onSettingsChange: (field, value) => {
      console.debug(`InjectionSettings: ${field} changed to:`, value);
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    }
  });

  const contentSelectionSettings = new ContentSelectionSettings({
    settings,
    configManager,
    onSettingsChange: (field, value) => {
      console.debug(`ContentSelectionSettings: ${field} changed to:`, value);
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    },
    // Inject dependency functions
    updateFileList,
    updateWorldInfoList,
    updateChatSettings,
    renderTagRulesUI,
    showTagExamples,
    scanAndSuggestTags: () => {
      if (typeof scanAndSuggestTags === 'function') {
        scanAndSuggestTags();
      }
    },
    clearTagSuggestions,
    toggleMessageRangeVisibility: (show) => {
      // Implementation for message range visibility toggle
      console.log(`Toggling message range visibility: ${show}`);
    }
  });

  // 初始化设置子组件
  console.log('Vectors Enhanced: Initializing settings sub-components...');
  await vectorizationSettings.init();
  await querySettings.init();
  await injectionSettings.init();
  await contentSelectionSettings.init();

  // 将子组件添加到 SettingsPanel
  settingsPanel.addSubComponent('vectorizationSettings', vectorizationSettings);
  settingsPanel.addSubComponent('querySettings', querySettings);
  settingsPanel.addSubComponent('injectionSettings', injectionSettings);
  settingsPanel.addSubComponent('contentSelectionSettings', contentSelectionSettings);

  // 创建 UI Infrastructure 实例
  console.log('Vectors Enhanced: Creating UI Infrastructure...');

  // 创建 StateManager
  const stateManager = new StateManager({
    eventBus,
    settings,
    configManager
  });

  // 创建 ProgressManager
  const progressManager = new ProgressManager({
    eventBus
  });

  // 创建 EventManager
  const eventManager = new EventManager({
    eventBus,
    eventSource,
    event_types,
    progressManager,
    stateManager
  });

  // 初始化 UI Infrastructure
  console.log('Vectors Enhanced: Initializing UI Infrastructure...');
  stateManager.init();
  progressManager.init();
  eventManager.init();

  // 设置全局引用
  globalStateManager = stateManager;
  globalProgressManager = progressManager;
  globalEventManager = eventManager;

  // 创建存储适配器实例
  console.log('Vectors Enhanced: Creating StorageAdapter...');
  storageAdapter = new StorageAdapter({
    getRequestHeaders,
    getVectorsRequestBody,
    throwIfSourceInvalid,
    cachedVectors
  });

  // 创建向量化适配器实例
  console.log('Vectors Enhanced: Creating VectorizationAdapter...');
  vectorizationAdapter = new VectorizationAdapter({
    getRequestHeaders,
    getVectorsRequestBody,
    throwIfSourceInvalid,
    settings,
    textgenerationwebui_settings,
    textgen_types
  });

  // 创建 SettingsManager 实例
  console.log('Vectors Enhanced: Creating SettingsManager...');
  const settingsManager = new SettingsManager(settings, configManager, {
    extension_settings,
    saveSettingsDebounced,
    updateFileList,
    updateWorldInfoList,
    getChatTasks,
    renameVectorTask,
    removeVectorTask,
    toggleMessageRangeVisibility,
    showTagExamples,
    scanAndSuggestTags
  });

  // TaskManager removed - using legacy format only
  
  // 添加全局处理函数作为后备
  window.handleExternalTaskImport = async () => {
    console.log('handleExternalTaskImport called');
    if (globalSettingsManager?.externalTaskUI?.showImportDialog) {
      try {
        await globalSettingsManager.externalTaskUI.showImportDialog();
      } catch (error) {
        console.error('Error in showImportDialog:', error);
        if (typeof toastr !== 'undefined') {
          toastr.error('无法打开导入对话框: ' + error.message);
        } else {
          alert('无法打开导入对话框: ' + error.message);
        }
      }
    } else {
      console.error('ExternalTaskUI not initialized');
      if (typeof toastr !== 'undefined') {
        toastr.error('外挂任务UI未初始化，请稍后重试');
      } else {
        alert('外挂任务UI未初始化，请稍后重试');
      }
    }
  };
  
  
  
  
  
  // 创建 ActionButtons 实例
  console.log('Vectors Enhanced: Creating ActionButtons...');
  const actionButtons = new ActionButtons({
    settings,
    getVectorizableContent,
    shouldSkipContent,
    extractComplexTag,
    extractHtmlFormatTag,
    extractSimpleTag,
    substituteParams,
    exportVectors,
    vectorizeContent,
    isVectorizing: () => isVectorizing,
    vectorizationAbortController: () => vectorizationAbortController
  });

  // 初始化 ActionButtons
  console.log('Vectors Enhanced: Initializing ActionButtons...');
  actionButtons.init();

  // 设置全局ActionButtons引用
  globalActionButtons = actionButtons;

  // Task system status (legacy mode only)
  window.vectorsTaskSystemStatus = () => {
    const status = {
      taskManagerAvailable: false,
      legacyMode: true,
      storageReady: false,
      systemMode: 'Legacy'
    };
    console.log('Vectors Enhanced Task System Status:', status);
    return status;
  };

  // 初始化所有设置UI
  console.log('Vectors Enhanced: Initializing settings UI...');
  await settingsManager.initialize();
  console.log('Vectors Enhanced: Settings UI initialized');
  
  // 保存全局引用
  globalSettingsManager = settingsManager;

  // 初始化列表和任务
  await settingsManager.initializeLists();
  await settingsManager.initializeTaskList();

  // 初始化标签规则UI
  renderTagRulesUI();

  // 初始化隐藏消息信息
  MessageUI.updateHiddenMessagesInfo();

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
    await updateTaskList(getChatTasks, renameVectorTask, removeVectorTask);
    MessageUI.updateHiddenMessagesInfo();
    // Auto-cleanup invalid world info selections when switching chats
    if (settings.selected_content.world_info.enabled) {
      await cleanupInvalidSelections();
      await updateWorldInfoList();
    }
  });

  // 监听聊天重新加载事件，以便在使用 /hide 和 /unhide 命令后更新
  eventSource.on(event_types.CHAT_LOADED, async () => {
    MessageUI.updateHiddenMessagesInfo();
  });

  // Register slash commands
  SlashCommandParser.addCommandObject(
    SlashCommand.fromProps({
      name: 'vec-preview',
      callback: async () => {
        await MessageUI.previewContent(getVectorizableContent, shouldSkipContent, extractComplexTag, extractHtmlFormatTag, extractSimpleTag, settings, substituteParams);
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

  // 初始化隐藏消息信息显示
  MessageUI.updateHiddenMessagesInfo();



  // 初始化调试模块（如果启用）- 不阻塞主初始化
  initializeDebugModule().catch(err => {
    console.debug('[Vectors] Debug module initialization failed (this is normal in production):', err.message);
  });

    console.log('Vectors Enhanced: Initialization completed successfully');
  } catch (error) {
    console.error('Vectors Enhanced: Failed to initialize:', error);
    toastr.error(`Vectors Enhanced 初始化失败: ${error.message}`);
  }
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
 * Scans current selected content for tags and displays suggestions
 */
async function scanAndSuggestTags() {
    try {

        // Use the new function to get raw content
        const content = await getRawContentForScanning();
        if (!content || content.length === 0) {
            toastr.warning('没有选择任何内容进行扫描');
            return;
        }

        const combinedText = content.map(item => item.text).join('\n\n');
        if (combinedText.length === 0) {
            toastr.warning('选择的内容为空');
            return;
        }

        console.log(`开始扫描标签，总文本长度: ${combinedText.length} 字符`);

        const scanOptions = {
            chunkSize: 50000,
            maxTags: 100,
            timeoutMs: 5000
        };

        const scanResult = await scanTextForTags(combinedText, scanOptions);
        const suggestionResult = generateTagSuggestions(scanResult);
        displayTagSuggestions(suggestionResult.suggestions, scanResult.stats);

        console.log(`标签扫描完成，发现 ${scanResult.stats.tagsFound} 个标签，生成 ${suggestionResult.suggestions.length} 个建议，耗时 ${scanResult.stats.processingTimeMs}ms`);

        if (suggestionResult.suggestions.length > 0) {
            toastr.success(`发现 ${suggestionResult.suggestions.length} 个可用标签`);
        } else {
            toastr.info('未发现可提取的标签');
        }

    } catch (error) {
        console.error('标签扫描失败:', error);
        toastr.error('标签扫描失败: ' + error.message);
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
    updateTaskList: (getChatTasks, renameVectorTask, removeVectorTask) => updateTaskList(getChatTasks, renameVectorTask, removeVectorTask),
    analyzeTaskOverlap: analyzeTaskOverlap,

    // UI更新
    updateMasterSwitchState: () => updateMasterSwitchStateNew(settings),
    updateChatSettings: updateChatSettings,
    updateFileList: updateFileList,
    updateHiddenMessagesInfo: MessageUI.updateHiddenMessagesInfo,

    // 消息管理
    toggleMessageVisibility: toggleMessageVisibility,
    toggleMessageRangeVisibility: toggleMessageRangeVisibility,

    // 向量操作（如果可用）
    getSavedHashes: storageAdapter ? (collectionId) => storageAdapter.getSavedHashes(collectionId) : null,
    purgeVectorIndex: storageAdapter ? (collectionId) => storageAdapter.purgeVectorIndex(collectionId) : null,

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




/**
 * 更新隐藏消息信息显示
 */

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
  const end = Math.min(context.chat.length, endIndex === -1 ? context.chat.length : endIndex + 1);

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
    toastr.success(`已${action}消息 #${start} 到 #${endIndex}`);
  } catch (error) {
    console.error('批量切换消息可见性失败:', error);
    toastr.error('操作失败');
  }
}

