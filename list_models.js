const axios = require('axios');
require('dotenv').config();

const listModels = async () => {
    const key = process.env.NVIDIA_API_KEY;
    const url = "https://ai.api.nvidia.com/v1/models";
    
    try {
        const res = await axios.get(url, {
            headers: { "Authorization": `Bearer ${key}`, "Accept": "application/json" }
        });
        console.log("Available Models:");
        console.log(JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.log(`❌ FAILED: ${e.response?.status} - ${e.response?.data?.detail || e.message}`);
    }
};

listModels();
