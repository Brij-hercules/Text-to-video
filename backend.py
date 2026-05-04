import os
import shutil
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from supabase import create_client
import requests
import time
import base64


load_dotenv()

app = Flask(__name__)
CORS(app)

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "generated-videos").strip()
SUPABASE_TABLE = os.getenv("SUPABASE_TABLE", "video_generations").strip()
DEFAULT_DURATION = int(os.getenv("DEFAULT_DURATION_SECONDS", "10"))
DEFAULT_FPS = int(os.getenv("DEFAULT_FPS", "24"))
LOCAL_OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "generated_videos")
os.makedirs(LOCAL_OUTPUT_DIR, exist_ok=True)

# NVIDIA NIM Config
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "").strip()
NVIDIA_BASE_URL = os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1").strip()

supabase = None
if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def build_enhanced_prompt(user_prompt: str) -> str:
    chunks = [
        user_prompt,
        "single character identity lock, preserve same facial structure, hairstyle, skin details, body proportions, and clothing continuity",
        "cinematic composition, volumetric lighting, realistic shadows, depth of field, smooth camera motion",
        "photorealistic rendering, detailed textures, physically accurate motion, emotional cinematic atmosphere",
        "movie-grade color grading, premium social media reel storytelling, stable frame consistency",
    ]
    return ", ".join(chunks)


def ensure_ffmpeg():
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg is not installed or not found in PATH.")


def create_video_from_image(image_path: str, out_path: str, duration: int, fps: int):
    # Uses zoompan + slight motion to simulate cinematic movement from one image.
    cmd = [
        "ffmpeg",
        "-y",
        "-loop",
        "1",
        "-i",
        image_path,
        "-vf",
        (
            "scale=1080:1920:force_original_aspect_ratio=increase,"
            "crop=1080:1920,"
            "zoompan=z='min(zoom+0.0008,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
            f"d={fps * duration}:s=1080x1920,"
            f"fps={fps},format=yuv420p"
        ),
        "-t",
        str(duration),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        out_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "ffmpeg failed to render video.")


def generate_video_minimax(prompt: str, image_path: str) -> str:
    """Uses MiniMax Hailuo API to generate video."""
    if not MINIMAX_API_KEY or not MINIMAX_GROUP_ID:
        raise RuntimeError("MiniMax API Key or Group ID is missing in .env")

    # Step 1: Upload image to MiniMax (Optional: if they require file_id, 
    # but some versions allow direct URL or base64. Let's use the file upload flow if needed).
    # For now, let's assume the task-based video generation with local file upload.
    
    headers = {
        "Authorization": f"Bearer {MINIMAX_API_KEY}",
        "Content-Type": "application/json"
    }

    # Note: MiniMax often uses a specific file upload API first. 
    # But some unified APIs allow direct prompt.
    # Below is the standard task submission for video-01
    
    url = f"{MINIMAX_BASE_URL}/video_generation?GroupId={MINIMAX_GROUP_ID}"
    
    payload = {
        "model": "video-01",
        "prompt": prompt,
        # For image-to-video, we might need to upload the image to their storage first
        # and get a file_id. For simplicity in this step, let's handle the direct request
        # or refer to their latest T2V if no image is provided.
    }

    # If image is provided, we should ideally upload it. 
    # Simplified version for now:
    response = requests.post(url, headers=headers, json=payload)
    res_data = response.json()
    
    if response.status_code != 200 or "task_id" not in res_data:
        raise RuntimeError(f"MiniMax API Error: {res_data.get('base_resp', {}).get('status_msg', 'Unknown error')}")

    task_id = res_data["task_id"]
    
    # Step 2: Polling
    query_url = f"{MINIMAX_BASE_URL}/query/video_generation?GroupId={MINIMAX_GROUP_ID}&task_id={task_id}"
    
    for _ in range(60): # Poll for 5-10 minutes
        time.sleep(10)
        query_res = requests.get(query_url, headers=headers)
        query_data = query_res.json()
        
        status = query_data.get("status")
        if status == "Success":
            return query_data["file_id"] # Or the URL if provided
        elif status == "Fail":
            raise RuntimeError(f"MiniMax Generation Failed: {query_data.get('error_msg')}")
            
    raise RuntimeError("MiniMax generation timed out.")


