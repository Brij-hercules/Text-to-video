const axios = require('axios');
require('dotenv').config();

const testLlama = async () => {
    const key = process.env.NVIDIA_API_KEY;
    const url = "https://integrate.api.nvidia.com/v1/chat/completions";
    
    try {
        const res = await axios.post(url, {
            model: "nvidia/llama-3.1-8b-instruct",
            messages: [{role: "user", content: "hello"}]
        }, {
            headers: { "Authorization": `Bearer ${key}`, "Accept": "application/json" }
        });
        console.log("✅ Llama Connection Success!");
        console.log(res.data.choices[0].message.content);
        process.exit(0);
    } catch (e) {
        console.log(`❌ FAILED: ${e.response?.status} - ${e.response?.data?.detail || e.message}`);
        process.exit(1);
    }
};

testLlama();
