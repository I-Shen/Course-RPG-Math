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

TARGET_W = 1920
TARGET_H = 1080

print("=" * 62)
print(f"  SDXL {TARGET_W}x{TARGET_H} RESOLUTION TEST")
print("=" * 62)

import torch
from PIL import Image

cuda_ok = torch.cuda.is_available()
total_vram = torch.cuda.get_device_properties(0).total_memory / 1024**3 if cuda_ok else 0

print(f"\n  GPU        : {torch.cuda.get_device_name(0) if cuda_ok else 'CPU'}")
print(f"  VRAM Total : {total_vram:.1f} GB")
print(f"  Target     : {TARGET_W}x{TARGET_H} px  ({TARGET_W*TARGET_H/1e6:.2f} MP)")
print(f"  vs 1024x1024: {TARGET_W*TARGET_H / (1024*1024):.2f}x more pixels")

# Pixel math comparison
px_1024 = 1024 * 1024
px_target = TARGET_W * TARGET_H
vram_1024_peak = 5.23  # from previous test
est_vram = vram_1024_peak * (px_target / px_1024)
print(f"\n  Estimasi VRAM (linear) : ~{est_vram:.1f} GB")
print(f"  Estimasi VRAM (quadratic) : ~{vram_1024_peak * (px_target/px_1024)**1.5:.1f} GB")
print(f"  WARNING: {TARGET_W}x{TARGET_H} mungkin melebihi 6GB!")

POSITIVE_PROMPT = "JRPG retro 16-bit pixel art, top-down 3/4 view, tile grid, shading"
NEGATIVE_PROMPT = "blurry, 3D, photorealistic, modern, smooth, antialiasing, watermark"

print(f"\n  Prompt : {POSITIVE_PROMPT}")

# Reference image
ref_path = os.path.join(
    os.path.expanduser("~"), ".gemini", "antigravity-ide", "brain",
    "fd524d5e-fe17-4535-8afc-14a37ad9675d",
    "solaria_easter_map_1782117913404.png"
)
use_img2img = os.path.exists(ref_path)
print(f"  Mode   : {'img2img' if use_img2img else 'text2img'} @ {TARGET_W}x{TARGET_H}")

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
        print("  Enabling cpu offload + max attention slicing...")
        pipe.enable_model_cpu_offload()
        pipe.enable_attention_slicing(1)   # slice=1 = most memory-efficient

    print(f"  Loaded in {time.time()-t0:.1f}s")

except Exception as e:
    print(f"  ERROR loading: {e}")
    sys.exit(1)

# ── Generate ──────────────────────────────────────────────────
print(f"\n[2/3] Generating {TARGET_W}x{TARGET_H}...")
print(f"  (Jika OOM, akan exit dengan pesan jelas - sistem aman)")
t1 = time.time()

if cuda_ok:
    torch.cuda.reset_peak_memory_stats()

try:
    generator = torch.Generator().manual_seed(42)

    if use_img2img:
        # Resize ref to target resolution (landscape crop from square)
        ref_img = Image.open(ref_path).convert("RGB")
        ref_img = ref_img.resize((TARGET_W, TARGET_H), Image.LANCZOS)
        print(f"  Reference resized to: {ref_img.size}")
        print(f"  Steps=4 | Strength=0.65 | Guidance=0.0")

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
        # Must be divisible by 8 for VAE
        w = (TARGET_W // 8) * 8
        h = (TARGET_H // 8) * 8
        print(f"  VAE-adjusted size: {w}x{h}")
        print(f"  Steps=4 | Guidance=0.0")

        result = pipe(
            prompt=POSITIVE_PROMPT,
            negative_prompt=NEGATIVE_PROMPT,
            num_inference_steps=4,
            guidance_scale=0.0,
            width=w,
            height=h,
            generator=generator
        )

    image      = result.images[0]
    gen_time   = time.time() - t1
    peak_vram  = torch.cuda.max_memory_allocated(0) / 1024**3 if cuda_ok else 0

    print(f"\n  Generation BERHASIL in {gen_time:.1f}s")
    print(f"  Peak VRAM used: {peak_vram:.2f} GB / {total_vram:.1f} GB")
    print(f"  VRAM headroom : {total_vram - peak_vram:.2f} GB sisa")

except torch.cuda.OutOfMemoryError:
    print(f"\n  OUT OF MEMORY! {TARGET_W}x{TARGET_H} melebihi kapasitas 6GB VRAM.")
    print(f"  Solusi terbaik: generate 1024x1024 lalu upscale dengan Real-ESRGAN.")
    if cuda_ok:
        torch.cuda.empty_cache()
    sys.exit(2)

except Exception as e:
    print(f"\n  ERROR: {e}")
    import traceback
    traceback.print_exc()
    if cuda_ok:
        torch.cuda.empty_cache()
    sys.exit(1)

# ── Save ──────────────────────────────────────────────────────
print(f"\n[3/3] Saving {TARGET_W}x{TARGET_H} output...")
ts     = datetime.now().strftime("%Y%m%d_%H%M%S")
fname  = f"solaria_map_{TARGET_W}x{TARGET_H}_{ts}.png"
fpath  = os.path.join(output_dir, fname)
image.save(fpath)

actual_w, actual_h = image.size
print(f"  Actual size : {actual_w}x{actual_h} px")
print(f"  Saved to    : asset_mentah/{fname}")

del pipe, result, image
if cuda_ok:
    torch.cuda.empty_cache()

total = time.time() - t0
print("\n" + "=" * 62)
print(f"  SUCCESS! {TARGET_W}x{TARGET_H} bisa jalan di GTX 1660 Ti!")
print(f"  Total time : {total:.1f}s")
print("=" * 62)
