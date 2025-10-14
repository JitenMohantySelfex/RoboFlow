const axios = require('axios');
require('dotenv').config();

class RoboflowSingleUploader {
    constructor(apiKey, projectId) {
        this.apiKey = apiKey;
        this.projectId = projectId;
        this.baseUrl = 'https://api.roboflow.com';
    }

    // Generate today's date folder
    generateTodayFolder() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Method 1: Try with URL as query parameter (current approach)
    async uploadSingleImageMethod1(imageData) {
        try {
            const todayFolder = this.generateTodayFolder();
            
            const response = await axios({
                method: 'POST',
                url: `${this.baseUrl}/dataset/${this.projectId}/upload?api_key=${this.apiKey}&name=${imageData.filename}&image=${encodeURIComponent(imageData.imageUrl)}&batch=${todayFolder}&split=${imageData.metadata.split || 'train'}&tag_names=${imageData.metadata.tags.join(',')}`,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 30000
            });

            return { success: true, method: 'Method 1', data: response.data };
        } catch (error) {
            console.error('❌ Method 1 failed:', error.response?.status, error.response?.data);
            return { success: false, method: 'Method 1', error: error.response?.data };
        }
    }

    // Method 2: Try downloading image and sending as base64
    async uploadSingleImageMethod2(imageData) {
        try {
            console.log('🔄 Method 2: Downloading image and converting to base64...');
            
            // Download the image
            const imageResponse = await axios.get(imageData.imageUrl, {
                responseType: 'arraybuffer',
                timeout: 30000
            });
            
            // Convert to base64
            const base64Image = Buffer.from(imageResponse.data).toString('base64');
            const todayFolder = this.generateTodayFolder();
            
            // Upload as base64
            const uploadParams = new URLSearchParams();
            uploadParams.append('api_key', this.apiKey);
            uploadParams.append('name', imageData.filename);
            uploadParams.append('batch', todayFolder);
            uploadParams.append('split', imageData.metadata.split || 'train');
            uploadParams.append('tag_names', imageData.metadata.tags.join(','));
            
            const response = await axios({
                method: 'POST',
                url: `${this.baseUrl}/dataset/${this.projectId}/upload`,
                data: base64Image,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                params: Object.fromEntries(uploadParams),
                timeout: 60000
            });

            return { success: true, method: 'Method 2', data: response.data };
        } catch (error) {
            console.error('❌ Method 2 failed:', error.response?.status, error.response?.data);
            return { success: false, method: 'Method 2', error: error.response?.data };
        }
    }

    // Method 3: Try with different parameter structure
    async uploadSingleImageMethod3(imageData) {
        try {
            console.log('🔄 Method 3: Using form data approach...');
            
            const todayFolder = this.generateTodayFolder();
            const FormData = require('form-data');
            const form = new FormData();
            
            // Download image first
            const imageResponse = await axios.get(imageData.imageUrl, {
                responseType: 'stream',
                timeout: 30000
            });
            
            form.append('api_key', this.apiKey);
            form.append('name', imageData.filename);
            form.append('batch', todayFolder);
            form.append('split', imageData.metadata.split || 'train');
            form.append('tag_names', imageData.metadata.tags.join(','));
            form.append('file', imageResponse.data, imageData.filename);
            
            const response = await axios({
                method: 'POST',
                url: `${this.baseUrl}/dataset/${this.projectId}/upload`,
                data: form,
                headers: {
                    ...form.getHeaders()
                },
                timeout: 60000
            });

            return { success: true, method: 'Method 3', data: response.data };
        } catch (error) {
            console.error('❌ Method 3 failed:', error.response?.status, error.response?.data);
            return { success: false, method: 'Method 3', error: error.response?.data };
        }
    }

    // Method 4: Simple base64 approach (most reliable)
    async uploadSingleImageMethod4(imageData) {
        try {
            console.log('🔄 Method 4: Simple base64 POST...');
            
            // Download image
            const imageResponse = await axios.get(imageData.imageUrl, {
                responseType: 'arraybuffer',
                timeout: 30000
            });
            
            const base64Image = Buffer.from(imageResponse.data).toString('base64');
            const todayFolder = this.generateTodayFolder();
            
            const response = await axios({
                method: 'POST',
                url: `${this.baseUrl}/dataset/${this.projectId}/upload?api_key=${this.apiKey}&name=${imageData.filename}&batch=${todayFolder}&split=${imageData.metadata.split || 'train'}&tag_names=${imageData.metadata.tags.join(',')}`,
                data: base64Image,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 60000
            });

            return { success: true, method: 'Method 4', data: response.data };
        } catch (error) {
            console.error('❌ Method 4 failed:', error.response?.status, error.response?.data);
            return { success: false, method: 'Method 4', error: error.response?.data };
        }
    }

    // Try all methods until one works
    async uploadSingleImage(imageData) {
        console.log('🧪 Testing multiple upload methods...\n');
        
        const methods = [
            this.uploadSingleImageMethod1,
            this.uploadSingleImageMethod2, 
            this.uploadSingleImageMethod3,
            this.uploadSingleImageMethod4
        ];

        for (const method of methods) {
            console.log(`🔄 Trying ${method.name}...`);
            const result = await method.call(this, imageData);
            
            if (result.success) {
                console.log(`✅ ${result.method} successful!`);
                console.log('📋 Response:', result.data);
                return {
                    success: true,
                    roboflowId: result.data.id,
                    filename: imageData.filename,
                    folder: this.generateTodayFolder(),
                    method: result.method,
                    roboflowResponse: result.data
                };
            } else {
                console.log(`❌ ${result.method} failed:`, result.error);
            }
        }

        return {
            success: false,
            error: 'All upload methods failed',
            filename: imageData.filename
        };
    }

    // Test upload
    async testUpload() {
        const testImageData = {
            imageUrl: 'https://storage.googleapis.com/shelfex-cdn/shelfscan/dev/03/recognition/29_1760096531675_29_1760007138400_1755069198505_071JPJPEGJPEG.jpeg',
            filename: 'test_cooler.jpg',
            metadata: {
                tags: ['mountain', 'landscape', 'outdoor'],
                split: 'train'
            }
        };

        console.log('🧪 Testing single image upload with multiple methods...');
        const result = await this.uploadSingleImage(testImageData);
        
        if (result.success) {
            console.log('\n✅ Upload successful!');
            console.log(`📁 Uploaded to folder: ${result.folder}`);
            console.log(`🆔 Roboflow ID: ${result.roboflowId}`);
            console.log(`🔧 Working method: ${result.method}`);
        } else {
            console.log('\n❌ All upload methods failed');
        }
        
        return result;
    }
}

// Test function
async function testAllMethods() {
    console.log('🚀 Testing all upload methods...\n');
    
    const uploader = new RoboflowSingleUploader(
        process.env.PRIVATE_KEY,
        process.env.PROJECT_ID
    );

    await uploader.testUpload();
}

// Install form-data if Method 3 works
console.log('💡 If Method 3 works, install form-data: npm install form-data');

// Run test
testAllMethods();

module.exports = RoboflowSingleUploader;
