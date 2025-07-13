import { extension_settings } from '../../../../../../extensions.js';
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
    taskDiv.append(renameBtn);
    taskDiv.append(deleteBtn);
    taskList.append(taskDiv);
  });
}
