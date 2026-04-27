class VideoAssistant {
    constructor() {
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
            current_tab: 'chat',
            history: []
        };
        
        this.init();
    }

    init() {
        this.chatArea = document.getElementById('chatArea');
        this.previewArea = document.getElementById('previewArea');
        this.modelDisplay = document.getElementById('modelDisplay');
        this.modelInfo = document.getElementById('modelInfo');
        this.userInput = document.getElementById('userInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.jsonOutput = document.getElementById('jsonOutput');
        this.faceStatus = document.getElementById('faceStatus');

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
        this.chatArea.style.display = 'none';
        this.previewArea.style.display = 'none';
        this.studioArea = document.getElementById('studioArea');
        this.studioArea.style.display = 'none';

        if (tab === 'chat') {
            this.chatArea.style.display = 'flex';
        } else if (tab === 'preview') {
            this.previewArea.style.display = 'flex';
            this.updateModelPreview();
        } else if (tab === 'studio') {
            this.studioArea.style.display = 'flex';
        }
    }

    setQuality(q) {
        this.state.current_quality = q;
        this.updateActiveButtons('resolution', q);
    }

    setDuration(d) {
        this.state.current_duration = d;
        this.updateActiveButtons('duration', d);
    }

    setModel(m) {
        this.state.current_model = m;
    }

    updateActiveButtons(type, value) {
        // Logic to highlight selected buttons in studio
        console.log(`Setting ${type} to ${value}`);
    }

    handleStudioGenerate() {
        if (!this.state.face_id) {
            this.switchTab('chat');
            this.respond("Pehla tamari character identity (Girl Model) create karo!");
            return;
        }

        const params = this.generateParams("Studio generated cinematic video");
        this.updateParamsViewer(params);
        alert("Video Production Started with Studio Parameters! Check JSON output.");
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
        const quality = this.state.current_quality;
        const model = (quality === '1080p') ? 'pro' : 'turbo';

        // Mock prompt enhancement logic
        const enhancedPrompt = `${userInput}, cinematic lighting, 8k resolution, masterful camera work, highly detailed environment, emotional depth, photorealistic.`;
        
        const params = {
            "type": "text-to-video",
            "prompt": enhancedPrompt,
            "negative_prompt": "low resolution, blurry, distorted face, unrealistic, watermark, bad anatomy",
            "duration": duration,
            "quality": quality,
            "model": model,
            "camera_motion": "drone", // Defaulting to drone as per request
            "style": "cinematic",
            "face_id": this.state.face_id,
            "face_lock": true,
            "seed": this.state.face_seed || Math.floor(Math.random() * 1000000),
            "scenes": [
                {
                    "scene": 1,
                    "description": enhancedPrompt,
                    "duration": duration
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
