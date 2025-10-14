require("dotenv").config();
const axios = require("axios");

// Function to create date-based projects
async function createDateBasedProject(date) {
    try {
        const response = await axios.post(
            `https://api.roboflow.com/jiten-tukum/projects`,
            {
                name: `Cooler Data ${date}`,
                type: 'object-detection',
                annotation: 'cooler-detection'
            },
            {
                params: { api_key: process.env.PRIVATE_KEY },
                headers: { 'Content-Type': 'application/json' }
            }
        );
        
        return {
            success: true,
            projectId: response.data.id,
            projectName: response.data.name
        };
        
    } catch (error) {
        console.error('Failed to create project:', error.response?.data);
        return { success: false, error: error.response?.data };
    }
}

// Wrap usage in async function
async function main() {
    try {
        const today = '2025-10-14';
        console.log(`🚀 Creating project for ${today}...`);
        
        const project = await createDateBasedProject(today);
        
        if (project.success) {
            console.log('✅ Project created successfully!');
            console.log(`📂 Project ID: ${project.projectId}`);
            console.log(`📋 Project Name: ${project.projectName}`);
        } else {
            console.log('❌ Failed to create project:', project.error);
        }
        
    } catch (error) {
        console.error('Error in main:', error);
    }
}

// Run the main function
main();
