/**
 * Task naming utility module
 * Provides intelligent task name generation based on content patterns
 */

/**
 * Generates smart task names based on content and settings
 */
export class TaskNameGenerator {
    /**
     * Generate a smart task name based on items and settings
     * @param {Array} items - Array of items (chat messages, files, etc.)
     * @param {Object} settings - Current settings including tag filters
     * @returns {string} Generated task name
     */
    static generateSmartName(items, settings) {
        if (!items || items.length === 0) {
            return '空任务';
        }

        const chatItems = items.filter(item => item.type === 'chat');
        const components = [];
        
        // Message type pattern only
        const messageTypeInfo = this._analyzeMessageTypes(chatItems);
        if (messageTypeInfo) {
            components.push(messageTypeInfo);
        }
        
        // Combine components
        const prefix = components.join(' ');
        const range = this._getSimpleRange(chatItems);
        const count = chatItems.length;
        
        // Format with length control
        return this._formatWithLengthLimit(prefix, range, count);
    }

    /**
     * Analyze message types (user vs AI)
     * @private
     */
    static _analyzeMessageTypes(chatItems) {
        if (!chatItems || chatItems.length === 0) return null;
        
        const userMessages = chatItems.filter(item => item.metadata?.is_user);
        const aiMessages = chatItems.filter(item => !item.metadata?.is_user);
        
        const totalCount = chatItems.length;
        const userRatio = userMessages.length / totalCount;
        const aiRatio = aiMessages.length / totalCount;
        
        if (userRatio === 1) {
            return '用户消息';
        } else if (aiRatio === 1) {
            return 'AI消息';
        } else if (userRatio > 0.7) {
            return '主要用户';
        } else if (aiRatio > 0.7) {
            return '主要AI';
        }
        
        return null;
    }

    /**
     * Detect interval patterns in indices
     * @private
     */
    static _analyzeIntervalPattern(chatItems) {
        if (!chatItems || chatItems.length < 3) return null;
        
        const indices = chatItems
            .map(item => item.metadata?.index)
            .filter(index => index !== undefined)
            .sort((a, b) => a - b);
        
        if (indices.length < 3) return null;
        
        // Check for consistent intervals
        const intervals = [];
        for (let i = 1; i < indices.length; i++) {
            intervals.push(indices[i] - indices[i - 1]);
        }
        
        // Check if all intervals are the same
        const uniqueIntervals = [...new Set(intervals)];
        if (uniqueIntervals.length === 1 && uniqueIntervals[0] > 1) {
            return `间隔${uniqueIntervals[0]}`;
        }
        
        return null;
    }

    /**
     * Get simple range string for indices
     * @private
     */
    static _getSimpleRange(chatItems) {
        if (!chatItems || chatItems.length === 0) return '';
        
        const indices = chatItems
            .map(item => item.metadata?.index)
            .filter(index => index !== undefined)
            .sort((a, b) => a - b);
        
        if (indices.length === 0) return '';
        
        const min = indices[0];
        const max = indices[indices.length - 1];
        
        if (min === max) {
            return `#${min}`;
        }
        
        return `#${min}-#${max}`;
    }

    /**
     * Format the final name with length control
     * @private
     */
    static _formatWithLengthLimit(prefix, range, count, maxLength = 40) {
        // Base format - no parentheses
        let result = prefix 
            ? `${prefix} ${range}, ${count}层` 
            : `${range}, ${count}层`;
        
        // If within limit, return as is
        if (result.length <= maxLength) {
            return result;
        }
        
        // If too long, try shorter format
        if (prefix) {
            // Try without range
            result = `${prefix} ${count}层`;
            if (result.length <= maxLength) {
                return result;
            }
            
            // Try shortened prefix
            const shortPrefix = this._shortenPrefix(prefix);
            result = `${shortPrefix} ${count}层`;
        }
        
        return result;
    }

    /**
     * Shorten prefix components
     * @private
     */
    static _shortenPrefix(prefix) {
        const parts = prefix.split(' ');
        return parts.map(part => {
            if (part.startsWith('标签:')) {
                const tagContent = part.substring(3);
                if (tagContent.length > 10) {
                    return `标签:${tagContent.substring(0, 8)}..`;
                }
            }
            return part;
        }).join(' ');
    }

    /**
     * Generate a detailed range description for complex patterns
     * @param {Array} items - Array of items with indices
     * @returns {string} Formatted range description
     */
    static generateDetailedRange(items) {
        if (!items || items.length === 0) return '';
        
        const indices = items
            .map(item => item.metadata?.index)
            .filter(index => index !== undefined)
            .sort((a, b) => a - b);
        
        if (indices.length === 0) return '';
        
        // Identify continuous segments
        const segments = this._identifyContinuousSegments(indices);
        
        if (segments.length <= 3) {
            // Show all segments if not too many
            return segments.join(', ') + `, ${items.length}层`;
        } else {
            // Compress if too many segments
            const first = segments[0];
            const second = segments[1];
            const last = segments[segments.length - 1];
            return `${first}, ${second}...${last}, ${items.length}层`;
        }
    }

    /**
     * Identify continuous segments in indices
     * @private
     */
    static _identifyContinuousSegments(indices) {
        if (indices.length === 0) return [];
        
        const segments = [];
        let segmentStart = indices[0];
        let segmentEnd = indices[0];
        
        for (let i = 1; i < indices.length; i++) {
            if (indices[i] === segmentEnd + 1) {
                // Continue current segment
                segmentEnd = indices[i];
            } else {
                // End current segment and start new one
                segments.push(this._formatSegment(segmentStart, segmentEnd));
                segmentStart = indices[i];
                segmentEnd = indices[i];
            }
        }
        
        // Add the last segment
        segments.push(this._formatSegment(segmentStart, segmentEnd));
        
        return segments;
    }

    /**
     * Format a single segment
     * @private
     */
    static _formatSegment(start, end) {
        if (start === end) {
            return `#${start}`;
        }
        return `#${start}-#${end}`;
    }
}