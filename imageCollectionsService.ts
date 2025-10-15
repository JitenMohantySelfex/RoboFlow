// import { gte, lt, or, and, eq } from "drizzle-orm";
// import { postgreDb } from "../db";
// import { imageCollections, organisations } from "../schema";

// export class ImageCollectionService {
//   /**
//    * Fetch yesterday’s image collections for a specific organisation.
//    * @param orgIdentifier Organisation ID (number) or name (string)
//    */
//   static async getYesterdayImageJSON(orgIdentifier: string | number) {
//     const now = new Date();
//     const startOfYesterday = new Date(now);
//     startOfYesterday.setDate(now.getDate() - 1);
//     startOfYesterday.setHours(0, 0, 0, 0);

//     const endOfYesterday = new Date(now);
//     endOfYesterday.setDate(now.getDate() - 1);
//     endOfYesterday.setHours(23, 59, 59, 999);

//     // ✅ Step 1: Resolve organisationId if user passes name
//     let orgFilter;
//     if (typeof orgIdentifier === "string") {
//       const org = await postgreDb
//         .select({ id: organisations.id })
//         .from(organisations)
//         .where(eq(organisations.name, orgIdentifier))
//         .limit(1);

//       if (!org.length) {
//         throw new Error(`❌ Organisation not found: ${orgIdentifier}`);
//       }
//       orgFilter = org[0].id;
//     } else {
//       orgFilter = orgIdentifier;
//     }

//     // ✅ Step 2: Fetch image collections for that organisation
//     const results = await postgreDb
//       .select({
//         photosTaken: imageCollections.photosTaken,
//         metadata: imageCollections.metadata,
//       })
//       .from(imageCollections)
//       .where(
//         and(
//           eq(imageCollections.organisationId, orgFilter),
//           or(
//             and(
//               gte(imageCollections.createdAt, startOfYesterday),
//               lt(imageCollections.createdAt, endOfYesterday)
//             ),
//             and(
//               gte(imageCollections.updatedAt, startOfYesterday),
//               lt(imageCollections.updatedAt, endOfYesterday)
//             )
//           )
//         )
//       );

//     // ✅ Step 3: Transform to JSON format expected by Roboflow
//     const jsonData = results
//       .filter((rec) => rec.photosTaken)
//       .map((rec) => {
//         const photo =
//           Array.isArray(rec.photosTaken) && rec.photosTaken.length > 0
//             ? rec.photosTaken[0]
//             : rec.photosTaken;

//         return {
//           photosTaken: photo,
//           metadata: rec.metadata || {},
//         };
//       });

//     return jsonData;
//   }
// }



// import { ImageCollectionService } from "./dbService/imageCollections.service";
// import { RoboflowBatchSystem } from "./RoboflowBatchSystem";

// async function runYesterdayBatchUpload() {
//   const org = "Shelfex India"; // or use numeric ID (e.g. 3)

//   console.log(`🚀 Fetching images for organisation: ${org}`);

//   const jsonData = await ImageCollectionService.getYesterdayImageJSON(org);
//   console.log(`📊 Found ${jsonData.length} images for ${org}`);

//   if (!jsonData.length) {
//     console.log("⚠️ No images found — skipping upload");
//     return;
//   }

//   const batchSystem = new RoboflowBatchSystem(
//     process.env.PRIVATE_KEY,
//     "jiten-tukum"
//   );

//   const result = await batchSystem.runJSONBatchOperation(jsonData);
//   console.log("✅ Upload complete!", result);
// }

// runYesterdayBatchUpload();

