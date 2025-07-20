import { IContentExtractor } from './IContentExtractor.js';
import { Content } from '../entities/Content.js';
import { getFileAttachment } from '../../../../../../chats.js';

/**
 * @implements {IContentExtractor}
 */
export class FileExtractor {
    /**
     * Extracts content from a list of specified file paths.
     * @param {object|Array} source - The source configuration object or array of file items.
     * @param {string[]} [source.filePaths] - An array of file paths to extract content from.
     * @param {object} [config] - Additional configuration.
     * @returns {Promise<object>} A promise that resolves to extraction result with content and metadata.
     */
    async extract(source, config = {}) {
        const { chapterRegex } = config;
        let fileItems = [];

        if (Array.isArray(source)) {
            fileItems = source.map(item => ({
                path: item.metadata?.url || item.metadata?.path || item.url || item.text,
                name: item.metadata?.name || item.name || 'unknown',
                text: item.text || null
            }));
        } else if (source && source.filePaths) {
            fileItems = source.filePaths.map(path => ({
                path: path,
                name: path.split('/').pop(),
                text: null
            }));
        } else {
            throw new Error('Invalid source format: expected array of items or object with filePaths');
        }

        console.log(`FileExtractor: Processing ${fileItems.length} files`);

        const contentPromises = fileItems.map(async (item) => {
            try {
                const text = item.text ?? await getFileAttachment(item.path);
                if (text) {
                    return new Content(
                        item.path,
                        'file',
                        text,
                        {
                            fileName: item.name,
                            path: item.path,
                        }
                    );
                }
            } catch (error) {
                console.error(`[Vectors Enhanced] Error reading file ${item.path}:`, error);
            }
            return null;
        });

        const contents = (await Promise.all(contentPromises)).filter(Boolean);

        if (chapterRegex) {
            try {
                const regex = new RegExp(chapterRegex, 'gm');
                const chunks = [];
                let sequenceId = 0;

                for (const content of contents) {
                    const text = content.text;
                    let lastIndex = 0;
                    let match;
                    const chapters = [];

                    while ((match = regex.exec(text)) !== null) {
                        if (match.index > lastIndex) {
                            chapters.push({ text: text.substring(lastIndex, match.index) });
                        }
                        chapters.push({ text: text.substring(match.index, regex.lastIndex), chapter: match[0].trim() });
                        lastIndex = regex.lastIndex;
                    }

                    if (lastIndex < text.length) {
                        chapters.push({ text: text.substring(lastIndex) });
                    }

                    let currentChapter = null;
                    if (chapters.length > 1) { // Found chapters
                        for (const part of chapters) {
                            if (part.chapter) {
                                currentChapter = part.chapter;
                            }
                            if (part.text.trim()) {
                                chunks.push({
                                    text: part.text,
                                    metadata: {
                                        ...content.metadata,
                                        ...(currentChapter && { chapter: currentChapter }),
                                        sequence_id: sequenceId++,
                                    }
                                });
                            }
                        }
                    } else { // No chapters found, treat as single block
                        chunks.push({
                            text: content.text,
                            metadata: { ...content.metadata, sequence_id: sequenceId++ }
                        });
                    }
                }

                if (chunks.some(c => c.metadata.chapter)) {
                    console.log(`FileExtractor: Split content into ${chunks.length} chunks based on chapter regex.`);
                    return chunks;
                }
            } catch (error) {
                console.warn(`[Vectors Enhanced] Invalid chapter regex "${chapterRegex}". Falling back to default behavior.`, error);
            }
        }

        // Fallback: no regex, invalid regex, or no matches
        let sequenceId = 0;
        const result = contents.map(content => ({
            text: content.text,
            metadata: {
                ...content.metadata,
                sequence_id: sequenceId++,
            }
        }));

        console.log(`FileExtractor: Extracted ${result.length} file contents without chapter splitting.`);
        return result;
    }
}
