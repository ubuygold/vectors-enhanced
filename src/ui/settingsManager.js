/**
 * 设置管理器模块
 * 负责UI设置的初始化、事件绑定和状态同步
 */

import { ConfigManager } from '../infrastructure/ConfigManager.js';
import { updateFileList } from './components/FileList.js';
import { updateWorldInfoList } from './components/WorldInfoList.js';
import { renderTagRulesUI } from './components/TagRulesEditor.js';
import { updateTaskList } from './components/TaskList.js';
import { MessageUI } from './components/MessageUI.js';
import { 
  updateMasterSwitchState, 
  updateContentSelection,
  toggleSettings
} from './domUtils.js';
import { updateChatSettings } from './components/ChatSettings.js';
import { clearTagSuggestions } from './components/TagUI.js';

/**
 * 设置管理器类
 * 集中管理所有设置相关的UI初始化和事件处理
 */
export class SettingsManager {
  constructor(settings, configManager, dependencies) {
    this.settings = settings;
    this.configManager = configManager;
    this.dependencies = dependencies;
    this.initialized = false;
  }

  /**
   * 初始化所有设置UI
   */
  async initialize() {
    if (this.initialized) {
      console.warn('SettingsManager already initialized');
      return;
    }

    this.initialized = true;

    // 初始化主开关
    this.initializeMasterSwitch();

    // 初始化基础设置
    this.initializeBasicSettings();

    // 初始化向量化源设置
    this.initializeVectorizationSettings();

    // 初始化 Rerank 设置
    this.initializeRerankSettings();

    // 初始化查询设置
    this.initializeQuerySettings();

    // 初始化内容选择设置
    await this.initializeContentSelectionSettings();

    // 初始化内容标签设置
    this.initializeContentTagSettings();

    // 初始化注入设置
    this.initializeInjectionSettings();

    // 初始化其他设置
    this.initializeMiscellaneousSettings();
    
    // 初始化实验性设置
    this.initializeExperimentalSettings();

    // 初始化UI状态
    this.initializeUIState();

    // 绑定其他事件
    this.bindOtherEvents();
    
    // 清除标签建议（防止空的"发现的标签"框显示）
    clearTagSuggestions();
  }

  /**
   * 初始化主开关
   */
  initializeMasterSwitch() {
    const { saveSettingsDebounced } = this.dependencies;

    $('#vectors_enhanced_master_enabled')
      .prop('checked', this.settings.master_enabled)
      .on('change', () => {
        this.settings.master_enabled = $('#vectors_enhanced_master_enabled').prop('checked');
        this.updateAndSave();
        updateMasterSwitchState(this.settings);
      });

    // 初始化主开关状态
    updateMasterSwitchState(this.settings);
  }

  /**
   * 初始化基础设置
   */
  initializeBasicSettings() {
    // 向量化源
    $('#vectors_enhanced_source')
      .val(this.settings.source)
      .on('change', () => {
        this.settings.source = String($('#vectors_enhanced_source').val());
        this.updateAndSave();
        toggleSettings(this.settings);
      });

    // 自动向量化
    $('#vectors_enhanced_auto_vectorize')
      .prop('checked', this.settings.auto_vectorize)
      .on('input', () => {
        this.settings.auto_vectorize = $('#vectors_enhanced_auto_vectorize').prop('checked');
        this.updateAndSave();
      });

    // 块大小
    $('#vectors_enhanced_chunk_size')
      .val(this.settings.chunk_size)
      .on('input', () => {
        this.settings.chunk_size = Number($('#vectors_enhanced_chunk_size').val());
        this.updateAndSave();
      });

    // 重叠百分比
    $('#vectors_enhanced_overlap_percent')
      .val(this.settings.overlap_percent)
      .on('input', () => {
        this.settings.overlap_percent = Number($('#vectors_enhanced_overlap_percent').val());
        this.updateAndSave();
      });

    // 分块分隔符
    $('#vectors_enhanced_force_chunk_delimiter')
      .val(this.settings.force_chunk_delimiter)
      .on('input', () => {
        this.settings.force_chunk_delimiter = String($('#vectors_enhanced_force_chunk_delimiter').val());
        this.updateAndSave();
      });

    // 分数阈值
    $('#vectors_enhanced_score_threshold')
      .val(this.settings.score_threshold)
      .on('input', () => {
        this.settings.score_threshold = Number($('#vectors_enhanced_score_threshold').val());
        this.updateAndSave();
      });
  }

