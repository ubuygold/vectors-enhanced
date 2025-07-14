// src/ui/components/MessageUI.js

import { getContext } from '../../../../../../extensions.js';
import { callGenericPopup, POPUP_TYPE } from '../../../../../../popup.js';
import { parseTagWithExclusions, removeExcludedTags } from '../../utils/tagParser.js';
import { getHiddenMessages } from '../../utils/chatUtils.js';
import { extractTagContent } from '../../utils/tagExtractor.js';

export const MessageUI = {
  /**
   * 更新隐藏消息信息显示
   */
  updateHiddenMessagesInfo() {
    const context = getContext();
    const hidden = getHiddenMessages(context.chat);
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
  },

  /**
   * 显示当前隐藏的消息列表
   * @returns {Promise<void>}
   */
  async showHiddenMessages() {
    const context = getContext();
    const hidden = getHiddenMessages(context.chat);

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
  },

  /**
   * Previews vectorizable content
   * @param {Function} getVectorizableContent - Function to get content items.
   * @param {Function} shouldSkipContent - Function to check if content should be skipped.
   * @param {Function} extractComplexTag - Function to extract complex tags.
   * @param {Function} extractHtmlFormatTag - Function to extract HTML-like tags.
   * @param {Function} extractSimpleTag - Function to extract simple tags.
   * @param {object} settings - The extension settings object.
   * @param {Function} substituteParams - Function to substitute parameters in text.
   * @returns {Promise<void>}
   */
  async previewContent(getVectorizableContent, shouldSkipContent, extractComplexTag, extractHtmlFormatTag, extractSimpleTag, settings, substituteParams) {
    let items = await getVectorizableContent();
    // Filter out empty items for consistency with vectorization process
    items = items.filter(item => item.text && item.text.trim() !== '');

    if (items.length === 0) {
      toastr.warning('未选择要预览的内容或过滤后内容为空');
      return;
    }
    
    // We need to get the raw text (after tag extraction but before parameter substitution)
    // Unfortunately, at this point the text has already been processed through substituteParams
    // So we'll need to re-extract it from the original messages
    const context = getContext();
    const chatSettings = settings.selected_content.chat;
    const rules = chatSettings.tag_rules || [];
    
    // Create a map of index to raw extracted text
    const rawTextMap = new Map();
    
    if (chatSettings.enabled && context.chat) {
      const start = chatSettings.range?.start || 0;
      const end = chatSettings.range?.end || -1;
      const messages = context.chat.slice(start, end === -1 ? undefined : end + 1);
      
      messages.forEach((msg, idx) => {
        const absoluteIndex = start + idx;
        if (msg.is_system) return;
        
        // Extract text without parameter substitution
        let extractedText;
        if (absoluteIndex === 0 || msg.is_user === true) {
          // First floor or user messages: use original text without tag extraction
          extractedText = msg.mes;
        } else {
          // Other floors: apply tag extraction rules  
          extractedText = extractTagContent(msg.mes, rules);
        }
        
        rawTextMap.set(absoluteIndex, extractedText);
      });
    }
    
    // Store raw text for each chat item
    items.forEach(item => {
      if (item.type === 'chat' && rawTextMap.has(item.metadata.index)) {
        item.rawText = rawTextMap.get(item.metadata.index);
      }
    });

    // 统计过滤信息
    let totalOriginalBlocks = 0;
    let excludedBlocks = 0;
    let blacklistedBlocks = 0;
    let finalBlocks = 0;

    // 模拟处理过程以获取统计信息
    const blacklist = settings.content_blacklist || [];
    // chatSettings already declared above, reuse it
    // 不要在这里分割标签，直接使用原始标签字符串
    const tags = chatSettings.tags ? [chatSettings.tags.trim()] : [];

    if (chatSettings.enabled && tags.length > 0) {
      const context = getContext();
      const start = chatSettings.range?.start || 0;
      const end = chatSettings.range?.end || -1;
      // Make end index inclusive by adding 1 to the slice operation
      const messages = context.chat.slice(start, end === -1 ? undefined : end + 1);

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
    
    // Add toggle button for chat content view
    html += '<div class="preview-controls" style="text-align: center; margin-bottom: 1rem;">';
    html += '<label class="checkbox_label" style="display: inline-flex; align-items: center; gap: 0.5rem;">';
    html += '<input type="checkbox" id="preview-show-raw" />';
    html += '<span>显示原始内容（标签筛选后）</span>';
    html += '</label>';
    html += '</div>';

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
        html += `<div class="preview-chat-message" data-index="${item.metadata.index}">`;
        html += `<div class="preview-chat-header">#${item.metadata.index} - ${msgType}（${item.metadata.name}）</div>`;
        html += `<div class="preview-chat-content preview-processed">${item.text}</div>`;
        if (item.rawText) {
          html += `<div class="preview-chat-content preview-raw" style="display: none;">${item.rawText}</div>`;
        }
        html += `</div>`;
      });
    } else {
      html += '<div class="preview-empty">无聊天记录</div>';
    }
    html += '</div></div>';

    html += '</div></div>';

    const popupResult = await callGenericPopup(html, POPUP_TYPE.TEXT, '', {
      okButton: '关闭',
      wide: true,
      large: true,
      onShow: () => {
        // Add toggle functionality
        $('#preview-show-raw').on('change', function() {
          const showRaw = $(this).prop('checked');
          if (showRaw) {
            $('.preview-processed').hide();
            $('.preview-raw').show();
          } else {
            $('.preview-processed').show();
            $('.preview-raw').hide();
          }
        });
      }
    });
  }
};
