const axios = require('axios');
require('dotenv').config();

async function testRoboflowConnection() {
    try {
        const response = await axios.get('https://api.roboflow.com/', {
            params: {
                api_key: process.env.PRIVATE_KEY
            }
        });
        
        console.log('✅ API Connection Success:', response.data);
        console.log('📊 Workspace:', response.data.workspace);
        
    } catch (error) {
        console.error('❌ API Connection Failed:', error.response?.data);
    }
}

async function testProjectAccess() {
    const config = {
        apiKey: process.env.PRIVATE_KEY,
        workspaceId: process.env.WORKSPACE_ID,  
        projectId: process.env.PROJECT_ID
    };
    
    try {
        const response = await axios.get(
            `https://api.roboflow.com/${config.workspaceId}/${config.projectId}`,
            { params: { api_key: config.apiKey }}
        );
        
        console.log('✅ Project Access Success:', response.data.project);
        
    } catch (error) {
        console.error('❌ Project Access Failed:', error.response?.data);
    }
}

// testRoboflowConnection();
testProjectAccess();