  /**
   * 初始化向量化源设置
   */
  initializeVectorizationSettings() {
    // vLLM 设置
    $('#vectors_enhanced_vllm_model')
      .val(this.settings.vllm_model)
      .on('input', () => {
        this.settings.vllm_model = String($('#vectors_enhanced_vllm_model').val());
        this.updateAndSave();
      });

    $('#vectors_enhanced_vllm_url')
      .val(this.settings.vllm_url)
      .on('input', () => {
        this.settings.vllm_url = String($('#vectors_enhanced_vllm_url').val());
        this.updateAndSave();
      });

    // 本地模型设置
    $('#vectors_enhanced_local_model')
      .val(this.settings.local_model)
      .on('input', () => {
        this.settings.local_model = String($('#vectors_enhanced_local_model').val());
        this.updateAndSave();
      });

    // Ollama 设置
    $('#vectors_enhanced_ollama_model')
      .val(this.settings.ollama_model)
      .on('input', () => {
        this.settings.ollama_model = String($('#vectors_enhanced_ollama_model').val());
        this.updateAndSave();
      });

    $('#vectors_enhanced_ollama_url')
      .val(this.settings.ollama_url)
      .on('input', () => {
        this.settings.ollama_url = String($('#vectors_enhanced_ollama_url').val());
        this.updateAndSave();
      });

    $('#vectors_enhanced_ollama_keep')
      .prop('checked', this.settings.ollama_keep)
      .on('input', () => {
        this.settings.ollama_keep = $('#vectors_enhanced_ollama_keep').prop('checked');
        this.updateAndSave();
      });
  }

  /**
   * 初始化 Rerank 设置
   */
  initializeRerankSettings() {
    $('#vectors_enhanced_rerank_enabled')
      .prop('checked', this.settings.rerank_enabled)
      .on('input', () => {
        this.settings.rerank_enabled = $('#vectors_enhanced_rerank_enabled').prop('checked');
        
        // 如果 Rerank 被启用，确保向量查询也被启用
        if (this.settings.rerank_enabled) {
          $('#vectors_enhanced_enabled').prop('checked', true);
          this.settings.enabled = true;
        }
        
        this.updateAndSave();
      });

    $('#vectors_enhanced_rerank_url')
      .val(this.settings.rerank_url)
      .on('input', () => {
        this.settings.rerank_url = $('#vectors_enhanced_rerank_url').val();
        this.updateAndSave();
      });

    $('#vectors_enhanced_rerank_apiKey')
      .val(this.settings.rerank_apiKey)
      .on('input', () => {
        this.settings.rerank_apiKey = $('#vectors_enhanced_rerank_apiKey').val();
        this.updateAndSave();
      });

    $('#vectors_enhanced_rerank_model')
      .val(this.settings.rerank_model)
      .on('input', () => {
        this.settings.rerank_model = $('#vectors_enhanced_rerank_model').val();
        this.updateAndSave();
      });

    $('#vectors_enhanced_rerank_top_n')
      .val(this.settings.rerank_top_n)
      .on('input', () => {
        this.settings.rerank_top_n = Number($('#vectors_enhanced_rerank_top_n').val());
        this.updateAndSave();
      });

    $('#vectors_enhanced_rerank_hybrid_alpha')
      .val(this.settings.rerank_hybrid_alpha)
      .on('input', () => {
        this.settings.rerank_hybrid_alpha = Number($('#vectors_enhanced_rerank_hybrid_alpha').val());
        this.updateAndSave();
      });

    $('#vectors_enhanced_rerank_success_notify')
      .prop('checked', this.settings.rerank_success_notify)
      .on('input', () => {
        this.settings.rerank_success_notify = $('#vectors_enhanced_rerank_success_notify').prop('checked');
        this.updateAndSave();
      });
  }

