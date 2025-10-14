const axios = require('axios');
require('dotenv').config();

async function testAfterAddingClasses() {
    try {
        // Check if classes now exist
        const projectResponse = await axios.get(
            `https://api.roboflow.com/jiten-tukum/my-first-project-ihoie`,
            { params: { api_key: process.env.PRIVATE_KEY }}
        );
        
        console.log('📋 Project Classes:', projectResponse.data.classes);
        
        if (!projectResponse.data.classes || projectResponse.data.classes.length === 0) {
            console.log('❌ Classes still not defined! Add them via Roboflow UI first.');
            return;
        }
        
        console.log('✅ Classes found! Now testing annotation upload...');
        
        // Test simple annotation upload again
        const testImageData = {
            imageUrl: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800',
            filename: 'test_with_classes.jpg',
            metadata: { tags: ['test-classes'], split: 'train' }
        };

        // Upload image
        const imageResponse = await axios.get(testImageData.imageUrl, { responseType: 'arraybuffer' });
        const base64Image = Buffer.from(imageResponse.data).toString('base64');
        
        const uploadParams = new URLSearchParams({
            api_key: process.env.PRIVATE_KEY,
            name: testImageData.filename,
            batch: '2025-10-13',
            split: 'train'
        });
        
        const uploadResponse = await axios.post(
            `https://api.roboflow.com/dataset/my-first-project-ihoie/upload?${uploadParams}`,
            base64Image,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
        );
        
        const imageId = uploadResponse.data.id;
        console.log(`✅ Image uploaded: ${imageId}`);

        // Upload simple annotation
        const simpleXML = `<?xml version="1.0"?>
<annotation>
    <folder>test</folder>
    <filename>${testImageData.filename}</filename>
    <path>${testImageData.imageUrl}</path>
    <source>
        <database>Test</database>
    </source>
    <size>
        <width>800</width>
        <height>600</height>
        <depth>3</depth>
    </size>
    <segmented>0</segmented>
    <object>
        <name>product</name>
        <pose>Unspecified</pose>
        <truncated>0</truncated>
        <difficult>0</difficult>
        <bndbox>
            <xmin>100</xmin>
            <ymin>100</ymin>
            <xmax>200</xmax>
            <ymax>200</ymax>
        </bndbox>
    </object>
</annotation>`;

        const annotationResponse = await axios({
            method: "POST",
            url: `https://api.roboflow.com/dataset/my-first-project-ihoie/annotate/${imageId}`,
            params: {
                api_key: process.env.PRIVATE_KEY,
                name: 'test_with_classes.xml'
            },
            data: simpleXML,
            headers: { "Content-Type": "text/plain" }
        });
        
        console.log('📤 Annotation response:', annotationResponse.data);
        
        // Wait and verify
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const verifyResponse = await axios.get(
            `https://api.roboflow.com/jiten-tukum/my-first-project-ihoie/${imageId}`,
            { params: { api_key: process.env.PRIVATE_KEY }}
        );
        
        const annotationCount = verifyResponse.data.annotations?.length || 0;
        console.log(`🔍 Verification: ${annotationCount} annotations found`);
        
        if (annotationCount > 0) {
            console.log('🎉 SUCCESS! Annotations are now working!');
            verifyResponse.data.annotations.forEach((ann, i) => {
                console.log(`   ${i+1}. ${ann.class} - ${ann.width}x${ann.height}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
    }
}

testAfterAddingClasses();
