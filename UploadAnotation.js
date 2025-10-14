// const axios = require('axios');
// const fs = require('fs');
// require('dotenv').config();

// class CorrectRoboflowAnnotationUploader {
//     constructor(apiKey, projectId) {
//         this.apiKey = apiKey;
//         this.projectId = projectId;
//         this.baseUrl = 'https://api.roboflow.com';
//     }

//     // Upload image first, then annotations using CORRECT API endpoint
//     async uploadImageWithCorrectAnnotations(imageData, coolerMetadata) {
//         try {
//             console.log('🚀 Using CORRECT Roboflow annotation API...\n');
            
//             // Step 1: Upload image first
//             const imageResult = await this.uploadImageOnly(imageData);
//             if (!imageResult.success) return imageResult;
            
//             console.log(`✅ Image uploaded: ${imageResult.imageId}`);
            
//             // Step 2: Create XML annotation in Pascal VOC format (Roboflow standard)
//             const xmlAnnotation = this.createPascalVOCAnnotation(imageData, coolerMetadata);
//             const annotationFilename = `${imageData.filename.replace(/\.[^/.]+$/, "")}.xml`;
            
//             console.log(`📄 Creating annotation file: ${annotationFilename}`);
//             console.log(`📊 Annotation length: ${xmlAnnotation.length} characters`);
            
//             // Step 3: Upload annotation using CORRECT API endpoint from docs
//             const annotationResult = await this.uploadAnnotationFile(
//                 imageResult.imageId, 
//                 annotationFilename, 
//                 xmlAnnotation
//             );
            
//             if (annotationResult.success) {
//                 console.log('✅ Annotation uploaded successfully!');
                
//                 // Step 4: Verify annotations were saved
//                 await this.delay(2000);
//                 const verification = await this.verifyAnnotations(imageResult.imageId);
                
//                 return {
//                     success: true,
//                     imageId: imageResult.imageId,
//                     annotationCount: this.countAnnotations(coolerMetadata),
//                     verifiedCount: verification.count,
//                     folder: imageResult.folder,
//                     annotationResponse: annotationResult.data
//                 };
//             } else {
//                 return {
//                     success: false,
//                     error: `Annotation upload failed: ${annotationResult.error}`,
//                     imageId: imageResult.imageId
//                 };
//             }
            
//         } catch (error) {
//             console.error('❌ Upload process failed:', error);
//             return { success: false, error: error.message };
//         }
//     }

//     // Upload annotation using the CORRECT API endpoint from documentation
//     async uploadAnnotationFile(imageId, filename, annotationContent) {
//         try {
//             console.log(`📤 Uploading annotation to: /dataset/${this.projectId}/annotate/${imageId}`);
            
//             const response = await axios({
//                 method: "POST",
//                 url: `${this.baseUrl}/dataset/${this.projectId}/annotate/${imageId}`,
//                 params: {
//                     api_key: this.apiKey,
//                     name: filename
//                 },
//                 data: annotationContent,
//                 headers: {
//                     "Content-Type": "text/plain"  // As specified in docs
//                 }
//             });
            
//             return {
//                 success: true,
//                 data: response.data
//             };
            
//         } catch (error) {
//             console.error('❌ Annotation upload failed:', error.response?.data || error.message);
//             return {
//                 success: false,
//                 error: error.response?.data || error.message
//             };
//         }
//     }

//     // Create Pascal VOC XML annotation (standard format for Roboflow)
//     createPascalVOCAnnotation(imageData, coolerMetadata) {
//         const imageWidth = coolerMetadata.dimensions?.width || 1766;
//         const imageHeight = coolerMetadata.dimensions?.height || 4096;
        
//         let xmlContent = `<?xml version="1.0"?>
// <annotation>
//     <folder>cooler-detection</folder>
//     <filename>${imageData.filename}</filename>
//     <path>${imageData.imageUrl}</path>
//     <source>
//         <database>ShelfEx</database>
//     </source>
//     <size>
//         <width>${imageWidth}</width>
//         <height>${imageHeight}</height>
//         <depth>3</depth>
//     </size>
//     <segmented>0</segmented>
// `;

