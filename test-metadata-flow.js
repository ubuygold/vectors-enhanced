// Test script to verify metadata flow through vectorization pipeline
// Run this in the browser console after the extension is loaded

async function testMetadataFlow() {
    console.log('=== Testing Metadata Flow ===');
    
    // Get the pipeline instance
    const pipeline = window.vectorsEnhancedPipeline;
    if (!pipeline) {
        console.error('Pipeline not found. Make sure vectors-enhanced extension is loaded.');
        return;
    }
    
    // Create test content with summary_vectorization taskType
    const testContent = [
        {
            text: '<history_story>Test story 1</history_story>',
            type: 'story',
            id: 'test-1'
        },
        {
            text: '<history_story>Test story 2</history_story>',
            type: 'story', 
            id: 'test-2'
        }
    ];
    
    // Test with summary_vectorization taskType
    console.log('Testing with taskType: summary_vectorization');
    
    try {
        const result = await pipeline.processSingleBlock({
            type: 'test_block',
            content: testContent,
            metadata: {
                test: true,
                source: 'test_script'
            }
        }, 'test-collection', 'summary_vectorization');
        
        console.log('Pipeline result:', result);
        
        // Check if chunks have the expected metadata
        if (result.chunks && result.chunks.length > 0) {
            console.log('First chunk metadata:', result.chunks[0].metadata);
            console.log('TaskType in first chunk:', result.chunks[0].metadata?.taskType);
        }
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run the test
testMetadataFlow();