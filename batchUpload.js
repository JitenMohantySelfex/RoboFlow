const axios = require('axios');
const fs = require('fs');
const sharp = require("sharp")
require('dotenv').config();

class RoboflowBatchSystem {
    constructor(apiKey, workspace) {
        this.apiKey = apiKey;
        this.workspace = workspace;
        this.baseUrl = 'https://api.roboflow.com';
        this.currentProjectId = null;
        
        // Rate limiting settings for your data
        this.batchSize = 10;           // 10 images per batch
        this.batchDelay = 5000;        // 5 seconds between batches
        this.imageDelay = 500;         // 0.5 seconds between images
        this.maxRetries = 3;           // Retry failed uploads
    }

    // NEW: Convert your JSON array format to internal format
    convertJSONArrayToImageData(jsonArray) {
        console.log(`🔄 Converting ${jsonArray.length} JSON items to batch format...`);
        
        const imageDataArray = jsonArray.map((item, index) => {
            const urlParts = item.photosTaken.split('/');
            const originalFilename = urlParts[urlParts.length - 1];
            const extension = originalFilename.split('.').pop().toLowerCase();

            // ✅ Safe unique filename: timestamp + index + random suffix
            const uniqueFilename = `${Date.now()}_${index + 1}_${Math.random().toString(36).substring(2, 8)}.${extension}`;

            return {
            imageUrl: item.photosTaken,
            filename: uniqueFilename,
            metadata: {
                tags: ['cooler', 'batch-upload', `item-${index + 1}`],
                split: 'train'
            },
            coolerMetadata: item.metadata
            };
        });

        console.log(`✅ Converted ${imageDataArray.length} items successfully`);
        return imageDataArray;
    }


    // NEW: Load JSON from file and process
    async processJSONFile(filePath) {
        try {
            console.log(`📂 Loading JSON file: ${filePath}`);
            
            // Read and parse JSON file
            const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            
            if (!Array.isArray(jsonData)) {
                throw new Error('JSON file must contain an array of objects');
            }
            
            console.log(`📊 Found ${jsonData.length} items in JSON file`);
            
            // Convert to internal format
            const imageDataArray = this.convertJSONArrayToImageData(jsonData);
            
            return imageDataArray;
            
        } catch (error) {
            console.error('❌ Failed to process JSON file:', error.message);
            throw error;
        }
    }

    // NEW: Process JSON array directly
    async processJSONArray(jsonArray) {
        try {
            console.log(`📊 Processing JSON array with ${jsonArray.length} items`);
            
            // Validate JSON structure
            this.validateJSONStructure(jsonArray);
            
            // Convert to internal format
            const imageDataArray = this.convertJSONArrayToImageData(jsonArray);
            
            return imageDataArray;
            
        } catch (error) {
            console.error('❌ Failed to process JSON array:', error.message);
            throw error;
        }
    }

    // NEW: Validate JSON structure
    validateJSONStructure(jsonArray) {
        if (!Array.isArray(jsonArray)) {
            throw new Error('Input must be an array');
        }
        
        if (jsonArray.length === 0) {
            throw new Error('Array cannot be empty');
        }
        
        // Validate each item
        jsonArray.forEach((item, index) => {
            if (!item.photosTaken) {
                throw new Error(`Item ${index + 1}: Missing 'photosTaken' field`);
            }
            
            if (!item.metadata) {
                throw new Error(`Item ${index + 1}: Missing 'metadata' field`);
            }
            
            if (!item.photosTaken.startsWith('http')) {
                throw new Error(`Item ${index + 1}: 'photosTaken' must be a valid URL`);
            }
        });
        
        console.log('✅ JSON structure validation passed');
    }