  /**
   * 初始化查询设置
   */
  initializeQuerySettings() {
    // 启用向量查询
    $('#vectors_enhanced_enabled')
      .prop('checked', this.settings.enabled)
      .on('input', () => {
        this.settings.enabled = $('#vectors_enhanced_enabled').prop('checked');
        this.updateAndSave();
      });

    // 查询消息数
    $('#vectors_enhanced_query_messages')
      .val(this.settings.query_messages)
      .on('input', () => {
        this.settings.query_messages = Number($('#vectors_enhanced_query_messages').val());
        this.updateAndSave();
      });

    // 最大结果数
    $('#vectors_enhanced_max_results')
      .val(this.settings.max_results)
      .on('input', () => {
        this.settings.max_results = Number($('#vectors_enhanced_max_results').val());
        this.updateAndSave();
      });

    // 显示查询通知
    $('#vectors_enhanced_show_query_notification')
      .prop('checked', this.settings.show_query_notification)
      .on('input', () => {
        this.settings.show_query_notification = $('#vectors_enhanced_show_query_notification').prop('checked');
        this.updateAndSave();
        // 控制详细选项的显示/隐藏
        $('#vectors_enhanced_notification_details').toggle(this.settings.show_query_notification);
      });

    // 详细通知模式
    $('#vectors_enhanced_detailed_notification')
      .prop('checked', this.settings.detailed_notification)
      .on('input', () => {
        this.settings.detailed_notification = $('#vectors_enhanced_detailed_notification').prop('checked');
        this.updateAndSave();
      });
      
    // 初始化详细选项的显示状态
    $('#vectors_enhanced_notification_details').toggle(this.settings.show_query_notification);
  }

  /**
   * 初始化内容选择设置
   */
  async initializeContentSelectionSettings() {
    const { updateFileList, updateWorldInfoList } = this.dependencies;

    // 聊天消息
    $('#vectors_enhanced_chat_enabled')
      .prop('checked', this.settings.selected_content.chat.enabled)
      .on('input', () => {
        this.settings.selected_content.chat.enabled = $('#vectors_enhanced_chat_enabled').prop('checked');
        this.updateAndSave();
        updateContentSelection(this.settings);
      });

    // 文件
    $('#vectors_enhanced_files_enabled')
      .prop('checked', this.settings.selected_content.files.enabled)
      .on('input', async () => {
        this.settings.selected_content.files.enabled = $('#vectors_enhanced_files_enabled').prop('checked');
        this.updateAndSave();
        updateContentSelection(this.settings);
        if (this.settings.selected_content.files.enabled) {
          await updateFileList();
        }
      });

    // 世界信息
    $('#vectors_enhanced_wi_enabled')
      .prop('checked', this.settings.selected_content.world_info.enabled)
      .on('input', async () => {
        this.settings.selected_content.world_info.enabled = $('#vectors_enhanced_wi_enabled').prop('checked');
        this.updateAndSave();
        updateContentSelection(this.settings);
        if (this.settings.selected_content.world_info.enabled) {
          await updateWorldInfoList();
        }
        // 渲染标签规则UI
        renderTagRulesUI();
      });

    // 聊天设置
    this.initializeChatSettings();

    // 刷新按钮
    $('#vectors_enhanced_files_refresh').on('click', async () => {
      await updateFileList();
      toastr.info('文件列表已刷新');
    });

    $('#vectors_enhanced_wi_refresh').on('click', async () => {
      await updateWorldInfoList();
      toastr.info('世界信息列表已刷新');
    });
  }

  /**
   * 初始化聊天设置
   */
  initializeChatSettings() {
    // 确保所有属性都存在
    const chatRange = this.settings.selected_content.chat.range || { start: 0, end: -1 };
    const chatTypes = this.settings.selected_content.chat.types || { user: true, assistant: true };

    // 消息范围
    $('#vectors_enhanced_chat_start')
      .val(chatRange.start)
      .on('input', () => {
        if (!this.settings.selected_content.chat.range) {
          this.settings.selected_content.chat.range = { start: 0, end: -1 };
        }
        this.settings.selected_content.chat.range.start = Number($('#vectors_enhanced_chat_start').val());
        this.updateAndSave();
      });

    $('#vectors_enhanced_chat_end')
      .val(chatRange.end)
      .on('input', () => {
        if (!this.settings.selected_content.chat.range) {
          this.settings.selected_content.chat.range = { start: 0, end: -1 };
        }
        this.settings.selected_content.chat.range.end = Number($('#vectors_enhanced_chat_end').val());
        this.updateAndSave();
      });

    // 消息类型
    $('#vectors_enhanced_chat_user')
      .prop('checked', chatTypes.user)
      .on('input', () => {
        if (!this.settings.selected_content.chat.types) {
          this.settings.selected_content.chat.types = { user: true, assistant: true };
        }
        this.settings.selected_content.chat.types.user = $('#vectors_enhanced_chat_user').prop('checked');
        this.updateAndSave();
      });

    $('#vectors_enhanced_chat_assistant')
      .prop('checked', chatTypes.assistant)
      .on('input', () => {
        if (!this.settings.selected_content.chat.types) {
          this.settings.selected_content.chat.types = { user: true, assistant: true };
        }
        this.settings.selected_content.chat.types.assistant = $('#vectors_enhanced_chat_assistant').prop('checked');
        this.updateAndSave();
      });

    // 包含隐藏消息
    $('#vectors_enhanced_chat_include_hidden')
      .prop('checked', this.settings.selected_content.chat.include_hidden || false)
      .on('input', () => {
        if (!this.settings.selected_content.chat) {
          this.settings.selected_content.chat = {};
        }
        this.settings.selected_content.chat.include_hidden = $('#vectors_enhanced_chat_include_hidden').prop('checked');
        this.updateAndSave();
      });
  }

