const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

class CorrectRoboflowUploader {
    constructor(apiKey, projectId) {
        this.apiKey = apiKey;
        this.projectId = projectId;
        this.baseUrl = 'https://api.roboflow.com';
    }

    // Method 1: Upload image first, then add annotations via separate API call
    async uploadImageThenAnnotate(imageData, coolerMetadata) {
        try {
            console.log('🚀 Method 1: Upload image first, then add annotations...\n');
            
            // Step 1: Upload image only
            const imageResult = await this.uploadImageOnly(imageData);
            if (!imageResult.success) return imageResult;
            
            console.log(`✅ Image uploaded: ${imageResult.imageId}`);
            
            // Step 2: Add each annotation individually
            const annotations = this.convertToRoboflowAnnotations(coolerMetadata, imageData);
            console.log(`📊 Adding ${annotations.length} annotations individually...`);
            
            let successCount = 0;
            for (let i = 0; i < annotations.length; i++) {
                const annotation = annotations[i];
                console.log(`📤 Adding annotation ${i+1}/${annotations.length}: ${annotation.class}`);
                
                const annotationResult = await this.addSingleAnnotation(imageResult.imageId, annotation);
                if (annotationResult.success) {
                    successCount++;
                    console.log(`   ✅ Success`);
                } else {
                    console.log(`   ❌ Failed: ${annotationResult.error}`);
                }
                
                // Small delay to avoid rate limiting
                await this.delay(200);
            }
            
            console.log(`\n📊 Final result: ${successCount}/${annotations.length} annotations added`);
            
            // Step 3: Verify annotations were saved
            await this.delay(2000); // Wait for processing
            const verification = await this.verifyAnnotations(imageResult.imageId);
            
            return {
                success: true,
                imageId: imageResult.imageId,
                totalAnnotations: annotations.length,
                successfulAnnotations: successCount,
                verifiedAnnotations: verification.count,
                folder: imageResult.folder
            };
            
        } catch (error) {
            console.error('❌ Upload failed:', error);
            return { success: false, error: error.message };
        }
    }

