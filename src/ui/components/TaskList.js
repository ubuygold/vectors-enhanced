import { extension_settings, getContext } from '../../../../../../extensions.js';
import { getCurrentChatId, saveSettingsDebounced } from '../../../../../../../script.js';
import { POPUP_RESULT, POPUP_TYPE, callGenericPopup } from '../../../../../../popup.js';
import { TaskNameGenerator } from '../../utils/taskNaming.js';
import { getSortedEntries } from '../../../../../../world-info.js';
import { getDataBankAttachments, getDataBankAttachmentsForSource } from '../../../../../../chats.js';

const settings = extension_settings.vectors_enhanced;

/**
 * Gets all available files from different sources (copied from index.js)
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
 * Updates the task list UI
 */
export async function updateTaskList(getChatTasks, renameVectorTask, removeVectorTask) {
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

    // Generate smart task name if actualProcessedItems is available
    let displayName = task.name;
    if (task.actualProcessedItems && (task.actualProcessedItems.chat || task.actualProcessedItems.files || task.actualProcessedItems.world_info)) {
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
      
      // Add file items
      if (task.actualProcessedItems.files) {
        task.actualProcessedItems.files.forEach(url => {
          items.push({
            type: 'file',
            metadata: { url: url }
          });
        });
      }
      
      // Add world info items
      if (task.actualProcessedItems.world_info) {
        task.actualProcessedItems.world_info.forEach(uid => {
          items.push({
            type: 'world_info',
            metadata: { uid: uid }
          });
        });
      }
      
      // Generate smart name
      displayName = TaskNameGenerator.generateSmartName(items, task.settings);
    }

    const checkbox = $(`
            <label class="checkbox_label flex-container alignItemsCenter">
                <input type="checkbox" ${task.enabled ? 'checked' : ''} />
                <span class="flex1">
                    <strong title="${task.name}">${displayName}</strong>${incrementalBadge}
                    <small class="text-muted"> - ${new Date(task.timestamp).toLocaleString('zh-CN')}</small>
                </span>
            </label>
        `);

    checkbox.find('input').on('change', function () {
      task.enabled = this.checked;
      Object.assign(extension_settings.vectors_enhanced, settings);
      saveSettingsDebounced();
    });

    const previewBtn = $(`<button class="menu_button menu_button_icon" title="预览此任务内容">
            <i class="fa-solid fa-eye"></i>
        </button>`);

    previewBtn.on('click', async () => {
      await previewTaskContent(task);
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
        await updateTaskList(getChatTasks, renameVectorTask, removeVectorTask);
        toastr.success('任务已删除');
      }
    });

    taskDiv.append(checkbox);
    taskDiv.append(previewBtn);
    taskDiv.append(renameBtn);
    taskDiv.append(deleteBtn);
    taskList.append(taskDiv);
  });
}

/**
 * Preview task content
 * @param {Object} task - The task to preview
 */
