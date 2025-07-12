import { IContentExtractor } from './IContentExtractor.js';
import { getSortedEntries } from '../../../../../../world-info.js';
import { extension_settings } from '../../../../../../extensions.js';

/**
 * @implements {IContentExtractor}
 */
export class WorldInfoExtractor {
    /**
     * Extracts content from world info entries based on current settings.
     * @param {object} source - The source configuration object.
     * @param {Object<string, string[]>} [source.selectedWorlds] - The selected world info entries grouped by world name.
     * @returns {Promise<object[]>} A promise that resolves to an array of VectorItem objects.
     */
    async extract(source) {
        const settings = extension_settings.vectors_enhanced;
        const items = [];

        // Check if world info is enabled
        if (!settings.selected_content.world_info.enabled) {
            return items;
        }

        // Get selected worlds from source or settings
        const selectedWorlds = source?.selectedWorlds || settings.selected_content.world_info.selected || {};
        
        // Get all world info entries
        const entries = await getSortedEntries();
        
        if (!entries || !Array.isArray(entries)) {
            console.warn('Vectors: No world info entries found or invalid format');
            return items;
        }

        // Debug information
        const totalSelected = Object.values(selectedWorlds).flat().length;
        console.debug('Vectors: Selected world info:', selectedWorlds);
        console.debug(`Vectors: Total selected world info entries: ${totalSelected}`);

        let processedCount = 0;

        // Process each entry
        for (const entry of entries) {
            // Skip invalid entries
            if (!entry.world || !entry.content || entry.disable) {
                continue;
            }

            // Check if this entry is selected
            const selectedEntries = selectedWorlds[entry.world] || [];
            if (!selectedEntries.includes(entry.uid)) {
                continue;
            }

            // Create vector item matching the expected format
            items.push({
                type: 'world_info',
                text: entry.content,
                metadata: {
                    world: entry.world,
                    uid: entry.uid,
                    key: entry.key ? entry.key.join(', ') : '',
                    comment: entry.comment || '',
                },
                selected: true,
            });

            processedCount++;
            console.debug(`Vectors: Successfully processed world info entry: ${entry.comment || entry.uid} from world ${entry.world}`);
        }

        console.debug(`Vectors: Actually processed ${processedCount} world info entries out of ${totalSelected} selected`);
        
        return items;
    }
}