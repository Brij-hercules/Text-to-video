const axios = require('axios');
require('dotenv').config();

const testNvidia = async () => {
    const key = process.env.NVIDIA_API_KEY;
    const models = [
        "stabilityai/stable-video-diffusion",
        "nvidia/stable-video-diffusion",
        "stabilityai/svd",
        "nvidia/svd",
        "stabilityai/sdxl-turbo",
        "nvidia/sdxl-turbo"
    ];
    const bases = [
        "https://ai.api.nvidia.com/v1/genai",
        "https://ai.api.nvidia.com/v1",
        "https://integrate.api.nvidia.com/v1/genai",
        "https://integrate.api.nvidia.com/v1"
    ];

    for (const model of models) {
        for (const base of bases) {
            const url = `${base}/${model}`;
            console.log(`Testing: ${url}`);
            try {
                const payload = model.includes("video") || model.includes("svd") 
                    ? { image: "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" }
                    : { prompt: "test" };
                    
                const res = await axios.post(url, payload, {
                    headers: { "Authorization": `Bearer ${key}`, "Accept": "application/json" }
                });
                console.log(`✅ SUCCESS: ${url}`);
                process.exit(0);
            } catch (e) {
                // console.log(`❌ FAILED: ${url} - Status: ${e.response?.status}`);
            }
        }
    }
    console.log("No variations worked.");
    process.exit(1);
};

testNvidia();
