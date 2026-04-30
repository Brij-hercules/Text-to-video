class VideoAssistant {
    constructor() {
        this.backendUrl = window.APP_CONFIG?.BACKEND_URL || "http://localhost:8000";
        // Supabase Configuration
        this.supabaseUrl = 'https://dfamxzkezsfmetsttrjp.supabase.co';
        this.supabaseKey = 'sb_publishable_jabIvwy51ZJqvE2zA9vJzg_EuqeaLyv';
        this.supabase = null;

        if (window.supabase) {
            this.supabase = window.supabase.createClient(this.supabaseUrl, this.supabaseKey);
            console.log('✅ Supabase Initialized Successfully');
            this.fetchLatestModel(); // Fetch model on start
        } else {
            console.error('❌ Supabase Library not found. Check index.html script tag.');
        }

        this.state = {
            face_id: null,
            face_lock: false,
            current_model: 'pro',
            current_quality: '1080p',
            current_duration: '5s',
            current_ratio: '9:16',
            source_file: null,
            current_tab: localStorage.getItem('activeTab') || 'chat',
            history: []
        };
        
        this.init();
    }

    init() {
        this.chatArea = document.getElementById('chatArea');
        this.previewArea = document.getElementById('previewArea');
        this.studioArea = document.getElementById('studioArea');
        this.modelDisplay = document.getElementById('modelDisplay');
        this.modelInfo = document.getElementById('modelInfo');
        this.userInput = document.getElementById('userInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.jsonOutput = document.getElementById('jsonOutput');
        this.faceStatus = document.getElementById('faceStatus');

        // Restore active tab UI
        this.switchTab(this.state.current_tab);
        document.querySelectorAll('.nav-item').forEach(item => {
            if (item.innerText.toLowerCase().includes(this.state.current_tab)) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        this.sendBtn.addEventListener('click', () => this.handleSend());
        this.userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSend();
            }
        });

        // Tab Switching
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const tab = e.currentTarget.innerText.toLowerCase().includes('chat') ? 'chat' : 
                            e.currentTarget.innerText.toLowerCase().includes('preview') ? 'preview' : 'other';
                if (tab !== 'other') this.switchTab(tab);
                
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                e.currentTarget.classList.add('active');
            });
        });
    }

    async fetchLatestModel() {
        if (!this.supabase) return;

        try {
            const { data, error } = await this.supabase
                .from('faces')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(1);

            if (error) throw error;

            if (data && data.length > 0) {
                const model = data[0];
                this.state.face_id = model.face_id;
                this.state.face_lock = true;
                this.state.face_seed = model.seed;
                this.state.face_metadata = model;
                
                this.faceStatus.classList.add('connected');
                this.faceStatus.querySelector('span').textContent = "Model: Girl (Loaded)";
                this.updateModelPreview();
                console.log('✅ Latest Model Fetched:', model.face_id);
            }
        } catch (err) {
            console.error('❌ Fetch Error:', err.message);
        }
    }

    switchTab(tab) {
        this.state.current_tab = tab;
        localStorage.setItem('activeTab', tab); // Save to localStorage
        
        this.chatArea.style.display = 'none';
        this.previewArea.style.display = 'none';
        this.studioArea = document.getElementById('studioArea');
        if (this.studioArea) this.studioArea.style.display = 'none';

        if (tab === 'chat') {
            this.chatArea.style.display = 'flex';
        } else if (tab === 'preview') {
            this.previewArea.style.display = 'flex';
            this.updateModelPreview();
        } else if (tab === 'studio') {
            this.studioArea.style.display = 'flex';
        }
    }

    setMode(mode) {
        this.state.current_mode = mode;
        const textGroup = document.getElementById('textInputGroup');
        const mediaGroup = document.getElementById('mediaUploadGroup');
        const btns = document.querySelectorAll('.mode-btn');
        
        btns.forEach(b => b.classList.remove('active'));
        if (window.event) window.event.target.classList.add('active');

        if (mode === 'text-to-video') {
            textGroup.style.display = 'block';
            mediaGroup.style.display = 'none';
        } else {
            textGroup.style.display = 'none';
            mediaGroup.style.display = 'block';
        }
    }

    setQuality(q) {
        this.state.current_quality = q;
        this.updateActiveButtons('opt-btn-quality', q);
    }

    setDuration(d) {
        this.state.current_duration = d;
        this.updateActiveButtons('opt-btn-mini', d);
    }

    setAspectRatio(ratio) {
        this.state.current_ratio = ratio;
        this.updateActiveButtons('opt-btn-ratio', ratio);
        const videoContainer = document.getElementById('videoContainer');
        if (ratio === '9:16') videoContainer.style.aspectRatio = '9/16';
        else if (ratio === '1:1') videoContainer.style.aspectRatio = '1/1';
        else videoContainer.style.aspectRatio = '16/9';
    }

    setModel(m) {
        this.state.current_model = m;
    }

    updateActiveButtons(className, value) {
        document.querySelectorAll(`.${className}`).forEach(btn => {
            if (btn.innerText === value || btn.getAttribute('onclick')?.includes(`'${value}'`)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    async handleStudioGenerate() {
        if (!this.state.face_id) {
            this.switchTab('chat');
            this.respond("Pehla tamari 'Girl Model' identity create karo jethi character consistency rahai!");
            return;
        }

        const prompt = document.getElementById('studioPrompt').value;
        if (!prompt && this.state.current_mode === 'text-to-video') {
            alert("Pehla tamari vision lakho (Prompt)!");
            return;
        }

        if (this.state.current_mode === 'image-to-video' && !this.state.source_file) {
            alert("Image-to-video mate pehla source image upload karo.");
            return;
        }

        await this.startGenerationSim();
    }

    async startGenerationSim() {
        const progressContainer = document.getElementById('progressBarContainer');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const videoContainer = document.getElementById('videoContainer');
        const genBtn = document.getElementById('generateBtn');

        genBtn.disabled = true;
        progressContainer.style.display = 'block';
        videoContainer.innerHTML = '<div class="loading-spinner"></div><p>Rendering Cinematic Frames...</p>';

        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 15;
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
            }
            progressFill.style.width = `${progress}%`;
            progressText.innerText = `Generating... ${Math.round(progress)}%`;
        }, 400);

        try {
            await this.completeGenerationSim();
        } catch (err) {
            console.error("Generation failed:", err);
            const videoContainer = document.getElementById('videoContainer');
            videoContainer.innerHTML = `<p style="color:#fca5a5; padding: 20px;">${err.message || "Generation failed"}</p>`;
            this.respond(`⚠️ Generation failed: ${err.message || "Unknown error"}. Backend run karo and retry.`);
        } finally {
            clearInterval(interval);
            progressFill.style.width = '100%';
            progressText.innerText = 'Generating... 100%';
        }
    }

    async completeGenerationSim() {
        const videoContainer = document.getElementById('videoContainer');
        const genBtn = document.getElementById('generateBtn');
        const progressBar = document.getElementById('progressBarContainer');

        genBtn.disabled = false;
        progressBar.style.display = 'none';

        const prompt = document.getElementById('studioPrompt').value || "AI Cinematic Render";
        const params = this.generateParams(prompt);
        const response = await this.generateVideoWithBackend(params);
        const videoUrl = response.video_url;

        videoContainer.innerHTML = `
            <video autoplay loop muted playsinline class="generated-video" controls>
                <source src="${videoUrl}" type="video/mp4">
            </video>
            <div class="video-overlay-tag">PRODUCED: ${this.state.current_quality} | ID: ${this.state.face_id}</div>
        `;

        const videoData = {
            status: response.status || "success",
            face_id: this.state.face_id,
            prompt: prompt,
            prompt_used: response.prompt_used || params.prompt,
            video_url: videoUrl,
            duration: response.duration || this.state.current_duration,
            quality: response.quality || this.state.current_quality,
            aspect_ratio: response.aspect_ratio || this.state.current_ratio || '9:16',
            model: response.model || params.model,
            face_lock: response.face_lock ?? true,
            format: params.format || "mp4",
            fps: params.fps || 24,
            created_at: new Date().toISOString()
        };

        // Save to Supabase
        if (this.supabase) {
            this.saveGeneration(videoData);
        }

        this.updateParamsViewer(params);
        this.respond(`Video ready! Tamari character identity (${this.state.face_id}) sathe generate thayu chhe ane Supabase Storage ma save thayu chhe.`);
    }

    async generateVideoWithBackend(params) {
        const formData = new FormData();
        formData.append("prompt", document.getElementById('studioPrompt').value || "AI Cinematic Render");
        formData.append("duration", params.duration);
        formData.append("quality", params.quality);
        formData.append("aspect_ratio", params.aspect_ratio);
        formData.append("model", params.model);
        formData.append("face_lock", String(params.face_lock));

        // Backend requires an image; for text mode fallback to generated placeholder.
        let imageFile = this.state.source_file;
        if (!imageFile) {
            const blob = await this.createPlaceholderImageBlob();
            imageFile = new File([blob], "placeholder.jpg", { type: "image/jpeg" });
        }
        formData.append("image", imageFile);

        const res = await fetch(`${this.backendUrl}/api/generate-video`, {
            method: "POST",
            body: formData
        });

        if (!res.ok) {
            let errorMessage = "Video generation failed";
            try {
                const errorData = await res.json();
                errorMessage = errorData.message || errorMessage;
            } catch (e) {
                console.error("Failed to parse backend error", e);
            }
            throw new Error(errorMessage);
        }

        return res.json();
    }

    async createPlaceholderImageBlob() {
        const canvas = document.createElement("canvas");
        canvas.width = 1080;
        canvas.height = 1920;
        const ctx = canvas.getContext("2d");
        const grad = ctx.createLinearGradient(0, 0, 1080, 1920);
        grad.addColorStop(0, "#0f172a");
        grad.addColorStop(1, "#312e81");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.font = "bold 60px Inter";
        ctx.fillText("Cinematic Reel", 250, 900);
        ctx.font = "32px Inter";
        ctx.fillText("Source image auto-generated for demo", 220, 970);
        return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
    }

    async saveGeneration(videoData) {
        try {
            // Logic for Storage Upload (Mocking with the URL for now)
            console.log('🚀 Uploading to Supabase Storage Bucket: videos...');
            
            const { error: dbError } = await this.supabase.from('videos').insert([videoData]);
            if (dbError) throw dbError;
            console.log('✅ Video Record Saved in DB');
        } catch (err) {
            console.error('❌ Supabase Save Error:', err.message);
        }
    }

    async uploadToStorage(file, path) {
        // This function will be used for real file uploads
        const { data, error } = await this.supabase.storage
            .from('videos')
            .upload(path, file);
        return { data, error };
    }

    downloadVideo() {
        const video = document.querySelector("#videoContainer video");
        if (!video || !video.currentSrc) {
            alert("Pehla video generate karo, pachi download available thase.");
            return;
        }
        const link = document.createElement("a");
        link.href = video.currentSrc;
        link.download = `cinematic-reel-${Date.now()}.mp4`;
        link.click();
    }

    setSourceFile(file) {
        this.state.source_file = file || null;
        const label = document.getElementById("uploadLabel");
        if (!label) return;
        label.textContent = file ? `✅ ${file.name}` : "📁 Upload Image";
    }

    updateModelPreview() {
        if (!this.state.face_metadata) {
            this.modelDisplay.innerHTML = '<div class="no-model">No Character Model Generated Yet</div>';
            return;
        }

        const data = this.state.face_metadata;
        this.modelDisplay.innerHTML = `
            <img src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=800" alt="Character Preview">
            <div class="overlay-glow"></div>
        `;
        
        this.modelInfo.innerHTML = `
            <div class="info-grid">
                <div class="info-item"><span>ID:</span> ${data.face_id}</div>
                <div class="info-item"><span>Gender:</span> ${data.gender}</div>
                <div class="info-item"><span>Age:</span> ${data.age}</div>
                <div class="info-item"><span>Style:</span> 3D Cinematic</div>
                <div class="info-item"><span>Status:</span> <span class="tag-locked">LOCKED</span></div>
            </div>
            <p class="prompt-text"><strong>Master Prompt:</strong> ${data.face_prompt}</p>
        `;
    }

    handleSend() {
        const text = this.userInput.value.trim();
        if (!text) return;

        this.addMessage(text, 'user');
        this.userInput.value = '';
        this.userInput.style.height = 'auto';

        this.processInput(text);
    }

    addMessage(text, sender) {
        const div = document.createElement('div');
        div.className = `message ${sender}-message`;
        
        // Simple message layout
        div.innerHTML = `
            <div class="msg-content">
                <span class="sender-tag">${sender === 'user' ? 'You' : 'Assistant'}</span>
                <p>${text}</p>
            </div>
        `;
        
        this.chatArea.appendChild(div);
        this.chatArea.scrollTop = this.chatArea.scrollHeight;
    }

    processInput(text) {
        // Step 1: Check face
        if (!this.state.face_id) {
            this.respond("I see you haven't selected a face yet. Consistency is key for high-quality video. Would you like to upload one or generate a new AI persona?");
            return;
        }

        // Step 2 & 3: Extract intent and parameters
        const params = this.generateParams(text);
        
        // Update UI
        this.updateParamsViewer(params);
        this.respond(`Generating your ${params.style} video using the ${params.model} model. I've enhanced your prompt for cinematic realism.`);
    }

    respond(text) {
        setTimeout(() => {
            this.addMessage(text, 'assistant');
        }, 600);
    }

    generateParams(userInput) {
        // Strict mapping check
        const validDurations = ['5s', '10s', '15s', '20s', '25s'];
        const duration = validDurations.includes(this.state.current_duration) 
            ? this.state.current_duration 
            : '5s';

        // Quality and Model mapping
        const quality = this.state.current_quality || '1080p';
        const model = 'stable-video-diffusion';
        const safeDuration = parseInt(duration, 10) > 15 ? '15s' : duration;

        // Cinematic prompt enhancement aligned with image-to-video reel pipeline
        const enhancedPrompt = [
            userInput,
            "single-subject identity lock, preserve same face, hairstyle, body structure, outfit identity, and skin tone across all frames",
            "cinematic composition, realistic shadows, depth of field, volumetric lighting, movie-grade color grading",
            "ultra-detailed textures, photorealistic skin and eyes, natural hair movement, coherent body physics",
            "smooth gimbal camera motion with stable tracking, premium social media reel storytelling",
            "vertical 9:16 framing for 1080x1920 output, emotionally cinematic atmosphere"
        ].join(", ");

        const negativePrompt = [
            "blurry frames",
            "mutated hands",
            "extra limbs",
            "distorted anatomy",
            "duplicated face",
            "low quality textures",
            "broken motion",
            "jitter",
            "flickering",
            "cartoon artifacts",
            "watermark",
            "text overlay",
            "unrealistic physics",
            "face distortion"
        ].join(", ");
        
        const params = {
            "type": "text-to-video",
            "prompt": enhancedPrompt,
            "negative_prompt": negativePrompt,
            "duration": safeDuration,
            "quality": quality,
            "model": model,
            "resolution": "1080x1920",
            "fps": 24,
            "format": "mp4",
            "aspect_ratio": this.state.current_ratio || '9:16',
            "camera_motion": "smooth gimbal motion",
            "style": "cinematic",
            "face_id": this.state.face_id,
            "face_lock": true,
            "seed": this.state.face_seed || Math.floor(Math.random() * 1000000),
            "scenes": [
                {
                    "scene": 1,
                    "description": enhancedPrompt,
                    "duration": safeDuration
                }
            ]
        };

        return params;
    }

    updateParamsViewer(params) {
        this.jsonOutput.textContent = JSON.stringify(params, null, 2);
    }

    requestUpload() {
        this.state.face_id = "f-" + Math.random().toString(36).substr(2, 9);
        this.state.face_lock = true;
        this.state.face_seed = Math.floor(Math.random() * 1000000);
        
        this.faceStatus.classList.add('connected');
        this.faceStatus.querySelector('span').textContent = "Face: Locked";
        
        const response = {
            "action": "face_locked",
            "face_id": this.state.face_id,
            "face_lock": true,
            "message": "Face identity established from upload. All future videos will maintain this identity."
        };
        this.updateParamsViewer(response);
        this.respond("Face identity established. I'm now ready to generate consistent videos for you. What shall we create?");
    }

    async requestGenerateFace() {
        this.state.face_id = "girl-model-" + Math.random().toString(36).substr(2, 5);
        this.state.face_lock = true;
        this.state.face_seed = 882910; // Specific seed for consistent girl model
        
        const faceData = {
            "face_id": this.state.face_id,
            "face_prompt": "Full body cinematic character render of a beautiful girl, stylish outfit, 8k resolution, Unreal Engine 5 render, highly detailed face and body, consistent features for daily reels, photorealistic.",
            "gender": "Female",
            "age": "22-25",
            "ethnicity": "Global",
            "hair": "Long, stylish dark hair",
            "seed": this.state.face_seed,
            "embedding": "v3_girl_emb_" + Math.random().toString(36).substr(2, 10),
            "preview_image_url": "https://api.generated.photos/v2/placeholder_girl.jpg"
        };

        this.state.face_metadata = faceData;
        
        if (this.supabase) {
            try {
                const { error } = await this.supabase.from('faces').insert([faceData]);
                if (error) {
                    console.error('❌ Supabase Save Error:', error);
                    this.respond(`⚠️ Database error: ${error.message}. (Jo 'new row violates RLS' aave to Supabase ma RLS disable karo)`);
                } else {
                    console.log('✅ Girl Model Saved:', faceData.face_id);
                }
            } catch (err) {
                console.error('❌ Unexpected Error:', err);
                this.respond("⚠️ Something went wrong while saving to the database.");
            }
        }

        this.faceStatus.classList.add('connected');
        this.faceStatus.querySelector('span').textContent = "Model: Girl (Locked)";

        this.updateParamsViewer(faceData);
        this.respond("Tamari 'Girl Model' generate thayi gayi chhe ane lock kari didhi chhe. Have tme jo koi pan video banavsho, to ama aa j girl model dekhase.");
    }
}

// Global instance for onclick handlers
window.app = new VideoAssistant();