    // Upload image only (base64 method that works)
    async uploadImageOnly(imageData) {
        try {
            const todayFolder = this.generateTodayFolder();
            
            // Download and convert image
            const imageResponse = await axios.get(imageData.imageUrl, { responseType: 'arraybuffer' });
            const base64Image = Buffer.from(imageResponse.data).toString('base64');
            
            const uploadParams = new URLSearchParams({
                api_key: this.apiKey,
                name: imageData.filename,
                batch: todayFolder,
                split: imageData.metadata?.split || 'train',
                tag_names: (imageData.metadata?.tags || []).join(',')
            });
            
            const response = await axios.post(
                `${this.baseUrl}/dataset/${this.projectId}/upload?${uploadParams}`,
                base64Image,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
            );
            
            return {
                success: true,
                imageId: response.data.id,
                folder: todayFolder
            };
            
        } catch (error) {
            console.error('❌ Image upload failed:', error.response?.data);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    // Convert cooler metadata to Roboflow annotation format
    convertToRoboflowAnnotations(coolerMetadata, imageData) {
        const annotations = [];
        const imageWidth = coolerMetadata.dimensions?.width || 1766;
        const imageHeight = coolerMetadata.dimensions?.height || 4096;

        // Process doors, sections, and products
        Object.entries(coolerMetadata.Cooler || {}).forEach(([doorKey, doorData]) => {
            // Add door
            if (doorData.data && doorData.data.length > 0) {
                const doorBbox = this.polygonToBbox(doorData.data);
                annotations.push({
                    class: 'door',
                    x: doorBbox[0],
                    y: doorBbox[1], 
                    width: doorBbox[2],
                    height: doorBbox[3]
                });
            }

            // Add sections
            if (doorData.Sections) {
                doorData.Sections.forEach(section => {
                    const sectionBbox = this.polygonToBbox(section.data);
                    annotations.push({
                        class: 'section',
                        x: sectionBbox[0],
                        y: sectionBbox[1],
                        width: sectionBbox[2],
                        height: sectionBbox[3]
                    });

                    // Add products
                    if (section.products) {
                        section.products.forEach(product => {
                            const productBbox = this.boundingBoxToXYWH(product["Bounding-Box"]);
                            annotations.push({
                                class: 'product',
                                x: productBbox[0],
                                y: productBbox[1],
                                width: productBbox[2],
                                height: productBbox[3],
                                attributes: {
                                    product_name: product.product,
                                    sku_code: product["SKU-Code"],
                                    confidence: product.Confidence
                                }
                            });

                            // Add stacked products
                            if (product.stacked) {
                                product.stacked.forEach(stacked => {
                                    const stackedBbox = this.boundingBoxToXYWH(stacked["Bounding-Box"]);
                                    annotations.push({
                                        class: 'stacked_product',
                                        x: stackedBbox[0],
                                        y: stackedBbox[1],
                                        width: stackedBbox[2],
                                        height: stackedBbox[3],
                                        attributes: {
                                            product_name: stacked.product,
                                            sku_code: stacked["SKU-Code"],
                                            confidence: stacked.Confidence
                                        }
                                    });
                                });
                            }
                        });
                    }
                });
            }
        });

        return annotations;
    }

    // Add single annotation to existing image
    async addSingleAnnotation(imageId, annotation) {
        try {
            const annotationData = {
                class: annotation.class,
                x: Math.round(annotation.x),
                y: Math.round(annotation.y),
                width: Math.round(annotation.width),
                height: Math.round(annotation.height)
            };

            // Try the annotation endpoint
            const response = await axios.post(
                `${this.baseUrl}/dataset/${this.projectId}/${imageId}/annotate`,
                annotationData,
                {
                    params: { api_key: this.apiKey },
                    headers: { 'Content-Type': 'application/json' }
                }
            );

            return { success: true, data: response.data };

        } catch (error) {
            // Try alternative endpoint format
            try {
                const altResponse = await axios.post(
                    `${this.baseUrl}/jiten-tukum/${this.projectId}/${imageId}/annotations`,
                    annotation,
                    {
                        params: { api_key: this.apiKey },
                        headers: { 'Content-Type': 'application/json' }
                    }
                );
                return { success: true, data: altResponse.data };
            } catch (altError) {
                return {
                    success: false,
                    error: error.response?.data || error.message
                };
            }
        }
    }

    // Verify annotations were saved
    async verifyAnnotations(imageId) {
        try {
            const response = await axios.get(
                `${this.baseUrl}/jiten-tukum/${this.projectId}/${imageId}`,
                { params: { api_key: this.apiKey }}
            );

            const count = response.data.annotations?.length || 0;
            console.log(`🔍 Verification: ${count} annotations found in Roboflow`);
            
            return { success: true, count };
        } catch (error) {
            console.log('❌ Verification failed:', error.response?.data);
            return { success: false, count: 0 };
        }
    }

    // Helper methods (same as before)
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

    generateTodayFolder() {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Test with proper annotation storage
    async testCorrectAnnotationUpload() {
        const coolerMetadata = {
                                "Cooler": {
                                    "Door-1": {
                                    "data": [
                                        [
                                        2381,
                                        110
                                        ],
                                        [
                                        2275,
                                        931
                                        ],
                                        [
                                        2150,
                                        1884
                                        ],
                                        [
                                        1969,
                                        3246
                                        ],
                                        [
                                        1964,
                                        3259
                                        ],
                                        [
                                        452,
                                        3259
                                        ],
                                        [
                                        292,
                                        385
                                        ],
                                        [
                                        292,
                                        8
                                        ],
                                        [
                                        2381,
                                        8
                                        ]
                                    ],
                                    "Sections": [
                                        {
                                        "data": [
                                            [
                                            2381,
                                            8
                                            ],
                                            [
                                            2381,
                                            110
                                            ],
                                            [
                                            2288,
                                            793
                                            ],
                                            [
                                            2275,
                                            873
                                            ],
                                            [
                                            2270,
                                            900
                                            ],
                                            [
                                            2266,
                                            918
                                            ],
                                            [
                                            2261,
                                            931
                                            ],
                                            [
                                            2248,
                                            962
                                            ],
                                            [
                                            2199,
                                            962
                                            ],
                                            [
                                            443,
                                            869
                                            ],
                                            [
                                            363,
                                            860
                                            ],
                                            [
                                            354,
                                            855
                                            ],
                                            [
                                            341,
                                            842
                                            ],
                                            [
                                            337,
                                            829
                                            ],
                                            [
                                            292,
                                            385
                                            ],
                                            [
                                            292,
                                            8
                                            ]
                                        ],
                                        "position": 1,
                                        "products": [
                                            {
                                            "product": "PEPSI_COLA_300ML_CAN",
                                            "stacked": [],
                                            "Position": "1",
                                            "SKU-Code": "shelfscan_00126",
                                            "stackSize": 0,
                                            "Confidence": "0.61",
                                            "Bounding-Box": [
                                                [
                                                313.3449401855469,
                                                64.5521011352539
                                                ],
                                                [
                                                313.3449401855469,
                                                749.947998046875
                                                ],
                                                [
                                                597.3952026367188,
                                                749.947998046875
                                                ],
                                                [
                                                597.3952026367188,
                                                64.5521011352539
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "PEPSI_COLA_300ML_CAN",
                                            "stacked": [],
                                            "Position": "2",
                                            "SKU-Code": "shelfscan_00126",
                                            "stackSize": 0,
                                            "Confidence": "0.66",
                                            "Bounding-Box": [
                                                [
                                                588.108642578125,
                                                130.9254760742188
                                                ],
                                                [
                                                588.108642578125,
                                                735.7021484375
                                                ],
                                                [
                                                811.3153076171875,
                                                735.7021484375
                                                ],
                                                [
                                                811.3153076171875,
                                                130.9254760742188
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "MOUNTAIN_DEW_330ML_CAN",
                                            "stacked": [],
                                            "Position": "3",
                                            "SKU-Code": "shelfscan_00096",
                                            "stackSize": 0,
                                            "Confidence": "0.6",
                                            "Bounding-Box": [
                                                [
                                                800.2959594726562,
                                                106.8608474731445
                                                ],
                                                [
                                                800.2959594726562,
                                                748.9776611328125
                                                ],
                                                [
                                                1054.374267578125,
                                                748.9776611328125
                                                ],
                                                [
                                                1054.374267578125,
                                                106.8608474731445
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "CREAMBELL_COFFEE_180ML_PET",
                                            "stacked": [],
                                            "Position": "4",
                                            "SKU-Code": "shelfscan_00047",
                                            "stackSize": 0,
                                            "Confidence": "0.88",
                                            "Bounding-Box": [
                                                [
                                                1039.250366210938,
                                                183.2380676269531
                                                ],
                                                [
                                                1039.250366210938,
                                                756.9503173828125
                                                ],
                                                [
                                                1189.78662109375,
                                                756.9503173828125
                                                ],
                                                [
                                                1189.78662109375,
                                                183.2380676269531
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "CREAMBELL_VANILLA_180ML_PET",
                                            "stacked": [],
                                            "Position": "5",
                                            "SKU-Code": "shelfscan_00051",
                                            "stackSize": 0,
                                            "Confidence": "0.92",
                                            "Bounding-Box": [
                                                [
                                                1179.31298828125,
                                                164.7586212158203
                                                ],
                                                [
                                                1179.31298828125,
                                                768.6905517578125
                                                ],
                                                [
                                                1381.619995117188,
                                                768.6905517578125
                                                ],
                                                [
                                                1381.619995117188,
                                                164.7586212158203
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "CREAMBELL_VANILLA_180ML_PET",
                                            "stacked": [],
                                            "Position": "6",
                                            "SKU-Code": "shelfscan_00051",
                                            "stackSize": 0,
                                            "Confidence": "0.93",
                                            "Bounding-Box": [
                                                [
                                                1378.926391601562,
                                                177.8658905029297
                                                ],
                                                [
                                                1378.926391601562,
                                                778.6918334960938
                                                ],
                                                [
                                                1582.252075195312,
                                                778.6918334960938
                                                ],
                                                [
                                                1582.252075195312,
                                                177.8658905029297
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "CREAMBELL_VANILLA_180ML_PET",
                                            "stacked": [],
                                            "Position": "7",
                                            "SKU-Code": "shelfscan_00051",
                                            "stackSize": 0,
                                            "Confidence": "0.93",
                                            "Bounding-Box": [
                                                [
                                                1570.496459960938,
                                                209.7856140136719
                                                ],
                                                [
                                                1570.496459960938,
                                                788.4338989257812
                                                ],
                                                [
                                                1760.330810546875,
                                                788.4338989257812
                                                ],
                                                [
                                                1760.330810546875,
                                                209.7856140136719
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "CREAMBELL_KESAR_BADAM_180ML_PET",
                                            "stacked": [],
                                            "Position": "8",
                                            "SKU-Code": "shelfscan_00049",
                                            "stackSize": 0,
                                            "Confidence": "0.92",
                                            "Bounding-Box": [
                                                [
                                                1756.910522460938,
                                                225.2667694091797
                                                ],
                                                [
                                                1756.910522460938,
                                                804.2703247070312
                                                ],
                                                [
                                                1948.770385742188,
                                                804.2703247070312
                                                ],
                                                [
                                                1948.770385742188,
                                                225.2667694091797
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "CREAMBELL_KESAR_BADAM_180ML_PET",
                                            "stacked": [],
                                            "Position": "9",
                                            "SKU-Code": "shelfscan_00049",
                                            "stackSize": 0,
                                            "Confidence": "0.9",
                                            "Bounding-Box": [
                                                [
                                                1935.078979492188,
                                                254.1993255615234
                                                ],
                                                [
                                                1935.078979492188,
                                                808.57470703125
                                                ],
                                                [
                                                2111.858642578125,
                                                808.57470703125
                                                ],
                                                [
                                                2111.858642578125,
                                                254.1993255615234
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "TROP_SLICE_125ML_TETRA",
                                            "stacked": [
                                                {
                                                "product": "TROP_SLICE_125ML_TETRA",
                                                "stacked": null,
                                                "Position": "11",
                                                "SKU-Code": "shelfscan_00177",
                                                "stackSize": 0,
                                                "Confidence": "0.94",
                                                "Bounding-Box": [
                                                    [
                                                    2150.890625,
                                                    133.0335845947266
                                                    ],
                                                    [
                                                    2150.890625,
                                                    520.326904296875
                                                    ],
                                                    [
                                                    2352.3486328125,
                                                    520.326904296875
                                                    ],
                                                    [
                                                    2352.3486328125,
                                                    133.0335845947266
                                                    ]
                                                ]
                                                }
                                            ],
                                            "Position": "10",
                                            "SKU-Code": "shelfscan_00177",
                                            "stackSize": 2,
                                            "Confidence": "0.92",
                                            "Bounding-Box": [
                                                [
                                                2124.05712890625,
                                                512.1201782226562
                                                ],
                                                [
                                                2124.05712890625,
                                                817.3922119140625
                                                ],
                                                [
                                                2311.984130859375,
                                                817.3922119140625
                                                ],
                                                [
                                                2311.984130859375,
                                                512.1201782226562
                                                ]
                                            ]
                                            }
                                        ]
                                        },
                                        {
                                        "data": [
                                            [
                                            847,
                                            807
                                            ],
                                            [
                                            2075,
                                            873
                                            ],
                                            [
                                            2244,
                                            886
                                            ],
                                            [
                                            2275,
                                            891
                                            ],
                                            [
                                            2275,
                                            931
                                            ],
                                            [
                                            2142,
                                            1840
                                            ],
                                            [
                                            2137,
                                            1871
                                            ],
                                            [
                                            2133,
                                            1884
                                            ],
                                            [
                                            2115,
                                            1902
                                            ],
                                            [
                                            705,
                                            1955
                                            ],
                                            [
                                            416,
                                            1955
                                            ],
                                            [
                                            408,
                                            1924
                                            ],
                                            [
                                            403,
                                            1871
                                            ],
                                            [
                                            345,
                                            1192
                                            ],
                                            [
                                            345,
                                            807
                                            ]
                                        ],
                                        "position": 2,
                                        "products": [
                                            {
                                            "product": "MIRINDA_ORANGE_750ML_PET",
                                            "stacked": [],
                                            "Position": "1",
                                            "SKU-Code": "shelfscan_00091",
                                            "stackSize": 0,
                                            "Confidence": "0.94",
                                            "Bounding-Box": [
                                                [
                                                381.9559936523438,
                                                918.641845703125
                                                ],
                                                [
                                                381.9559936523438,
                                                1845.681518554688
                                                ],
                                                [
                                                678.4928588867188,
                                                1845.681518554688
                                                ],
                                                [
                                                678.4928588867188,
                                                918.641845703125
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "TROP_SLICE_600ML_PET",
                                            "stacked": [],
                                            "Position": "2",
                                            "SKU-Code": "shelfscan_00163",
                                            "stackSize": 0,
                                            "Confidence": "0.96",
                                            "Bounding-Box": [
                                                [
                                                670.0671997070312,
                                                976.8590087890625
                                                ],
                                                [
                                                670.0671997070312,
                                                1825.505859375
                                                ],
                                                [
                                                947.42724609375,
                                                1825.505859375
                                                ],
                                                [
                                                947.42724609375,
                                                976.8590087890625
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "TROP_SLICE_600ML_PET",
                                            "stacked": [],
                                            "Position": "3",
                                            "SKU-Code": "shelfscan_00163",
                                            "stackSize": 0,
                                            "Confidence": "0.96",
                                            "Bounding-Box": [
                                                [
                                                941.0242309570312,
                                                992.2047119140625
                                                ],
                                                [
                                                941.0242309570312,
                                                1815.104248046875
                                                ],
                                                [
                                                1204.6142578125,
                                                1815.104248046875
                                                ],
                                                [
                                                1204.6142578125,
                                                992.2047119140625
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "7UP_NIMBOOZ_345ML_PET",
                                            "stacked": [],
                                            "Position": "4",
                                            "SKU-Code": "shelfscan_00023",
                                            "stackSize": 0,
                                            "Confidence": "0.97",
                                            "Bounding-Box": [
                                                [
                                                1192.015502929688,
                                                1157.39794921875
                                                ],
                                                [
                                                1192.015502929688,
                                                1802.736450195312
                                                ],
                                                [
                                                1419.577758789062,
                                                1802.736450195312
                                                ],
                                                [
                                                1419.577758789062,
                                                1157.39794921875
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "TROP_MIX_FRUIT_MAGIC_500ML_PET",
                                            "stacked": [],
                                            "Position": "5",
                                            "SKU-Code": "shelfscan_00212",
                                            "stackSize": 0,
                                            "Confidence": "0.91",
                                            "Bounding-Box": [
                                                [
                                                1409.459594726562,
                                                1126.5654296875
                                                ],
                                                [
                                                1409.459594726562,
                                                1796.78466796875
                                                ],
                                                [
                                                1640.786499023438,
                                                1796.78466796875
                                                ],
                                                [
                                                1640.786499023438,
                                                1126.5654296875
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "TROP_MIX_FRUIT_MAGIC_500ML_PET",
                                            "stacked": [],
                                            "Position": "6",
                                            "SKU-Code": "shelfscan_00212",
                                            "stackSize": 0,
                                            "Confidence": "0.92",
                                            "Bounding-Box": [
                                                [
                                                1639.552124023438,
                                                1133.283935546875
                                                ],
                                                [
                                                1639.552124023438,
                                                1792.73095703125
                                                ],
                                                [
                                                1877.864990234375,
                                                1792.73095703125
                                                ],
                                                [
                                                1877.864990234375,
                                                1133.283935546875
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "TROP_MIX_FRUIT_MAGIC_500ML_PET",
                                            "stacked": [],
                                            "Position": "7",
                                            "SKU-Code": "shelfscan_00212",
                                            "stackSize": 0,
                                            "Confidence": "0.92",
                                            "Bounding-Box": [
                                                [
                                                1871.031005859375,
                                                1138.629760742188
                                                ],
                                                [
                                                1871.031005859375,
                                                1789.007690429688
                                                ],
                                                [
                                                2101.57421875,
                                                1789.007690429688
                                                ],
                                                [
                                                2101.57421875,
                                                1138.629760742188
                                                ]
                                            ]
                                            }
                                        ]
                                        },
                                        {
                                        "data": [
                                            [
                                            2150,
                                            1853
                                            ],
                                            [
                                            2150,
                                            1884
                                            ],
                                            [
                                            2048,
                                            2514
                                            ],
                                            [
                                            2044,
                                            2536
                                            ],
                                            [
                                            2040,
                                            2550
                                            ],
                                            [
                                            2026,
                                            2563
                                            ],
                                            [
                                            1991,
                                            2567
                                            ],
                                            [
                                            492,
                                            2736
                                            ],
                                            [
                                            452,
                                            2736
                                            ],
                                            [
                                            439,
                                            2700
                                            ],
                                            [
                                            416,
                                            2541
                                            ],
                                            [
                                            416,
                                            1898
                                            ],
                                            [
                                            1157,
                                            1853
                                            ]
                                        ],
                                        "position": 3,
                                        "products": [
                                            {
                                            "product": "MIRINDA_ORANGE_250ML_PET",
                                            "stacked": [],
                                            "Position": "1",
                                            "SKU-Code": "shelfscan_00086",
                                            "stackSize": 0,
                                            "Confidence": "0.94",
                                            "Bounding-Box": [
                                                [
                                                432.5457153320312,
                                                2031.861450195312
                                                ],
                                                [
                                                432.5457153320312,
                                                2632.035888671875
                                                ],
                                                [
                                                639.2490844726562,
                                                2632.035888671875
                                                ],
                                                [
                                                639.2490844726562,
                                                2031.861450195312
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "TROP_LITCHI_180ML_PET",
                                            "stacked": [],
                                            "Position": "2",
                                            "SKU-Code": "shelfscan_00203",
                                            "stackSize": 0,
                                            "Confidence": "0.91",
                                            "Bounding-Box": [
                                                [
                                                636.2117309570312,
                                                2125.63427734375
                                                ],
                                                [
                                                636.2117309570312,
                                                2596.44970703125
                                                ],
                                                [
                                                804.5079956054688,
                                                2596.44970703125
                                                ],
                                                [
                                                804.5079956054688,
                                                2125.63427734375
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "TROP_LITCHI_180ML_PET",
                                            "stacked": [],
                                            "Position": "3",
                                            "SKU-Code": "shelfscan_00203",
                                            "stackSize": 0,
                                            "Confidence": "0.91",
                                            "Bounding-Box": [
                                                [
                                                804.510986328125,
                                                2116.6533203125
                                                ],
                                                [
                                                804.510986328125,
                                                2578.13427734375
                                                ],
                                                [
                                                971.4022216796875,
                                                2578.13427734375
                                                ],
                                                [
                                                971.4022216796875,
                                                2116.6533203125
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "TROP_LITCHI_180ML_PET",
                                            "stacked": [],
                                            "Position": "4",
                                            "SKU-Code": "shelfscan_00203",
                                            "stackSize": 0,
                                            "Confidence": "0.91",
                                            "Bounding-Box": [
                                                [
                                                968.5534057617188,
                                                2099.999755859375
                                                ],
                                                [
                                                968.5534057617188,
                                                2562.5869140625
                                                ],
                                                [
                                                1131.280639648438,
                                                2562.5869140625
                                                ],
                                                [
                                                1131.280639648438,
                                                2099.999755859375
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "TROP_MIX_FRUIT_MAGIC_500ML_PET",
                                            "stacked": [],
                                            "Position": "5",
                                            "SKU-Code": "shelfscan_00212",
                                            "stackSize": 0,
                                            "Confidence": "0.91",
                                            "Bounding-Box": [
                                                [
                                                1124.058837890625,
                                                1936.756591796875
                                                ],
                                                [
                                                1124.058837890625,
                                                2544.843017578125
                                                ],
                                                [
                                                1336.708251953125,
                                                2544.843017578125
                                                ],
                                                [
                                                1336.708251953125,
                                                1936.756591796875
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "TROP_MIX_FRUIT_MAGIC_500ML_PET",
                                            "stacked": [],
                                            "Position": "6",
                                            "SKU-Code": "shelfscan_00212",
                                            "stackSize": 0,
                                            "Confidence": "0.92",
                                            "Bounding-Box": [
                                                [
                                                1334.913940429688,
                                                1930.494262695312
                                                ],
                                                [
                                                1334.913940429688,
                                                2520.774658203125
                                                ],
                                                [
                                                1545.977416992188,
                                                2520.774658203125
                                                ],
                                                [
                                                1545.977416992188,
                                                1930.494262695312
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "TROP_MIX_FRUIT_MAGIC_500ML_PET",
                                            "stacked": [],
                                            "Position": "7",
                                            "SKU-Code": "shelfscan_00212",
                                            "stackSize": 0,
                                            "Confidence": "0.92",
                                            "Bounding-Box": [
                                                [
                                                1542.880859375,
                                                1921.859985351562
                                                ],
                                                [
                                                1542.880859375,
                                                2501.68603515625
                                                ],
                                                [
                                                1752.971923828125,
                                                2501.68603515625
                                                ],
                                                [
                                                1752.971923828125,
                                                1921.859985351562
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "TROP_MIX_FRUIT_MAGIC_500ML_PET",
                                            "stacked": [],
                                            "Position": "8",
                                            "SKU-Code": "shelfscan_00212",
                                            "stackSize": 0,
                                            "Confidence": "0.92",
                                            "Bounding-Box": [
                                                [
                                                1744.880493164062,
                                                1914.843383789062
                                                ],
                                                [
                                                1744.880493164062,
                                                2486.343505859375
                                                ],
                                                [
                                                1954.902099609375,
                                                2486.343505859375
                                                ],
                                                [
                                                1954.902099609375,
                                                1914.843383789062
                                                ]
                                            ]
                                            }
                                        ]
                                        },
                                        {
                                        "data": [
                                            [
                                            2062,
                                            2510
                                            ],
                                            [
                                            2062,
                                            2532
                                            ],
                                            [
                                            1969,
                                            3246
                                            ],
                                            [
                                            1964,
                                            3259
                                            ],
                                            [
                                            452,
                                            3259
                                            ],
                                            [
                                            452,
                                            2678
                                            ],
                                            [
                                            1889,
                                            2510
                                            ]
                                        ],
                                        "position": 4,
                                        "products": [
                                            {
                                            "product": "PEPSI_COLA_750ML_PET",
                                            "stacked": [],
                                            "Position": "1",
                                            "SKU-Code": "shelfscan_00144",
                                            "stackSize": 0,
                                            "Confidence": "0.94",
                                            "Bounding-Box": [
                                                [
                                                462.6364135742188,
                                                2731.226806640625
                                                ],
                                                [
                                                462.6364135742188,
                                                3263.3984375
                                                ],
                                                [
                                                715.20068359375,
                                                3263.3984375
                                                ],
                                                [
                                                715.20068359375,
                                                2731.226806640625
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "PEPSI_COLA_750ML_PET",
                                            "stacked": [],
                                            "Position": "2",
                                            "SKU-Code": "shelfscan_00144",
                                            "stackSize": 0,
                                            "Confidence": "0.94",
                                            "Bounding-Box": [
                                                [
                                                706.6600341796875,
                                                2710.780517578125
                                                ],
                                                [
                                                706.6600341796875,
                                                3263.430419921875
                                                ],
                                                [
                                                937.6685791015625,
                                                3263.430419921875
                                                ],
                                                [
                                                937.6685791015625,
                                                2710.780517578125
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "PEPSI_COLA_750ML_PET",
                                            "stacked": [],
                                            "Position": "3",
                                            "SKU-Code": "shelfscan_00144",
                                            "stackSize": 0,
                                            "Confidence": "0.94",
                                            "Bounding-Box": [
                                                [
                                                929.0222778320312,
                                                2683.91943359375
                                                ],
                                                [
                                                929.0222778320312,
                                                3262.798828125
                                                ],
                                                [
                                                1156.48779296875,
                                                3262.798828125
                                                ],
                                                [
                                                1156.48779296875,
                                                2683.91943359375
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "PEPSI_COLA_750ML_PET",
                                            "stacked": [],
                                            "Position": "4",
                                            "SKU-Code": "shelfscan_00144",
                                            "stackSize": 0,
                                            "Confidence": "0.93",
                                            "Bounding-Box": [
                                                [
                                                1148.674194335938,
                                                2657.67919921875
                                                ],
                                                [
                                                1148.674194335938,
                                                3263.173828125
                                                ],
                                                [
                                                1375.181640625,
                                                3263.173828125
                                                ],
                                                [
                                                1375.181640625,
                                                2657.67919921875
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "PEPSI_COLA_750ML_PET",
                                            "stacked": [],
                                            "Position": "5",
                                            "SKU-Code": "shelfscan_00144",
                                            "stackSize": 0,
                                            "Confidence": "0.94",
                                            "Bounding-Box": [
                                                [
                                                1364.303466796875,
                                                2638.507568359375
                                                ],
                                                [
                                                1364.303466796875,
                                                3262.663818359375
                                                ],
                                                [
                                                1587.909790039062,
                                                3262.663818359375
                                                ],
                                                [
                                                1587.909790039062,
                                                2638.507568359375
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "PEPSI_COLA_750ML_PET",
                                            "stacked": [],
                                            "Position": "6",
                                            "SKU-Code": "shelfscan_00144",
                                            "stackSize": 0,
                                            "Confidence": "0.94",
                                            "Bounding-Box": [
                                                [
                                                1572.55615234375,
                                                2612.012939453125
                                                ],
                                                [
                                                1572.55615234375,
                                                3251.598388671875
                                                ],
                                                [
                                                1796.449096679688,
                                                3251.598388671875
                                                ],
                                                [
                                                1796.449096679688,
                                                2612.012939453125
                                                ]
                                            ]
                                            },
                                            {
                                            "product": "TROP_MIX_FRUIT_MAGIC_500ML_PET",
                                            "stacked": [],
                                            "Position": "7",
                                            "SKU-Code": "shelfscan_00212",
                                            "stackSize": 0,
                                            "Confidence": "0.92",
                                            "Bounding-Box": [
                                                [
                                                1774.333984375,
                                                2659.212646484375
                                                ],
                                                [
                                                1774.333984375,
                                                3245.414306640625
                                                ],
                                                [
                                                1986.295654296875,
                                                3245.414306640625
                                                ],
                                                [
                                                1986.295654296875,
                                                2659.212646484375
                                                ]
                                            ]
                                            }
                                        ]
                                        }
                                    ],
                                    "Door-Visible": false
                                    }
                                },
                                "dimensions": {
                                    "width": 2448,
                                    "height": 3264
                                }
                            }

        const imageData = {
            imageUrl: "https://storage.googleapis.com/shelfex-cdn/shelfscan/dev/03/recognition/1755774233188_17526..jpg",
            filename: 'correct_annotation_test.jpg',
            metadata: {
                tags: ['correct-method', 'step-by-step'],
                split: 'train'
            }
        };

        console.log('🧪 Testing correct annotation storage method...');
        const result = await this.uploadImageThenAnnotate(imageData, coolerMetadata);
        
        console.log('\n📋 Final Result:', result);
        return result;
    }
}

// Test the correct method
async function testCorrectMethod() {
    const uploader = new CorrectRoboflowUploader(
        process.env.PRIVATE_KEY,
        process.env.PROJECT_ID
    );

    await uploader.testCorrectAnnotationUpload();
}

testCorrectMethod();
