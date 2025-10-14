// // Quick verification script
// const axios = require('axios');
// require('dotenv').config();

// async function checkLatestUpload() {
//     try {
//         const imageId = 'Yzw06iuWfaEcQIojnefT'; // Your latest upload
        
//         const response = await axios.get(
//             `https://api.roboflow.com/jiten-tukum/my-first-project-ihoie/${imageId}`,
//             { params: { api_key: process.env.PRIVATE_KEY }}
//         );
        
//         console.log('📋 Latest Upload Check:');
//         console.log('ID:', response.data.id);
//         console.log('Name:', response.data.name);
//         console.log('Batch:', response.data.batch);
//         console.log('Method Used: YOLO Format');
//         console.log('Annotations Count:', response.data.annotations?.length || 0);
        
//         if (response.data.annotations && response.data.annotations.length > 0) {
//             console.log('\n🎉 SUCCESS! Annotations Found:');
//             response.data.annotations.slice(0, 10).forEach((ann, i) => {
//                 console.log(`${i+1}. Class: ${ann.class}, Box: ${ann.width.toFixed(0)}x${ann.height.toFixed(0)}, Confidence: ${ann.confidence || 'N/A'}`);
//             });
//             if (response.data.annotations.length > 10) {
//                 console.log(`... and ${response.data.annotations.length - 10} more annotations`);
//             }
//         } else {
//             console.log('\n❌ Still no annotations found');
//         }
        
//     } catch (error) {
//         console.error('❌ Error checking:', error.response?.data);
//     }
// }

// checkLatestUpload();


const axios = require('axios');
require('dotenv').config();

async function testMinimalUpload() {
    try {
        console.log('🧪 Testing minimal image upload...\n');
        
        // Test 1: Simple base64 upload
        const testImageUrl = 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=200';
        const imageResponse = await axios.get(testImageUrl, { responseType: 'arraybuffer' });
        const base64Image = Buffer.from(imageResponse.data).toString('base64');
        
        const uploadUrl = `https://api.roboflow.com/dataset/my-first-project-ihoie/upload?` +
            `api_key=${encodeURIComponent(process.env.PRIVATE_KEY)}&` +
            `name=minimal_test.jpg&` +
            `batch=2025-10-13&` +
            `split=train`;
        
        console.log('📤 Uploading minimal test...');
        const uploadResponse = await axios.post(uploadUrl, base64Image, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        
        console.log('✅ Upload Response:', uploadResponse.data);
        const imageId = uploadResponse.data.id;
        
        // Test 2: Immediately check if image exists using different methods
        console.log('\n🔍 Checking if image was actually stored...');
        
        // Wait 3 seconds for processing
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Method 1: Direct image access
        try {
            const checkResponse = await axios.get(
                `https://api.roboflow.com/jiten-tukum/my-first-project-ihoie/${imageId}`,
                { params: { api_key: process.env.PRIVATE_KEY }}
            );
            console.log('✅ Image found via direct access');
            console.log('Properties:', Object.keys(checkResponse.data));
        } catch (error) {
            console.log('❌ Direct access failed:', error.response?.status);
        }
        
        // Method 2: Search for image
        try {
            const searchResponse = await axios.get(
                `https://api.roboflow.com/jiten-tukum/my-first-project-ihoie/search?query=minimal_test`,
                { params: { api_key: process.env.PRIVATE_KEY }}
            );
            console.log('✅ Search worked:', searchResponse.data);
        } catch (error) {
            console.log('❌ Search failed:', error.response?.status);
        }
        
        // Method 3: List batch contents
        try {
            const batchResponse = await axios.get(
                `https://api.roboflow.com/jiten-tukum/my-first-project-ihoie/batches/2025-10-13`,
                { params: { api_key: process.env.PRIVATE_KEY }}
            );
            console.log('✅ Batch contents:', batchResponse.data);
        } catch (error) {
            console.log('❌ Batch listing failed:', error.response?.status);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
    }
}

testMinimalUpload();