  /**
   * 初始化内容标签设置
   */
  initializeContentTagSettings() {
    // 确保向后兼容
    if (!this.settings.content_tags) {
      this.settings.content_tags = {
        chat: 'past_chat',
        file: 'databank',
        world_info: 'world_part',
      };
    }

    $('#vectors_enhanced_tag_chat')
      .val(this.settings.content_tags.chat)
      .on('input', () => {
        const value = $('#vectors_enhanced_tag_chat').val().trim() || 'past_chat';
        this.settings.content_tags.chat = value;
        this.updateAndSave();
      });

    $('#vectors_enhanced_tag_wi')
      .val(this.settings.content_tags.world_info)
      .on('input', () => {
        const value = $('#vectors_enhanced_tag_wi').val().trim() || 'world_part';
        this.settings.content_tags.world_info = value;
        this.updateAndSave();
      });

    $('#vectors_enhanced_tag_file')
      .val(this.settings.content_tags.file)
      .on('input', () => {
        const value = $('#vectors_enhanced_tag_file').val().trim() || 'databank';
        this.settings.content_tags.file = value;
        this.updateAndSave();
      });
  }

  /**
   * 初始化注入设置
   */
  initializeInjectionSettings() {
    // 模板
    $('#vectors_enhanced_template')
      .val(this.settings.template)
      .on('input', () => {
        this.settings.template = String($('#vectors_enhanced_template').val());
        this.updateAndSave();
      });

    // 深度
    $('#vectors_enhanced_depth')
      .val(this.settings.depth)
      .on('input', () => {
        this.settings.depth = Number($('#vectors_enhanced_depth').val());
        this.updateAndSave();
      });

    // 位置
    $(`input[name="vectors_position"][value="${this.settings.position}"]`).prop('checked', true);
    $('input[name="vectors_position"]').on('change', () => {
      this.settings.position = Number($('input[name="vectors_position"]:checked').val());
      this.updateAndSave();
    });

    // 深度角色
    $('#vectors_enhanced_depth_role')
      .val(this.settings.depth_role)
      .on('change', () => {
        this.settings.depth_role = Number($('#vectors_enhanced_depth_role').val());
        this.updateAndSave();
      });

    // 包含世界信息
    $('#vectors_enhanced_include_wi')
      .prop('checked', this.settings.include_wi)
      .on('input', () => {
        this.settings.include_wi = $('#vectors_enhanced_include_wi').prop('checked');
        this.updateAndSave();
      });
  }

  /**
   * 初始化其他设置
   */
  initializeMiscellaneousSettings() {
    // 内容过滤黑名单
    $('#vectors_enhanced_content_blacklist')
      .val(Array.isArray(this.settings.content_blacklist) ? this.settings.content_blacklist.join('\n') : '')
      .on('input', () => {
        const blacklistText = $('#vectors_enhanced_content_blacklist').val();
        this.settings.content_blacklist = blacklistText
          .split('\n')
          .map(line => line.trim())
          .filter(line => line);
        this.updateAndSave();
      });
  }

  /**
   * 初始化UI状态
   */
  initializeUIState() {
    // 切换设置显示
    toggleSettings(this.settings);
    
    // 更新内容选择
    updateContentSelection(this.settings);
    
    // 更新聊天设置
    updateChatSettings();
    
    // 初始化通知详细选项的显示状态
    $('#vectors_enhanced_notification_details').toggle(this.settings.show_query_notification);
    
    // 隐藏进度条和重置按钮状态
    $('#vectors_enhanced_progress').hide();
    $('#vectors_enhanced_vectorize').show();
    $('#vectors_enhanced_abort').hide();
    
    // 重置进度条样式
    $('#vectors_enhanced_progress .progress-bar-inner').css('width', '0%');
    $('#vectors_enhanced_progress .progress-text').text('准备中...');
  }

