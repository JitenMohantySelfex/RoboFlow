#!/usr/bin/env python3
        import os
        from roboflow import Roboflow

        # Initialize Roboflow
        rf = Roboflow(api_key="9LH6tFreeWh9dbfM4lBU")
        project = rf.workspace().project("my-first-project-ihoie")

        try:
            print("🚀 Starting upload with Python SDK...")
            
            # Upload with annotations
            result = project.single_upload(
                image_path="cooler_yolo_test.jpg",
                annotation_path="cooler_yolo_test.txt",
                annotation_labelmap="classes.txt",
                batch_name="2025-10-13",
                split="train",
                tag_names=["cooler", "yolo-format", "proper-annotations"],
                is_prediction=False  # Set to True if these are predictions, False for ground truth
            )
            
            print("✅ Upload successful!")
            print("📋 Result:", result)
            
        except Exception as e:
            print("❌ Upload failed:", str(e))
            
        # Cleanup
        import os
        try:
            os.remove("cooler_yolo_test.jpg")
            os.remove("cooler_yolo_test.txt")
            os.remove("classes.txt")
            os.remove("upload_script.py")
            print("🧹 Cleaned up temporary files")
        except:
            pass
        