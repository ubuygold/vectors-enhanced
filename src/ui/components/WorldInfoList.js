import { extension_settings } from '../../../../../../extensions.js';
import { saveSettingsDebounced } from '../../../../../../../script.js';
import { getSortedEntries } from '../../../../../../world-info.js';

export async function updateWorldInfoList() {
  const settings = extension_settings.vectors_enhanced;
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
      const isChecked = $(this).prop('checked');

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

        if ($(this).prop('checked')) {
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
