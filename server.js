const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(__dirname));

const PORT = process.env.PORT || 8000;
const LOCAL_OUTPUT_DIR = path.join(__dirname, 'generated_videos');

if (!fs.existsSync(LOCAL_OUTPUT_DIR)) {
    fs.mkdirSync(LOCAL_OUTPUT_DIR, { recursive: true });
}

// Supabase Setup
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
let supabase = null;
if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
}

const upload = multer({ dest: 'temp_uploads/' });

function buildEnhancedPrompt(userPrompt) {
    return [
        userPrompt,
        "single character identity lock, preserve same facial structure, hairstyle, skin details, body proportions, and clothing continuity",
        "cinematic composition, volumetric lighting, realistic shadows, depth of field, smooth camera motion",
        "photorealistic rendering, detailed textures, physically accurate motion, emotional cinematic atmosphere",
        "movie-grade color grading, premium social media reel storytelling, stable frame consistency"
    ].join(", ");
}

async function checkFFmpeg() {
    return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', ['-version']);
        ffmpeg.on('error', () => resolve(false));
        ffmpeg.on('close', (code) => resolve(code === 0));
    });
}

async function createVideoFromImage(imagePath, outPath, duration, fps) {
    const vf = [
        "scale=1080:1920:force_original_aspect_ratio=increase",
        "crop=1080:1920",
        `zoompan=z='min(zoom+0.0008,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${fps * duration}:s=1080x1920`,
        `fps=${fps}`,
        "format=yuv420p"
    ].join(",");

    return new Promise((resolve, reject) => {
        const args = [
            "-y",
            "-loop", "1",
            "-i", imagePath,
            "-vf", vf,
            "-t", duration.toString(),
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            outPath
        ];

        const ffmpeg = spawn('ffmpeg', args);
        let stderr = '';

        ffmpeg.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        ffmpeg.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`FFmpeg failed: ${stderr}`));
        });
    });
}

app.get('/api/health', async (req, res) => {
    const ffmpegAvailable = await checkFFmpeg();
    res.json({
        status: 'ok',
        supabase_configured: !!supabase,
        ffmpeg_available: ffmpegAvailable
    });
});

app.use('/api/videos', express.static(LOCAL_OUTPUT_DIR));

app.post('/api/generate-video', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: 'error', message: 'image is required' });
        }

        const prompt = (req.body.prompt || "Cinematic portrait reel").trim();
        const faceLock = req.body.face_lock === 'true';
        const quality = (req.body.quality || "1080p").trim();
        const aspectRatio = (req.body.aspect_ratio || "9:16").trim();
        const model = (req.body.model || "stable-video-diffusion").trim();
        let durationSec = 10;
        const durationStr = (req.body.duration || "10s").toLowerCase();
        if (durationStr.endsWith('s')) {
            durationSec = Math.max(5, Math.min(15, parseInt(durationStr.slice(0, -1)) || 10));
        }

        const enhancedPrompt = buildEnhancedPrompt(prompt);
        const outName = `generated_${uuidv4().replace(/-/g, '')}.mp4`;
        const outPath = path.join(LOCAL_OUTPUT_DIR, outName);

        const ffmpegAvailable = await checkFFmpeg();
        if (!ffmpegAvailable) {
            return res.status(500).json({ 
                status: 'error', 
                message: 'FFmpeg is not installed on this computer. Please install it to generate videos.' 
            });
        }

        await createVideoFromImage(req.file.path, outPath, durationSec, 24);

        // Cleanup temp file
        fs.unlinkSync(req.file.path);

        const videoUrl = `${req.protocol}://${req.get('host')}/api/videos/${outName}`;

        const metadata = {
            prompt,
            enhanced_prompt: enhancedPrompt,
            video_url: videoUrl,
            duration: `${durationSec}s`,
            quality,
            aspect_ratio: aspectRatio,
            model,
            face_lock: faceLock,
            created_at: new Date().toISOString()
        };

        // Try saving to Supabase if configured
        if (supabase) {
            await supabase.from(process.env.SUPABASE_TABLE || 'video_generations').insert([metadata]);
        }

        res.json({
            status: 'success',
            video_url: videoUrl,
            prompt_used: enhancedPrompt,
            duration: `${durationSec}s`,
            quality,
            aspect_ratio: aspectRatio,
            model,
            face_lock: faceLock
        });

    } catch (error) {
        console.error("Generation Error:", error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Backend Server running at http://localhost:${PORT}`);
});
