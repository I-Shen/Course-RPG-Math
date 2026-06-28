import os, sys, time
from datetime import datetime

os.environ["HF_HUB_DISABLE_TELEMETRY"]  = "1"
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "0"

script_dir    = os.path.dirname(os.path.abspath(__file__))
project_dir   = os.path.dirname(script_dir)
workspace_dir = os.path.dirname(project_dir)
models_dir    = os.path.join(workspace_dir, "models")
output_dir    = os.path.join(project_dir, "asset_mentah")

os.environ["HF_HOME"]      = models_dir
os.environ["HF_HUB_CACHE"] = models_dir
os.makedirs(output_dir, exist_ok=True)

print("=" * 60)
print("  SDXL 1024x1024 NATIVE RESOLUTION TEST")
print("=" * 60)

import torch
from PIL import Image

cuda_ok = torch.cuda.is_available()
print(f"\n  GPU     : {torch.cuda.get_device_name(0) if cuda_ok else 'CPU'}")
if cuda_ok:
    total_vram = torch.cuda.get_device_properties(0).total_memory / 1024**3
    print(f"  VRAM    : {total_vram:.1f} GB total")
print(f"  Target  : 1024x1024 px (native SDXL resolution)")

POSITIVE_PROMPT = "JRPG retro 16-bit pixel art, top-down 3/4 view, tile grid, shading"
NEGATIVE_PROMPT = "blurry, 3D, photorealistic, modern, smooth, antialiasing, watermark"

print(f"\n  Prompt  : {POSITIVE_PROMPT}")
print(f"  Chars   : {len(POSITIVE_PROMPT)}")

# Reference image for img2img
ref_path = os.path.join(
    os.path.expanduser("~"), ".gemini", "antigravity-ide", "brain",
    "fd524d5e-fe17-4535-8afc-14a37ad9675d",
    "solaria_easter_map_1782117913404.png"
)
use_img2img = os.path.exists(ref_path)
print(f"  Mode    : {'img2img @ 1024x1024' if use_img2img else 'text2img @ 1024x1024'}")

# ── Load Pipeline ─────────────────────────────────────────────
print(f"\n[1/3] Loading SDXL pipeline...")
t0    = time.time()
dtype = torch.float16 if cuda_ok else torch.float32

try:
    if use_img2img:
        from diffusers import AutoPipelineForImage2Image
        pipe = AutoPipelineForImage2Image.from_pretrained(
            "stabilityai/sdxl-turbo",
            torch_dtype=dtype,
            variant="fp16" if cuda_ok else None,
            cache_dir=models_dir,
            local_files_only=True
        )
    else:
        from diffusers import AutoPipelineForText2Image
        pipe = AutoPipelineForText2Image.from_pretrained(
            "stabilityai/sdxl-turbo",
            torch_dtype=dtype,
            variant="fp16" if cuda_ok else None,
            cache_dir=models_dir,
            local_files_only=True
        )

    if cuda_ok:
        print("  Enabling cpu offload + attention slicing (6GB VRAM mode)...")
        pipe.enable_model_cpu_offload()
        pipe.enable_attention_slicing(1)  # Most aggressive slicing

    print(f"  Loaded in {time.time()-t0:.1f}s")

except Exception as e:
    print(f"  ERROR: {e}")
    sys.exit(1)

# ── VRAM Before Generation ────────────────────────────────────
if cuda_ok:
    used_before = torch.cuda.memory_allocated(0) / 1024**3
    print(f"  VRAM used before gen: {used_before:.2f} GB")

# ── Generate at 1024x1024 ─────────────────────────────────────
print(f"\n[2/3] Generating 1024x1024...")
t1 = time.time()

try:
    generator = torch.Generator().manual_seed(42)

    if use_img2img:
        # Resize reference to 1024x1024
        ref_img = Image.open(ref_path).convert("RGB").resize((1024, 1024), Image.LANCZOS)
        print(f"  Reference resized to: {ref_img.size}")
        print(f"  Steps: 4 | Strength: 0.65 | Guidance: 0.0")

        result = pipe(
            prompt=POSITIVE_PROMPT,
            negative_prompt=NEGATIVE_PROMPT,
            image=ref_img,
            num_inference_steps=4,
            strength=0.65,
            guidance_scale=0.0,
            generator=generator
        )
    else:
        print(f"  Steps: 4 | Width: 1024 | Height: 1024 | Guidance: 0.0")
        result = pipe(
            prompt=POSITIVE_PROMPT,
            negative_prompt=NEGATIVE_PROMPT,
            num_inference_steps=4,
            guidance_scale=0.0,
            width=1024,
            height=1024,
            generator=generator
        )

    image = result.images[0]
    gen_time = time.time() - t1
    print(f"  Generation done in {gen_time:.1f}s")

    if cuda_ok:
        used_peak = torch.cuda.max_memory_allocated(0) / 1024**3
        print(f"  Peak VRAM used: {used_peak:.2f} GB")

except torch.cuda.OutOfMemoryError:
    print("\n  OUT OF MEMORY! 6GB VRAM tidak cukup untuk 1024x1024.")
    print("  Solusi: gunakan Real-ESRGAN upscaler dari 512x512.")
    sys.exit(2)
except Exception as e:
    print(f"  ERROR: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# ── Save ──────────────────────────────────────────────────────
print(f"\n[3/3] Saving 1024x1024 output...")
ts       = datetime.now().strftime("%Y%m%d_%H%M%S")
fname    = f"solaria_map_1024x1024_{ts}.png"
out_path = os.path.join(output_dir, fname)
image.save(out_path)

actual_w, actual_h = image.size
print(f"  Resolution: {actual_w}x{actual_h} px")
print(f"  Saved to  : asset_mentah/{fname}")

# Clean up
del pipe, result, image
if cuda_ok:
    torch.cuda.empty_cache()
    print(f"  VRAM freed")

total = time.time() - t0
print("\n" + "=" * 60)
print(f"  SUCCESS! 1024x1024 native resolution works on GTX 1660 Ti!")
print(f"  Total time: {total:.1f}s")
print(f"  File: asset_mentah/{fname}")
print("=" * 60)