    // ENHANCED: Create project with better duplicate detection
    async createTodayProject() {
        try {
            const today = new Date();
            const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const projectName = `CoolerData ${dateString}`;  // "CoolerData 2025-10-14"
            
            console.log(`🚀 Looking for today's project: "${projectName}"`);
            
            // ENHANCED: Check if project already exists with better logging
            const existingProject = await this.checkProjectExists(projectName);
            
            if (existingProject) {
                // Clean the project ID (remove workspace prefix if present)
                let cleanProjectId = existingProject.id;
                if (cleanProjectId.includes('/')) {
                    cleanProjectId = cleanProjectId.split('/').pop();
                }
                if (cleanProjectId.startsWith(this.workspace + '/')) {
                    cleanProjectId = cleanProjectId.substring(this.workspace.length + 1);
                }
                
                this.currentProjectId = cleanProjectId;
                
                console.log(`✅ Using existing project: "${existingProject.name}"`);
                console.log(`📂 Project ID: ${cleanProjectId}`);
                console.log(`📂 Full Path: ${this.workspace}/${cleanProjectId}`);
                
                return {
                    success: true,
                    projectId: cleanProjectId,
                    projectName: existingProject.name,
                    fullPath: `${this.workspace}/${cleanProjectId}`,
                    isNew: false,
                    dateString
                };
            }
            
            // Project doesn't exist, create new one
            console.log(`🆕 Creating new project: "${projectName}"`);
            
            const response = await axios.post(
                `${this.baseUrl}/${this.workspace}/projects`,
                {
                    name: projectName,
                    type: 'object-detection',
                    annotation: 'cooler-detection'
                },
                {
                    params: { api_key: this.apiKey },
                    headers: { 'Content-Type': 'application/json' }
                }
            );
            
            // Clean the project ID from response
            let projectId = response.data.id;
            if (projectId.includes('/')) {
                projectId = projectId.split('/').pop();
            }
            if (projectId.startsWith(this.workspace + '/')) {
                projectId = projectId.substring(this.workspace.length + 1);
            }
            
            this.currentProjectId = projectId;
            
            console.log(`✅ New project created successfully!`);
            console.log(`📂 Raw Response ID: ${response.data.id}`);
            console.log(`📂 Extracted Project ID: ${projectId}`);
            console.log(`📂 Full Path: ${this.workspace}/${projectId}`);
            
            return {
                success: true,
                projectId: projectId,
                projectName: response.data.name,
                fullPath: `${this.workspace}/${projectId}`,
                rawResponseId: response.data.id,
                isNew: true,
                dateString
            };
            
        } catch (error) {
            console.error('❌ Failed to create project:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    // NEW: Complete workflow for JSON data
    async runJSONBatchOperation(jsonData) {
        console.log('🚀 Starting JSON batch operation...\n');
        
        try {
            // Step 1: Process JSON data
            let imageDataArray;
            if (typeof jsonData === 'string') {
                // File path provided
                imageDataArray = await this.processJSONFile(jsonData);
            } else {
                // Array provided directly
                imageDataArray = await this.processJSONArray(jsonData);
            }
            
            // Step 2: Create today's project
            const projectResult = await this.createTodayProject();
            if (!projectResult.success) {
                throw new Error('Project creation failed: ' + projectResult.error);
            }
            
            console.log(`📂 Project ready: ${projectResult.projectId}`);
            
            // Step 3: Upload all images in batches
            const uploadResults = await this.uploadBatchDataWithRateLimit(imageDataArray);
            
            return {
                success: true,
                project: projectResult,
                uploads: uploadResults,
                processedItems: imageDataArray.length
            };
            
        } catch (error) {
            console.error('❌ JSON batch operation failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Keep all your existing methods (uploadBatchDataWithRateLimit, processBatch, etc.)
    async uploadBatchDataWithRateLimit(imageDataArray) {
        if (!this.currentProjectId) {
            throw new Error('No project created! Call createTodayProject() first.');
        }

        console.log(`\n🔄 Starting batch upload to project: ${this.currentProjectId}`);
        console.log(`📊 Total images to upload: ${imageDataArray.length}`);
        console.log(`⚙️ Batch size: ${this.batchSize} images`);
        console.log(`⏱️ Delays: ${this.batchDelay}ms between batches, ${this.imageDelay}ms between images`);
        
        const totalBatches = Math.ceil(imageDataArray.length / this.batchSize);
        const results = {
            totalImages: imageDataArray.length,
            totalBatches: totalBatches,
            successful: 0,
            failed: 0,
            errors: [],
            processedBatches: 0,
            startTime: new Date(),
            imageResults: []
        };

        // Process in batches
        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const startIndex = batchIndex * this.batchSize;
            const endIndex = Math.min(startIndex + this.batchSize, imageDataArray.length);
            const currentBatch = imageDataArray.slice(startIndex, endIndex);
            
            console.log(`\n📦 Processing batch ${batchIndex + 1}/${totalBatches} (images ${startIndex + 1}-${endIndex})`);
            
            // Process current batch
            const batchResults = await this.processBatch(currentBatch, batchIndex + 1);
            
            // Update overall results
            results.successful += batchResults.successful;
            results.failed += batchResults.failed;
            results.errors.push(...batchResults.errors);
            results.imageResults.push(...batchResults.imageResults);
            results.processedBatches++;
            
            // Progress update
            const progress = ((batchIndex + 1) / totalBatches * 100).toFixed(1);
            console.log(`📈 Progress: ${progress}% (${results.successful} successful, ${results.failed} failed)`);
            
            // Rate limiting: Wait between batches (except for last batch)
            if (batchIndex < totalBatches - 1) {
                console.log(`⏸️ Waiting ${this.batchDelay / 1000}s before next batch...`);
                await this.delay(this.batchDelay);
            }
        }

        results.endTime = new Date();
        results.totalTime = results.endTime - results.startTime;
        
        // Final summary
        console.log(`\n🎉 Batch upload completed!`);
        console.log(`📊 Final Results:`);
        console.log(`   ✅ Successful: ${results.successful}/${results.totalImages}`);
        console.log(`   ❌ Failed: ${results.failed}/${results.totalImages}`);
        console.log(`   ⏱️ Total time: ${(results.totalTime / 1000 / 60).toFixed(2)} minutes`);
        console.log(`   📂 Project: ${this.currentProjectId}`);
        
        return results;
    }

    // Keep all your existing helper methods...
    async processBatch(batchImages, batchNumber) {
        const batchResults = {
            successful: 0,
            failed: 0,
            errors: [],
            imageResults: []
        };

        for (let i = 0; i < batchImages.length; i++) {
            const imageData = batchImages[i];
            let attempts = 0;
            let success = false;

            while (attempts < this.maxRetries && !success) {
                attempts++;
                
                try {
                    console.log(`   📤 Uploading: ${imageData.filename} (attempt ${attempts})`);
                    
                    const result = await this.uploadSingleImageWithAnnotations(imageData);
                    
                    if (result.success) {
                        batchResults.successful++;
                        batchResults.imageResults.push({
                            filename: imageData.filename,
                            imageId: result.imageId,
                            success: true,
                            batchNumber: batchNumber
                        });
                        success = true;
                        console.log(`   ✅ Success: ${imageData.filename}`);
                    } else {
                        throw new Error(result.error);
                    }
                    
                } catch (error) {
                    if (attempts >= this.maxRetries) {
                        batchResults.failed++;
                        batchResults.errors.push({
                            filename: imageData.filename,
                            error: error.message,
                            attempts: attempts,
                            batchNumber: batchNumber
                        });
                        batchResults.imageResults.push({
                            filename: imageData.filename,
                            success: false,
                            error: error.message,
                            batchNumber: batchNumber
                        });
                        console.log(`   ❌ Failed: ${imageData.filename} after ${attempts} attempts`);
                    } else {
                        console.log(`   ⚠️ Retry ${attempts}: ${imageData.filename} (${error.message})`);
                        await this.delay(1000);
                    }
                }
            }

            if (i < batchImages.length - 1) {
                await this.delay(this.imageDelay);
            }
        }

        return batchResults;
    }

    // Keep all your existing methods (uploadSingleImageWithAnnotations, etc.)
    async uploadSingleImageWithAnnotations(imageData) {
        try {
            const imageResult = await this.uploadImageOnly(imageData);
            if (!imageResult.success) return imageResult;
            
            if (imageData.coolerMetadata) {
                const xmlAnnotation = this.createPascalVOCAnnotation(imageData, imageData.coolerMetadata);
                const annotationFilename = `${imageData.filename.replace(/\.[^/.]+$/, "")}.xml`;
                
                const annotationResult = await this.uploadAnnotationFile(
                    imageResult.imageId, 
                    annotationFilename, 
                    xmlAnnotation
                );
                
                return {
                    success: annotationResult.success,
                    imageId: imageResult.imageId,
                    hasAnnotations: true,
                    error: annotationResult.success ? null : annotationResult.error
                };
            }
            
            return {
                success: true,
                imageId: imageResult.imageId,
                hasAnnotations: false
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async uploadImageOnly(imageData) {
        try {
            // Unique batch per image
            const batchName = `${imageData.filename.split('.')[0]}`;

            console.log(`📤 Uploading to project ID: ${this.currentProjectId}`);

            // 1️⃣ Download the image
            const imageResponse = await axios.get(imageData.imageUrl, { responseType: 'arraybuffer' });
            let imageBuffer = Buffer.from(imageResponse.data);

            // 2️⃣ Process image with sharp
            imageBuffer = await sharp(imageBuffer)
                .resize({ width: 1024 + Math.floor(Math.random()*5) }) // width ±0-4 px   // Example: resize width to 1024px, maintains aspect ratio
                .jpeg({ quality: 90 })      // Convert to JPEG and set quality
                .toBuffer();

            // 3️⃣ Convert processed image to Base64
            const base64Image = imageBuffer.toString('base64');

            // 4️⃣ Prepare Roboflow upload params
            const uploadParams = new URLSearchParams({
                api_key: this.apiKey,
                name: imageData.filename,
                batch: batchName,  // unique per image
                split: imageData.metadata?.split || 'train',
                tag_names: (imageData.metadata?.tags || []).join(','),
            });

            // 5️⃣ Upload to Roboflow
            const response = await axios.post(
                `${this.baseUrl}/dataset/${this.currentProjectId}/upload?${uploadParams}`,
                base64Image,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            console.log(`✅ Image uploaded successfully: ${response.data.id}`);
            return {
                success: true,
                imageId: response.data.id
            };

        } catch (error) {
            console.error('❌ Image upload failed:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }


    // FIXED: Annotation upload with clean project ID
    async uploadAnnotationFile(imageId, filename, annotationContent) {
        try {
            console.log(`📤 Uploading annotation to project: ${this.currentProjectId}, image: ${imageId}`);  // ✅ Clean logging
            
            const response = await axios({
                method: "POST",
                url: `${this.baseUrl}/dataset/${this.currentProjectId}/annotate/${imageId}`,  // ✅ Clean project ID
                params: {
                    api_key: this.apiKey,
                    name: filename
                },
                data: annotationContent,
                headers: { "Content-Type": "text/plain" }
            });
            
            console.log(`✅ Annotation uploaded successfully for image: ${imageId}`);
            
            return {
                success: true,
                data: response.data
            };
            
        } catch (error) {
            console.error('❌ Annotation upload failed:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }


    // Keep all your existing helper methods (createPascalVOCAnnotation, etc.)
    createPascalVOCAnnotation(imageData, coolerMetadata) {
        const imageWidth = coolerMetadata.dimensions?.width || 1766;
        const imageHeight = coolerMetadata.dimensions?.height || 4096;
        
        let xmlContent = `<?xml version="1.0"?>
<annotation>
    <folder>cooler-detection</folder>
    <filename>${imageData.filename}</filename>
    <path>${imageData.imageUrl}</path>
    <source>
        <database>ShelfEx</database>
    </source>
    <size>
        <width>${imageWidth}</width>
        <height>${imageHeight}</height>
        <depth>3</depth>
    </size>
    <segmented>0</segmented>
`;

        Object.entries(coolerMetadata.Cooler || {}).forEach(([doorKey, doorData]) => {
            if (doorData.data && doorData.data.length > 0) {
                const doorBbox = this.polygonToBbox(doorData.data);
                xmlContent += this.createObjectXML('door', doorBbox);
            }

            if (doorData.Sections) {
                doorData.Sections.forEach(section => {
                    const sectionBbox = this.polygonToBbox(section.data);
                    xmlContent += this.createObjectXML('section', sectionBbox);

                    if (section.products) {
                        section.products.forEach(product => {
                            const productBbox = this.boundingBoxToXYWH(product["Bounding-Box"]);
                            xmlContent += this.createObjectXML(product.product, productBbox);

                            if (product.stacked && Array.isArray(product.stacked)) {
                                product.stacked.forEach(stacked => {
                                    const stackedBbox = this.boundingBoxToXYWH(stacked["Bounding-Box"]);
                                    xmlContent += this.createObjectXML(stacked.product, stackedBbox);
                                });
                            }
                        });
                    }
                });
            }
        });

        xmlContent += '</annotation>';
        return xmlContent;
    }

    createObjectXML(className, bbox) {
        const [xmin, ymin, width, height] = bbox;
        const xmax = xmin + width;
        const ymax = ymin + height;
        
        return `
    <object>
        <name>${className}</name>
        <pose>Unspecified</pose>
        <truncated>0</truncated>
        <difficult>0</difficult>
        <bndbox>
            <xmin>${Math.round(xmin)}</xmin>
            <ymin>${Math.round(ymin)}</ymin>
            <xmax>${Math.round(xmax)}</xmax>
            <ymax>${Math.round(ymax)}</ymax>
        </bndbox>
    </object>`;
    }

    boundingBoxToXYWH(boundingBox) {
        const x1 = Math.min(boundingBox[0][0], boundingBox[1][0], boundingBox[2][0], boundingBox[3][0]);
        const y1 = Math.min(boundingBox[0][1], boundingBox[1][1], boundingBox[2][1], boundingBox[3][1]);
        const x2 = Math.max(boundingBox[0][0], boundingBox[1][0], boundingBox[2][0], boundingBox[3][0]);
        const y2 = Math.max(boundingBox[0][1], boundingBox[1][1], boundingBox[2][1], boundingBox[3][1]);
        return [x1, y1, x2 - x1, y2 - y1];
    }

    polygonToBbox(polygon) {
        const xCoords = polygon.map(point => point[0]);
        const yCoords = polygon.map(point => point[1]);
        const x1 = Math.min(...xCoords);
        const y1 = Math.min(...yCoords);
        const x2 = Math.max(...xCoords);
        const y2 = Math.max(...yCoords);
        return [x1, y1, x2 - x1, y2 - y1];
    }

    async checkProjectExists(projectName) {
    try {
        console.log(`🔍 Checking if project exists: "${projectName}"`);
        
        const response = await axios.get(
        `${this.baseUrl}/${this.workspace}`,
        { params: { api_key: this.apiKey } }
        );

        // ✅ Roboflow returns workspace object
        const projects = response.data.workspace?.projects || [];

        console.log(`📋 Found ${projects.length} total projects in workspace "${response.data.workspace.name}"`);

        // Debug log: list project names
        projects.forEach((proj, index) => {
        console.log(`   ${index + 1}. "${proj.name}" (ID: ${proj.id})`);
        });

        // 🔎 Match by name (case-insensitive recommended)
        const existingProject = projects.find(
        p => p.name.toLowerCase() === projectName.toLowerCase()
        );

        if (existingProject) {
        console.log(`✅ Found existing project: "${existingProject.name}" (ID: ${existingProject.id})`);
        return {
            id: existingProject.id,
            name: existingProject.name,
            type: existingProject.type
        };
        } else {
        console.log(`❌ No existing project found with name: "${projectName}"`);
        return null;
        }

    } catch (error) {
        console.error('❌ Failed to check existing projects:', error.response?.data || error.message);
        return null;
    }
    }


    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }


}


async function runWithJSONArray() {
    const batchSystem = new RoboflowBatchSystem(
        process.env.PRIVATE_KEY,
        'jiten-tukum'
    );

    // Method 2: Use JSON array directly
 

    const jsonData = require("./new.json")

    const result = await batchSystem.runJSONBatchOperation(jsonData);
    
    if (result.success) {
        console.log('\n🎉 JSON BATCH OPERATION COMPLETED!');
        console.log(`📂 Project: ${result.project.projectId}`);
        console.log(`📊 Processed: ${result.processedItems} items`);
        console.log(`✅ Successful: ${result.uploads.successful}`);
        console.log(`❌ Failed: ${result.uploads.failed}`);
        console.log(`⏱️ Total time: ${(result.uploads.totalTime / 1000 / 60).toFixed(2)} minutes`);
    } else {
        console.log('❌ Operation failed:', result.error);
    }
}

// Run with your JSON data
runWithJSONArray();

module.exports = RoboflowBatchSystem;