async function previewTaskContent(task) {
  if (!task.actualProcessedItems) {
    toastr.warning('此任务没有可预览的内容');
    return;
  }

  const context = getContext();
  const items = [];
  
  // Collect chat items
  if (task.actualProcessedItems.chat && task.actualProcessedItems.chat.length > 0) {
    const chatIndices = task.actualProcessedItems.chat;
    chatIndices.forEach(index => {
      if (context.chat[index]) {
        const msg = context.chat[index];
        items.push({
          type: 'chat',
          text: msg.mes,
          rawText: msg.mes, // Store raw text for toggle
          metadata: {
            index: index,
            is_user: msg.is_user,
            name: msg.name
          }
        });
      }
    });
  }
  
  // Collect file items
  if (task.actualProcessedItems.files && task.actualProcessedItems.files.length > 0) {
    // Get all available files to match URLs with file objects
    const fileMap = getAllAvailableFiles();
    
    task.actualProcessedItems.files.forEach(url => {
      const file = fileMap.get(url);
      if (file) {
        items.push({
          type: 'file',
          metadata: {
            name: file.name,
            url: url,
            size: file.size || 0
          }
        });
      } else {
        // Fallback if file not found
        const fileName = url.split('/').pop();
        items.push({
          type: 'file',
          metadata: {
            name: fileName,
            url: url,
            size: 0
          }
        });
      }
    });
  }
  
  // Collect world info items
  if (task.actualProcessedItems.world_info && task.actualProcessedItems.world_info.length > 0) {
    // Get all world info entries
    const entries = await getSortedEntries();
    const entryMap = new Map();
    entries.forEach(entry => {
      if (entry.uid) {
        entryMap.set(entry.uid, entry);
      }
    });
    
    task.actualProcessedItems.world_info.forEach(uid => {
      const entry = entryMap.get(uid);
      if (entry) {
        items.push({
          type: 'world_info',
          text: entry.content,
          metadata: {
            uid: uid,
            world: entry.world || '未知',
            comment: entry.comment || '(无注释)',
            key: entry.key ? entry.key.join(', ') : ''
          }
        });
      } else {
        // Fallback if entry not found
        items.push({
          type: 'world_info',
          metadata: {
            uid: uid,
            world: '未知',
            comment: `条目 UID: ${uid}`
          }
        });
      }
    });
  }

  if (items.length === 0) {
    toastr.warning('此任务没有可预览的内容');
    return;
  }

  // Build preview HTML matching global preview style
  let html = '<div class="vector-preview">';
  html += `<div class="preview-header">任务内容（${items.length} 项）</div>`;
  
  // Get saved preference from localStorage
  const showRawPreference = localStorage.getItem('vectors_preview_show_raw') === 'true';
  
  // Add toggle button for chat content view
  html += '<div class="preview-controls" style="text-align: center; margin-bottom: 1rem;">';
  html += '<label class="checkbox_label" style="display: inline-flex; align-items: center; gap: 0.5rem;">';
  html += `<input type="checkbox" id="preview-show-raw" ${showRawPreference ? 'checked' : ''} />`;
  html += '<span>显示原始内容</span>';
  html += '<kbd style="margin-left: 0.5rem; padding: 2px 6px; background: var(--SmartThemeBorderColor); border-radius: 3px; font-size: 0.9em;">R</kbd>';
  html += '</label>';
  html += '</div>';
  
  html += '<div class="preview-sections">';

  // Group by type
  const grouped = items.reduce((acc, item) => {
    if (!acc[item.type]) acc[item.type] = [];
    acc[item.type].push(item);
    return acc;
  }, {});

  // Always show all three sections for consistent layout
  // Files section
  html += '<div class="preview-section">';
  html += `<div class="preview-section-title">文件（${grouped.file?.length || 0}）</div>`;
  html += '<div class="preview-section-content">';
  if (grouped.file && grouped.file.length > 0) {
    grouped.file.forEach(item => {
      html += `<div class="preview-item">`;
      const sizeKB = item.metadata.size ? (item.metadata.size / 1024).toFixed(1) : '0';
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
    // Group by world if we have world info
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
      html += `<div class="preview-chat-message" data-index="${item.metadata.index}">`;
      html += `<div class="preview-chat-header">#${item.metadata.index} - ${msgType}（${item.metadata.name}）</div>`;
      // Escape HTML for raw text display
      const escapedRawText = item.rawText ? 
        item.rawText.replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;') : '';
      
      html += `<div class="preview-chat-content preview-processed" style="${showRawPreference ? 'display: none;' : ''}">${item.text}</div>`;
      if (item.rawText) {
        html += `<pre class="preview-chat-content preview-raw" style="white-space: pre-wrap; font-family: inherit; ${showRawPreference ? '' : 'display: none;'}">${escapedRawText}</pre>`;
      }
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
    onShow: () => {
      // Add toggle functionality
      $('#preview-show-raw').on('change', function() {
        const showRaw = $(this).prop('checked');
        // Save preference to localStorage
        localStorage.setItem('vectors_preview_show_raw', showRaw);
        
        if (showRaw) {
          $('.preview-processed').hide();
          $('.preview-raw').show();
        } else {
          $('.preview-processed').show();
          $('.preview-raw').hide();
        }
      });
      
      // Add keyboard shortcut (R key)
      $(document).on('keydown.preview', function(e) {
        if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          $('#preview-show-raw').prop('checked', !$('#preview-show-raw').prop('checked')).trigger('change');
        }
      });
    },
    onClose: () => {
      // Remove keyboard event listener when popup closes
      $(document).off('keydown.preview');
    }
  });
}
