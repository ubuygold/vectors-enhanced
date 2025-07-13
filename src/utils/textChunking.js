import {
  splitRecursive,
  trimToEndSentence,
  trimToStartSentence,
} from '../../../../../utils.js';

/**
 * Gets the chunk delimiters for splitting text.
 * @param {string} forceChunkDelimiter Optional forced delimiter
 * @returns {string[]} Array of chunk delimiters
 */
function getChunkDelimiters(forceChunkDelimiter) {
  const delimiters = ['\n\n', '\n', ' ', ''];
  if (forceChunkDelimiter) {
    delimiters.unshift(forceChunkDelimiter);
  }
  return delimiters;
}

/**
 * Modifies text chunks to include overlap with adjacent chunks.
 * @param {string} chunk Current item
 * @param {number} index Current index
 * @param {string[]} chunks List of chunks
 * @param {number} overlapSize Size of the overlap
 * @returns {string} Overlapped chunks
 */
function overlapChunks(chunk, index, chunks, overlapSize) {
  const halfOverlap = Math.floor(overlapSize / 2);
  const nextChunk = chunks[index + 1];
  const prevChunk = chunks[index - 1];

  const nextOverlap = trimToEndSentence(nextChunk?.substring(0, halfOverlap)) || '';
  const prevOverlap = trimToStartSentence(prevChunk?.substring(prevChunk.length - halfOverlap)) || '';
  const overlappedChunk = [prevOverlap, chunk, nextOverlap].filter(x => x).join(' ');

  return overlappedChunk;
}

/**
 * Splits text into chunks with optional overlap.
 * @param {string} text Text to split
 * @param {number} chunkSize Size of each chunk
 * @param {number} overlapPercent Overlap percentage
 * @param {string} forceChunkDelimiter Optional forced delimiter
 * @returns {string[]} Array of text chunks
 */
export function splitTextIntoChunks(text, chunkSize, overlapPercent, forceChunkDelimiter) {
  const delimiters = getChunkDelimiters(forceChunkDelimiter);
  const overlapSize = Math.round((chunkSize * overlapPercent) / 100);
  const adjustedChunkSize = overlapSize > 0 ? chunkSize - overlapSize : chunkSize;

  const chunks = splitRecursive(text, adjustedChunkSize, delimiters);

  if (overlapSize > 0) {
    return chunks.map((chunk, index) => overlapChunks(chunk, index, chunks, overlapSize));
  }

  return chunks;
}