def generate_video_nvidia(image_path: str, out_path: str):
    """Uses NVIDIA NIM (Stable Video Diffusion) to generate video."""
    if not NVIDIA_API_KEY:
        raise RuntimeError("NVIDIA API Key is missing in .env")

    # NVIDIA NIM expects base64 image
    with open(image_path, "rb") as f:
        image_b64 = base64.b64encode(f.read()).decode('utf-8')

    # Note: NVIDIA NIM SVD endpoint usually follows this pattern
    # We use the generic 'genai' path or specific model path
    url = f"https://ai.api.nvidia.com/v1/genai/stabilityai/stable-video-diffusion"
    
    headers = {
        "Authorization": f"Bearer {NVIDIA_API_KEY}",
        "Accept": "application/json",
    }

    payload = {
        "image": f"data:image/jpeg;base64,{image_b64}",
        "seed": 0,
        "cfg_scale": 2.5,
        "motion_bucket_id": 127
    }

    response = requests.post(url, headers=headers, json=payload)
    res_data = response.json()

    if response.status_code != 200:
        raise RuntimeError(f"NVIDIA API Error: {res_data.get('message', 'Unknown error')}")

    # NVIDIA returns base64 video string
    video_b64 = res_data.get("video")
    if not video_b64:
        raise RuntimeError("No video data returned from NVIDIA API")

    # Save base64 to file
    with open(out_path, "wb") as f:
        f.write(base64.b64decode(video_b64))


def upload_to_supabase(video_path: str, file_name: str) -> str:
    if not supabase:
        return ""
    with open(video_path, "rb") as f:
        supabase.storage.from_(SUPABASE_BUCKET).upload(
            path=file_name,
            file=f,
            file_options={"content-type": "video/mp4"},
        )
    public_url = supabase.storage.from_(SUPABASE_BUCKET).get_public_url(file_name)
    return public_url


def save_metadata(payload: dict):
    if not supabase:
        return
    supabase.table(SUPABASE_TABLE).insert(payload).execute()


@app.get("/api/health")
def health():
    return jsonify(
        {
            "status": "ok",
            "supabase_configured": bool(supabase),
            "ffmpeg_available": bool(shutil.which("ffmpeg")),
        }
    )


@app.get("/api/videos/<path:file_name>")
def get_local_video(file_name):
    return send_from_directory(LOCAL_OUTPUT_DIR, file_name)


@app.post("/api/generate-video")
def generate_video():
    if "image" not in request.files:
        return jsonify({"status": "error", "message": "image is required"}), 400

    image = request.files["image"]
    if image.filename == "":
        return jsonify({"status": "error", "message": "image filename is empty"}), 400

    prompt = (request.form.get("prompt") or "Cinematic portrait reel").strip()
    face_lock = (request.form.get("face_lock") or "true").lower() == "true"
    quality = (request.form.get("quality") or "1080p").strip()
    aspect_ratio = (request.form.get("aspect_ratio") or "9:16").strip()
    model = (request.form.get("model") or "stable-video-diffusion").strip()
    duration_str = (request.form.get("duration") or f"{DEFAULT_DURATION}s").strip().lower()
    duration_sec = DEFAULT_DURATION
    if duration_str.endswith("s"):
        try:
            duration_sec = max(5, min(15, int(duration_str[:-1])))
        except ValueError:
            duration_sec = DEFAULT_DURATION

    enhanced_prompt = build_enhanced_prompt(prompt)

    work_dir = tempfile.mkdtemp(prefix="video_gen_")
    try:
        image_ext = os.path.splitext(image.filename)[1] or ".jpg"
        image_path = os.path.join(work_dir, f"source{image_ext}")
        out_name = f"generated_{uuid.uuid4().hex}.mp4"
        out_path = os.path.join(work_dir, out_name)
        image.save(image_path)

        ensure_ffmpeg()
        
        if model == "hailuo" or model == "nvidia":
            # Using NVIDIA NIM API
            try:
                generate_video_nvidia(image_path, out_path)
                video_url = "" # Will be set by local/supabase logic below
            except Exception as e:
                print(f"NVIDIA API failed, falling back to local: {e}")
                create_video_from_image(image_path, out_path, duration_sec, DEFAULT_FPS)
        else:
            # Default local fallback
            create_video_from_image(image_path, out_path, duration_sec, DEFAULT_FPS)

        video_url = upload_to_supabase(out_path, out_name)
        if not video_url:
            local_target = os.path.join(LOCAL_OUTPUT_DIR, out_name)
            shutil.copy2(out_path, local_target)
            base = request.host_url.rstrip("/")
            video_url = f"{base}/api/videos/{out_name}"

        metadata = {
            "prompt": prompt,
            "enhanced_prompt": enhanced_prompt,
            "video_url": video_url,
            "duration": f"{duration_sec}s",
            "quality": quality,
            "aspect_ratio": aspect_ratio,
            "model": model,
            "face_lock": face_lock,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        save_metadata(metadata)

        return jsonify(
            {
                "status": "success",
                "video_url": video_url,
                "prompt_used": enhanced_prompt,
                "duration": f"{duration_sec}s",
                "quality": quality,
                "aspect_ratio": aspect_ratio,
                "model": model,
                "face_lock": face_lock,
            }
        )
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
