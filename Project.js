const axios = require('axios');
require('dotenv').config();

async function createProject(projectName, projectType = 'object-detection', annotation = 'cooler-detection') {
    try {
        console.log(`🚀 Creating project: ${projectName}`);
        
        const response = await axios({
            method: 'POST',
            url: 'https://api.roboflow.com/jiten-tukum/projects',
            params: {
                api_key: process.env.PRIVATE_KEY  // Your API key from .env
            },
            headers: {
                'Content-Type': 'application/json'
            },
            data: {
                name: projectName,
                type: projectType,
                annotation: annotation
            }
        });
        
        console.log('✅ Project created successfully!');
        console.log(`📂 Project ID: ${response.data.id}`);
        console.log(`📋 Project Name: ${response.data.name}`);
        
        return {
            success: true,
            projectId: response.data.id,
            projectName: response.data.name,
            projectType: response.data.type
        };
        
    } catch (error) {
        console.error('❌ Failed to create project:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data || error.message
        };
    }
}

// Usage Examples
async function testCreateProject() {
    // Create a simple project
    const project1 = await createProject('My Test Project');
    
    // Create date-based project
    const today = new Date().toISOString().split('T')[0]; // 2025-10-14
    const project2 = await createProject(`Cooler Data ${today}`);
    
    // Create custom project
    const project3 = await createProject('Custom Detection Project', 'object-detection', 'custom-items');
    
    console.log('All projects created:', { project1, project2, project3 });
}

// Run test
testCreateProject();

module.exports = createProject;
