import os
import sys
import time
from datetime import datetime

# ── Environment Setup ─────────────────────────────────────────
os.environ["HF_HUB_DISABLE_TELEMETRY"]    = "1"
os.environ["HF_HUB_ENABLE_HF_TRANSFER"]   = "0"

script_dir    = os.path.dirname(os.path.abspath(__file__))
project_dir   = os.path.dirname(script_dir)
workspace_dir = os.path.dirname(project_dir)
models_dir    = os.path.join(workspace_dir, "models")
output_dir    = os.path.join(project_dir, "asset_mentah")

os.environ["HF_HOME"]       = models_dir
os.environ["HF_HUB_CACHE"]  = models_dir

os.makedirs(output_dir, exist_ok=True)

print("=" * 65)
print("  SDXL MAP GENERATOR - Pixel Math RPG: Solaria Town")
print("=" * 65)
print(f"  Model Cache : {models_dir}")
print(f"  Output Dir  : {output_dir}")

# ── Import Libraries ──────────────────────────────────────────
import torch
from PIL import Image

print(f"\n  PyTorch     : {torch.__version__}")
print(f"  CUDA Active : {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"  GPU         : {torch.cuda.get_device_name(0)}")
    total = torch.cuda.get_device_properties(0).total_memory / 1024**3
    print(f"  VRAM Total  : {total:.1f} GB")

# ── Prompt (Based on visual_style_guide.md) ───────────────────
# Detailed prompt derived from the 10 Art Direction Pillars
POSITIVE_PROMPT = (
    "2D top-down JRPG pixel art town map, 16-bit retro Super Nintendo style, "
    "3/4 oblique isometric view, classic RPG village called Solaria, "
    "cobblestone stone road in cross plus pattern at center, "
    "lush green grass tiles with dark green pixel noise texture, "
    "large INN building top center with red tiled roof and wooden sign, "
    "stone Academy Library building on left with book window and subtle math rune carvings, "
    "wooden Tavern building right side with clock tower, "
    "blue river flowing on right side with wooden bridge, waterfall rocks, "
    "water wheel beside tavern, "
    "pine fir trees dense forest border on edges, "
    "rocky snow-capped mountains background at top, "
    "central stone fountain plaza with faint pi symbol carving, "
    "wooden fences and barrels along roads, iron lamp posts, "
    "small 16x16 pixel NPC characters walking on roads, "
    "thatched farmhouse near river bottom right, "
    "ancient math symbols Sigma Psi pi very faint on cobblestones as easter eggs, "
    "strong pixel shading bright highlights top-left dark shadows bottom-right, "
    "warm golden afternoon lighting, "
    "vibrant saturated colors green grass warm brown wood deep blue river, "
    "crisp pixel edges pixelated rendering no antialiasing blur, "
    "detailed textures stone crack patterns wood grain water ripple tiles, "
    "final fantasy 6 chrono trigger zelda link to the past map art style, "
    "masterpiece best quality"
)

NEGATIVE_PROMPT = (
    "blurry, soft edges, antialiasing, smooth gradient, 3D render, "
    "photorealistic, watermark, text overlay, signature, "
    "low quality, bad anatomy, extra limbs, "
    "modern buildings, cars, sci-fi elements, "
    "isometric 3D, perspective distortion, fisheye"
)

print(f"\n  Prompt length: {len(POSITIVE_PROMPT)} chars")

# ── Reference Image (Solaria Easter Map) ─────────────────────
# Use the previously generated Solaria Easter Map as img2img reference
ref_image_path = os.path.join(
    os.path.expanduser("~"),
    ".gemini", "antigravity-ide", "brain",
    "fd524d5e-fe17-4535-8afc-14a37ad9675d",
    "solaria_easter_map_1782117913404.png"
)

use_img2img = os.path.exists(ref_image_path)
print(f"  Reference img: {'FOUND - using img2img mode' if use_img2img else 'NOT FOUND - using text2img mode'}")

# ── Load Pipeline ─────────────────────────────────────────────
print(f"\n[STEP 1/3] Loading SDXL Turbo pipeline from local cache...")
t0 = time.time()

dtype = torch.float16 if torch.cuda.is_available() else torch.float32

try:
    if use_img2img:
        from diffusers import AutoPipelineForImage2Image
        pipe = AutoPipelineForImage2Image.from_pretrained(
            "stabilityai/sdxl-turbo",
            torch_dtype=dtype,
            variant="fp16" if torch.cuda.is_available() else None,
            cache_dir=models_dir,
            local_files_only=True
        )
        print(f"  Mode: Image-to-Image (guided by Solaria Easter Map reference)")
    else:
        from diffusers import AutoPipelineForText2Image
        pipe = AutoPipelineForText2Image.from_pretrained(
            "stabilityai/sdxl-turbo",
            torch_dtype=dtype,
            variant="fp16" if torch.cuda.is_available() else None,
            cache_dir=models_dir,
            local_files_only=True
        )
        print(f"  Mode: Text-to-Image")

    if torch.cuda.is_available():
        pipe.enable_model_cpu_offload()
        pipe.enable_attention_slicing()
    
    elapsed = time.time() - t0
    print(f"  Pipeline loaded in {elapsed:.1f}s")

except Exception as e:
    print(f"  ERROR loading pipeline: {e}")
    sys.exit(1)

# ── Generate Image ─────────────────────────────────────────────
print(f"\n[STEP 2/3] Generating Solaria Town Map...")

# Generation parameters
# SDXL Turbo: 1-4 steps, guidance_scale=0.0, strength 0.5-0.8 for img2img
NUM_STEPS   = 4   # More steps = better quality (4 for Turbo)
STRENGTH    = 0.7  # img2img strength: 0.0=copy ref, 1.0=ignore ref

try:
    t1 = time.time()
    
    if use_img2img:
        # Load and resize reference image to 512x512 (SDXL Turbo optimal)
        ref_image = Image.open(ref_image_path).convert("RGB")
        ref_image = ref_image.resize((512, 512), Image.LANCZOS)
        
        print(f"  Reference size: {ref_image.size}")
        print(f"  Steps: {NUM_STEPS} | Strength: {STRENGTH} | Guidance: 0.0")
        
        result = pipe(
            prompt=POSITIVE_PROMPT,
            negative_prompt=NEGATIVE_PROMPT,
            image=ref_image,
            num_inference_steps=NUM_STEPS,
            strength=STRENGTH,
            guidance_scale=0.0
        )
    else:
        print(f"  Steps: {NUM_STEPS} | Guidance: 0.0")
        result = pipe(
            prompt=POSITIVE_PROMPT,
            negative_prompt=NEGATIVE_PROMPT,
            num_inference_steps=NUM_STEPS,
            guidance_scale=0.0,
            width=512,
            height=512
        )

    elapsed_gen = time.time() - t1
    image = result.images[0]
    print(f"  Generation done in {elapsed_gen:.1f}s")

except Exception as e:
    print(f"  ERROR during generation: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# ── Save Output ────────────────────────────────────────────────
print(f"\n[STEP 3/3] Saving output to asset_mentah/...")

timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
filename  = f"solaria_map_sdxl_{timestamp}.png"
out_path  = os.path.join(output_dir, filename)

image.save(out_path)

# Also save a copy at 1024x1024 upscaled (nearest neighbor, pixel-perfect)
upscaled = image.resize((1024, 1024), Image.NEAREST)
up_filename = f"solaria_map_sdxl_{timestamp}_x2.png"
up_path = os.path.join(output_dir, up_filename)
upscaled.save(up_path)

print(f"  Saved (512x512) : {out_path}")
print(f"  Saved (1024x1024): {up_path}")

# Clean up GPU memory
del pipe
if torch.cuda.is_available():
    torch.cuda.empty_cache()
print(f"  VRAM freed")

# ── Summary ────────────────────────────────────────────────────
total_time = time.time() - t0
print("\n" + "=" * 65)
print(f"  GENERATION COMPLETE!")
print(f"  Total time : {total_time:.1f}s")
print(f"  Output     : pixel_math_rpg/asset_mentah/{filename}")
print(f"  Upscaled   : pixel_math_rpg/asset_mentah/{up_filename}")
print("=" * 65)
