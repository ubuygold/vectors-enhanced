import { extension_settings, getContext } from '../../../../../../extensions.js';
import { getCurrentChatId, saveSettingsDebounced } from '../../../../../../../script.js';
import { POPUP_RESULT, POPUP_TYPE, callGenericPopup } from '../../../../../../popup.js';
import { TaskNameGenerator } from '../../utils/taskNaming.js';

const settings = extension_settings.vectors_enhanced;

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
    // For now, just show file URLs as we don't have access to file content
    task.actualProcessedItems.files.forEach(url => {
      const fileName = url.split('/').pop();
      items.push({
        type: 'file',
        metadata: {
          name: fileName,
          url: url,
          size: 0 // We don't have size info for now
        }
      });
    });
  }
  
  // Collect world info items
  if (task.actualProcessedItems.world_info && task.actualProcessedItems.world_info.length > 0) {
    // For now, just show UIDs as we don't have access to world info content
    task.actualProcessedItems.world_info.forEach(uid => {
      items.push({
        type: 'world_info',
        metadata: {
          uid: uid,
          world: '未知',
          comment: `条目 UID: ${uid}`
        }
      });
    });
  }

  if (items.length === 0) {
    toastr.warning('此任务没有可预览的内容');
    return;
  }

  // Build preview HTML
  let html = '<div class="vector-preview">';
  html += `<div class="preview-header">任务内容（${items.length} 项）</div>`;
  html += '<div class="preview-sections">';

  // Group by type
  const grouped = items.reduce((acc, item) => {
    if (!acc[item.type]) acc[item.type] = [];
    acc[item.type].push(item);
    return acc;
  }, {});

  // Files section
  if (grouped.file && grouped.file.length > 0) {
    html += '<div class="preview-section">';
    html += `<div class="preview-section-title">文件（${grouped.file.length}）</div>`;
    html += '<div class="preview-section-content">';
    grouped.file.forEach(item => {
      html += `<div class="preview-item">`;
      html += `<strong>${item.metadata.name}</strong>`;
      html += `</div>`;
    });
    html += '</div></div>';
  }

  // World Info section
  if (grouped.world_info && grouped.world_info.length > 0) {
    html += '<div class="preview-section">';
    html += `<div class="preview-section-title">世界信息（${grouped.world_info.length}）</div>`;
    html += '<div class="preview-section-content">';
    grouped.world_info.forEach(entry => {
      html += `<div class="preview-world-entry">${entry.metadata.comment}</div>`;
    });
    html += '</div></div>';
  }

  // Chat messages section
  if (grouped.chat && grouped.chat.length > 0) {
    html += '<div class="preview-section">';
    html += `<div class="preview-section-title">聊天记录（${grouped.chat.length} 条消息）</div>`;
    html += '<div class="preview-section-content">';
    grouped.chat.forEach(item => {
      const msgType = item.metadata.is_user ? '用户' : 'AI';
      html += `<div class="preview-chat-message">`;
      html += `<div class="preview-chat-header">#${item.metadata.index} - ${msgType}（${item.metadata.name}）</div>`;
      html += `<div class="preview-chat-content">${item.text}</div>`;
      html += `</div>`;
    });
    html += '</div></div>';
  }

  html += '</div></div>';

  await callGenericPopup(html, POPUP_TYPE.TEXT, '', {
    okButton: '关闭',
    wide: true,
    large: true,
  });
}
