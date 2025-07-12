import { IContentExtractor } from './IContentExtractor.js';
import { Content } from '../entities/Content.js';
import { getFileAttachment } from '../../../../../../chats.js';

/**
 * @implements {IContentExtractor}
 */
export class FileExtractor {
    /**
     * Extracts content from a list of specified file paths.
     * @param {object} source - The source configuration object.
     * @param {string[]} source.filePaths - An array of file paths to extract content from.
     * @returns {Promise<Content[]>} A promise that resolves to an array of Content objects.
     */
    async extract(source) {
        const contentPromises = source.filePaths.map(async (filePath) => {
            try {
                const text = await getFileAttachment(filePath);
                if (text) {
                    return new Content(
                        filePath, // Use file path as a unique ID
                        'file',
                        text,
                        {
                            fileName: filePath.split('/').pop(),
                            path: filePath,
                        }
                    );
                }
            } catch (error) {
                console.error(`[Vectors Enhanced] Error reading file ${filePath}:`, error);
            }
            return null;
        });

        const contents = await Promise.all(contentPromises);
        return contents.filter(content => content !== null);
    }
}
