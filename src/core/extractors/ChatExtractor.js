import { IContentExtractor } from './IContentExtractor.js';
import { getMessages, createVectorItem } from '../../utils/chatUtils.js';
import { extractTagContent } from '../../utils/tagExtractor.js';
import { extension_settings } from '../../../../../../extensions.js';

/**
 * @implements {IContentExtractor}
 */
export class ChatExtractor {
    /**
     * Extracts content from chat history based on current settings.
     * @param {object} source - The source configuration object.
     * @param {Array} source.chat - The chat history array.
     * @returns {Promise<object[]>} A promise that resolves to an array of VectorItem objects.
     */
    async extract(source) {
        const { chat } = source;
        const settings = extension_settings.vectors_enhanced;
        const items = [];

        if (settings.selected_content.chat.enabled && chat) {
            const chatSettings = settings.selected_content.chat;
            const rules = chatSettings.tag_rules || [];

            const messageOptions = {
                includeHidden: chatSettings.include_hidden || false,
                types: chatSettings.types || { user: true, assistant: true },
                range: chatSettings.range,
                newRanges: chatSettings.newRanges
            };

            const messages = getMessages(chat, messageOptions);

            messages.forEach(msg => {
                let extractedText;
                if (msg.index === 0 || msg.is_user === true) {
                    extractedText = msg.text;
                } else {
                    extractedText = extractTagContent(msg.text, rules);
                }
                items.push(createVectorItem(msg, extractedText));
            });
        }
        return items;
    }
}
