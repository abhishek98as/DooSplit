import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";
import * as path from "path";

// Load local environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function runTest() {
  console.log("--------------------------------------------------");
  console.log("🧪 RUNNING GEMINI INTEGRATION TESTS...");
  console.log("--------------------------------------------------");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ FAIL: GEMINI_API_KEY is not defined in .env.local");
    console.log("👉 Please verify you have run 'vercel env pull .env.local' or added the key manually.");
    process.exit(1);
  }

  console.log("✅ CHECK: GEMINI_API_KEY env variable is present.");
  console.log("🔑 API Key Prefix:", apiKey.substring(0, 8) + "...");

  const modelName = "gemini-2.5-flash";
  console.log(`🤖 INITIALIZING model: ${modelName}...`);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });
    
    console.log("⏳ SENDING TEST CONTENT GENERATION REQUEST...");
    const start = Date.now();
    const result = await model.generateContent("DooSplit Test: Respond with exactly 'DooSplit AI is fully operational.'");
    const duration = Date.now() - start;
    
    const responseText = result.response.text().trim();
    console.log(`✅ SUCCESS: Received response in ${duration}ms.`);
    console.log("💬 Response Text:", responseText);

    if (responseText.toLowerCase().includes("operational")) {
      console.log("🎉 TEST PASSED: Gemini integration is fully active and working!");
    } else {
      console.log("⚠️ WARNING: Received response, but it did not match the expected pattern. Key is valid, but check response generation.");
    }
  } catch (error: any) {
    console.error("❌ FAIL: Gemini API call failed with the following error:");
    console.error(error.message || error);
    process.exit(1);
  }
  console.log("--------------------------------------------------");
}

runTest();
