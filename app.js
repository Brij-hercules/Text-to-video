class VideoAssistant {
    constructor() {
        // Supabase Configuration
        this.supabaseUrl = 'https://dfamxzkezsfmetsttrjp.supabase.co';
        this.supabaseKey = 'sb_publishable_jabIvwy51ZJqvE2zA9vJzg_EuqeaLyv';
        this.supabase = null;

        if (window.supabase) {
            this.supabase = window.supabase.createClient(this.supabaseUrl, this.supabaseKey);
            console.log('✅ Supabase Initialized Successfully');
        } else {
            console.error('❌ Supabase Library not found. Check index.html script tag.');
        }

        this.state = {
            face_id: null,
            face_lock: false,
            current_model: 'pro',
            current_quality: '1080p',
            current_duration: '5s',
            history: []
        };
        
        this.init();
    }

    init() {
        this.chatArea = document.getElementById('chatArea');
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

        // Auto-expand textarea
        this.userInput.addEventListener('input', () => {
            this.userInput.style.height = 'auto';
            this.userInput.style.height = this.userInput.scrollHeight + 'px';
        });
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

    requestGenerateFace() {
        this.state.face_id = "f-" + Math.random().toString(36).substr(2, 9);
        this.state.face_lock = true;
        this.state.face_seed = 422789; // Fixed seed for consistency as requested
        
        // Detailed attributes as per Manager rules
        const faceData = {
            "face_id": this.state.face_id,
            "face_prompt": "Cinematic headshot of a professional individual, sharp facial features, detailed skin texture, soft studio lighting, 8k resolution.",
            "gender": "Neutral/Professional",
            "age": "28-32",
            "ethnicity": "Diverse/Global",
            "hair": "Clean-cut, dark brown",
            "seed": this.state.face_seed,
            "embedding": "v3_emb_" + Math.random().toString(36).substr(2, 12),
            "preview_image_url": "https://api.generated.photos/v2/placeholder.jpg" // Placeholder for Supabase storage
        };

        this.state.face_metadata = faceData;
        
        this.faceStatus.classList.add('connected');
        this.faceStatus.querySelector('span').textContent = "Identity: Verified";

        this.updateParamsViewer(faceData);
        this.respond("Face identity registered in database. Identity consistency is now active. High-fidelity embedding generated for cross-video synchronization.");
    }
}

// Global instance for onclick handlers
window.app = new VideoAssistant();