  /**
   * 绑定其他事件
   */
  bindOtherEvents() {
    const { 
      toggleMessageRangeVisibility, 
      showTagExamples, 
      scanAndSuggestTags 
    } = this.dependencies;

    // 隐藏消息管理按钮
    $('#vectors_enhanced_hide_range').on('click', async () => {
      const start = Number($('#vectors_enhanced_chat_start').val()) || 0;
      const end = Number($('#vectors_enhanced_chat_end').val()) || -1;
      await toggleMessageRangeVisibility(start, end, true);
      MessageUI.updateHiddenMessagesInfo();
    });

    $('#vectors_enhanced_unhide_range').on('click', async () => {
      const start = Number($('#vectors_enhanced_chat_start').val()) || 0;
      const end = Number($('#vectors_enhanced_chat_end').val()) || -1;
      await toggleMessageRangeVisibility(start, end, false);
      MessageUI.updateHiddenMessagesInfo();
    });

    $('#vectors_enhanced_show_hidden').on('click', async () => {
      await MessageUI.showHiddenMessages();
    });

    // 标签相关按钮
    $('#vectors_enhanced_tag_examples').on('click', async () => {
      await showTagExamples();
    });

    $('#vectors_enhanced_tag_scanner').on('click', async () => {
      await scanAndSuggestTags();
    });

    // 添加新规则按钮
    $('#vectors_enhanced_add_rule').on('click', () => {
      if (!this.settings.selected_content.chat.tag_rules) {
        this.settings.selected_content.chat.tag_rules = [];
      }
      this.settings.selected_content.chat.tag_rules.push({
        type: 'include',
        value: '',
        enabled: true,
      });
      this.updateAndSave();
      renderTagRulesUI();
    });

    // 清除标签建议按钮
    $('#vectors_enhanced_clear_suggestions').on('click', () => {
      clearTagSuggestions();
    });

    // 排除小CoT按钮
    $('#vectors_enhanced_exclude_cot').on('click', () => {
      if (!this.settings.selected_content.chat.tag_rules) {
        this.settings.selected_content.chat.tag_rules = [];
      }

      const cotRule = {
        type: 'regex_exclude',
        value: '<!--[\\s\\S]*?-->',
        enabled: true,
      };

      const alreadyExists = this.settings.selected_content.chat.tag_rules.some(
        rule => rule.type === cotRule.type && rule.value === cotRule.value
      );

      if (alreadyExists) {
        toastr.info('已存在排除HTML注释的规则。');
        return;
      }

      this.settings.selected_content.chat.tag_rules.push(cotRule);
      this.updateAndSave();
      renderTagRulesUI();
      toastr.success('已添加规则：排除HTML注释');
    });
  }

  /**
   * 更新设置并保存
   */
  updateAndSave() {
    const { extension_settings, saveSettingsDebounced } = this.dependencies;
    Object.assign(extension_settings.vectors_enhanced, this.settings);
    saveSettingsDebounced();
  }

  /**
   * 初始化列表（如果启用）
   */
  async initializeLists() {
    const { updateFileList, updateWorldInfoList } = this.dependencies;

    if (this.settings.selected_content.files.enabled) {
      await updateFileList();
    }
    if (this.settings.selected_content.world_info.enabled) {
      await updateWorldInfoList();
    }
  }

  /**
   * 初始化任务列表
   */
  async initializeTaskList() {
    const { getChatTasks, renameVectorTask, removeVectorTask } = this.dependencies;
    await updateTaskList(getChatTasks, renameVectorTask, removeVectorTask);
  }
  
  /**
   * 初始化实验性设置
   */
  initializeExperimentalSettings() {
    // 文本处理管道开关
    $('#vectors_enhanced_use_pipeline')
      .prop('checked', this.settings.use_pipeline || false)
      .on('change', () => {
        this.settings.use_pipeline = $('#vectors_enhanced_use_pipeline').prop('checked');
        this.updateAndSave();
        
        // Log the state change
        console.log(`Vectors Enhanced: Pipeline mode ${this.settings.use_pipeline ? 'enabled' : 'disabled'}`);
        
        // Show notification
        const message = this.settings.use_pipeline 
          ? '已启用文本处理管道 (实验性功能)' 
          : '已禁用文本处理管道，使用传统实现';
        
        // toastr is available globally in SillyTavern
        if (typeof toastr !== 'undefined') {
          toastr.info(message);
        } else {
          console.log(message);
        }
      });
  }
}