//         // Process all annotations
//         Object.entries(coolerMetadata.Cooler || {}).forEach(([doorKey, doorData]) => {
//             // Add door
//             if (doorData.data && doorData.data.length > 0) {
//                 const doorBbox = this.polygonToBbox(doorData.data);
//                 xmlContent += this.createObjectXML('door', doorBbox);
//             }

//             // Add sections
//             if (doorData.Sections) {
//                 doorData.Sections.forEach(section => {
//                     const sectionBbox = this.polygonToBbox(section.data);
//                     xmlContent += this.createObjectXML('section', sectionBbox);

//                     // Add products
//                     if (section.products) {
//                         section.products.forEach(product => {
//                             const productBbox = this.boundingBoxToXYWH(product["Bounding-Box"]);
//                             xmlContent += this.createObjectXML(product.product, productBbox, {
//                                 product_name: product.product,
//                                 sku_code: product["SKU-Code"],
//                                 confidence: product.Confidence
//                             });

//                             // Add stacked products
//                             if (product.stacked && Array.isArray(product.stacked)) {
//                                 product.stacked.forEach(stacked => {
//                                     const stackedBbox = this.boundingBoxToXYWH(stacked["Bounding-Box"]);
//                                     xmlContent += this.createObjectXML(stacked.product, stackedBbox, {
//                                         product_name: stacked.product,
//                                         sku_code: stacked["SKU-Code"],
//                                         confidence: stacked.Confidence
//                                     });
//                                 });
//                             }
//                         });
//                     }
//                 });
//             }
//         });

//         xmlContent += '</annotation>';
//         return xmlContent;
//     }

//     // Create individual object XML for Pascal VOC format
//     createObjectXML(className, bbox, attributes = {}) {
//         const [xmin, ymin, width, height] = bbox;
//         const xmax = xmin + width;
//         const ymax = ymin + height;
        
//         let objectXML = `
//     <object>
//         <name>${className}</name>
//         <pose>Unspecified</pose>
//         <truncated>0</truncated>
//         <difficult>0</difficult>
//         <bndbox>
//             <xmin>${Math.round(xmin)}</xmin>
//             <ymin>${Math.round(ymin)}</ymin>
//             <xmax>${Math.round(xmax)}</xmax>
//             <ymax>${Math.round(ymax)}</ymax>
//         </bndbox>`;
        
//         // Add custom attributes if provided
//         if (Object.keys(attributes).length > 0) {
//             objectXML += '\n        <attributes>';
//             Object.entries(attributes).forEach(([key, value]) => {
//                 objectXML += `\n            <${key}>${value}</${key}>`;
//             });
//             objectXML += '\n        </attributes>';
//         }
        
//         objectXML += '\n    </object>';
//         return objectXML;
//     }

//     // Upload image only (same as before)
//     async uploadImageOnly(imageData) {
//         try {
//             const todayFolder = this.generateDateFolder();
            
//             const imageResponse = await axios.get(imageData.imageUrl, { responseType: 'arraybuffer' });
//             const base64Image = Buffer.from(imageResponse.data).toString('base64');
            
//             const uploadParams = new URLSearchParams({
//                 api_key: this.apiKey,
//                 name: imageData.filename,
//                 batch: todayFolder,
//                 split: imageData.metadata?.split || 'train',
//                 tag_names: (imageData.metadata?.tags || []).join(',')
//             });
            
//             const response = await axios.post(
//                 `${this.baseUrl}/dataset/${this.projectId}/upload?${uploadParams}`,
//                 base64Image,
//                 { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
//             );
            
//             return {
//                 success: true,
//                 imageId: response.data.id,
//                 folder: todayFolder
//             };
            
//         } catch (error) {
//             console.error('❌ Image upload failed:', error.response?.data);
//             return {
//                 success: false,
//                 error: error.response?.data || error.message
//             };
//         }
//     }

//     // Verify annotations were saved
//     async verifyAnnotations(imageId) {
//         try {
//             const response = await axios.get(
//                 `${this.baseUrl}/jiten-tukum/${this.projectId}/${imageId}`,
//                 { params: { api_key: this.apiKey }}
//             );

