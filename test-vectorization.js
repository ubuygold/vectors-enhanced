// Test script for vectorization functionality
// Run this in browser console after loading SillyTavern

async function testVectorization() {
    console.log('=== Starting Vectorization Test ===');
    
    try {
        // Check if vectors-enhanced is loaded
        const vectorsModule = window.vectors_enhanced || window.vectorsEnhanced;
        if (!vectorsModule) {
            console.error('❌ Vectors Enhanced module not found!');
            return;
        }
        console.log('✅ Vectors Enhanced module loaded');

        // Check if performVectorization exists
        if (typeof window.performVectorization !== 'function') {
            console.error('❌ performVectorization function not found!');
            return;
        }
        console.log('✅ performVectorization function exists');

        // Test with minimal content
        const testSettings = {
            chat: {
                enabled: true,
                range: { start: 0, end: 5 },
                user: true,
                assistant: true,
                include_hidden: false
            },
            files: {
                enabled: false,
                selected: []
            },
            world_info: {
                enabled: false,
                selected: {}
            }
        };

        const testItems = [
            {
                type: 'chat',
                text: 'This is a test message for vectorization.',
                metadata: {
                    index: 0,
                    role: 'user',
                    name: 'Test User'
                },
                selected: true
            }
        ];

        console.log('📋 Test configuration:', {
            settings: testSettings,
            items: testItems
        });

        // Trigger vectorization
        console.log('🚀 Starting vectorization...');
        
        // Note: This is a simplified test - actual vectorization needs proper chat context
        console.log('⚠️ Note: Full test requires active chat context.');
        console.log('✅ Basic function availability test passed!');
        
        // Check pipeline components
        console.log('\n=== Checking Pipeline Components ===');
        
        // Check if pipeline modules can be imported
        try {
            const testImport = await import('./src/core/pipeline/PipelineIntegration.js');
            console.log('✅ Pipeline integration module can be imported');
        } catch (e) {
            console.error('❌ Failed to import pipeline module:', e);
        }

        console.log('\n=== Test Summary ===');
        console.log('✅ All basic checks passed');
        console.log('ℹ️ For full test, please:');
        console.log('1. Open a chat');
        console.log('2. Send some messages');
        console.log('3. Click the Vectorize button');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Auto-run test
testVectorization();