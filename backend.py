import os
import shutil
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from supabase import create_client


load_dotenv()

app = Flask(__name__)
CORS(app)

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "generated-videos").strip()
SUPABASE_TABLE = os.getenv("SUPABASE_TABLE", "video_generations").strip()
DEFAULT_DURATION = int(os.getenv("DEFAULT_DURATION_SECONDS", "10"))
DEFAULT_FPS = int(os.getenv("DEFAULT_FPS", "24"))

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


def upload_to_supabase(video_path: str, file_name: str) -> str:
    if not supabase:
        return file_name
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
        create_video_from_image(image_path, out_path, duration_sec, DEFAULT_FPS)
        video_url = upload_to_supabase(out_path, out_name)

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