//             const count = response.data.annotations?.length || 0;
//             console.log(`🔍 Verification: ${count} annotations found in Roboflow`);
            
//             if (count > 0) {
//                 console.log('🎉 SUCCESS! Annotations are now visible in Roboflow!');
//                 response.data.annotations.slice(0, 5).forEach((ann, i) => {
//                     console.log(`   ${i+1}. ${ann.class} - ${ann.width?.toFixed(0)}x${ann.height?.toFixed(0)}`);
//                 });
//             }
            
//             return { success: true, count };
//         } catch (error) {
//             console.log('❌ Verification failed:', error.response?.data);
//             return { success: false, count: 0 };
//         }
//     }

//     // Helper methods (same as before)
//     countAnnotations(coolerMetadata) {
//         let count = 0;
//         Object.values(coolerMetadata.Cooler || {}).forEach(door => {
//             count += 1; // door
//             count += door.Sections?.length || 0; // sections
//             door.Sections?.forEach(section => {
//                 count += section.products?.length || 0; // products
//                 section.products?.forEach(product => {
//                     count += product.stacked?.length || 0; // stacked products
//                 });
//             });
//         });
//         return count;
//     }

//     boundingBoxToXYWH(boundingBox) {
//         const x1 = Math.min(boundingBox[0][0], boundingBox[1][0], boundingBox[2][0], boundingBox[3][0]);
//         const y1 = Math.min(boundingBox[0][1], boundingBox[1][1], boundingBox[2][1], boundingBox[3][1]);
//         const x2 = Math.max(boundingBox[0][0], boundingBox[1][0], boundingBox[2][0], boundingBox[3][0]);
//         const y2 = Math.max(boundingBox[0][1], boundingBox[1][1], boundingBox[2][1], boundingBox[3][1]);
//         return [x1, y1, x2 - x1, y2 - y1];
//     }

//     polygonToBbox(polygon) {
//         const xCoords = polygon.map(point => point[0]);
//         const yCoords = polygon.map(point => point[1]);
//         const x1 = Math.min(...xCoords);
//         const y1 = Math.min(...yCoords);
//         const x2 = Math.max(...xCoords);
//         const y2 = Math.max(...yCoords);
//         return [x1, y1, x2 - x1, y2 - y1];
//     }

//     delay(ms) {
//         return new Promise(resolve => setTimeout(resolve, ms));
//     }

//     // Add this method to generate date-based folder names:
//     generateDateFolder() {
//         const today = new Date();
//         const year = today.getFullYear();
//         const month = String(today.getMonth() + 1).padStart(2, '0');  
//         const day = String(today.getDate()).padStart(2, '0');
//         return `${year}-${month}-${day}`;  // Creates: "2025-10-14"
//     }

//     // Test with CORRECT API endpoint
//     async testCorrectAPIUpload() {
//         const coolerMetadata = {
                                   
//                             }

//         const imageData = {
//             imageUrl: "https://storage.googleapis.com/shelfex-cdn/shelfscan/dev/03/recognition/1755774282079_2JPGR..jpg",
//             filename: 'correct_api_test2.jpg',
//             metadata: {
//                 tags: ['correct-api', 'pascal-voc'],
//                 split: 'train'
//             }
//         };

//         console.log('🧪 Testing CORRECT Roboflow annotation API...');
//         const result = await this.uploadImageWithCorrectAnnotations(imageData, coolerMetadata);
        
//         console.log('\n📋 Final Result:', result);
        
//         if (result.success && result.verifiedCount > 0) {
//             console.log('\n🎉 SUCCESS! Annotations are now properly stored in Roboflow!');
//             console.log('💡 This is the correct method for your production use!');
//         }
        
//         return result;
//     }
// }

// // Test the CORRECT API method
// async function testCorrectAPI() {
//     const uploader = new CorrectRoboflowAnnotationUploader(
//         process.env.PRIVATE_KEY,
//         process.env.PROJECT_ID
//     );

//     await uploader.testCorrectAPIUpload();
// }

// testCorrectAPI();

// module.exports = CorrectRoboflowAnnotationUploader;







