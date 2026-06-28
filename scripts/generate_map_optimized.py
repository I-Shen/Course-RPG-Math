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
print("  SDXL MAP GENERATOR - Optimized 70-char Prompt")
print("=" * 60)

import torch
from PIL import Image

# ── Optimized Prompt (fits CLIP 77-token limit) ───────────────
POSITIVE_PROMPT = "JRPG retro 16-bit pixel art, top-down 3/4 view, tile grid, shading"
NEGATIVE_PROMPT = "blurry, 3D, photorealistic, modern, smooth, antialiasing, watermark"

print(f"\n  Prompt  : {POSITIVE_PROMPT}")
print(f"  Length  : {len(POSITIVE_PROMPT)} chars")
print(f"  GPU     : {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'}")

# ── Reference image (Solaria Easter Map) ─────────────────────
ref_path = os.path.join(
    os.path.expanduser("~"), ".gemini", "antigravity-ide", "brain",
    "fd524d5e-fe17-4535-8afc-14a37ad9675d",
    "solaria_easter_map_1782117913404.png"
)
use_img2img = os.path.exists(ref_path)
print(f"  Mode    : {'img2img (with Solaria ref)' if use_img2img else 'text2img'}")

# ── Load Pipeline ─────────────────────────────────────────────
print(f"\n[1/3] Loading pipeline...")
t0    = time.time()
dtype = torch.float16 if torch.cuda.is_available() else torch.float32

if use_img2img:
    from diffusers import AutoPipelineForImage2Image
    pipe = AutoPipelineForImage2Image.from_pretrained(
        "stabilityai/sdxl-turbo",
        torch_dtype=dtype, variant="fp16" if torch.cuda.is_available() else None,
        cache_dir=models_dir, local_files_only=True
    )
else:
    from diffusers import AutoPipelineForText2Image
    pipe = AutoPipelineForText2Image.from_pretrained(
        "stabilityai/sdxl-turbo",
        torch_dtype=dtype, variant="fp16" if torch.cuda.is_available() else None,
        cache_dir=models_dir, local_files_only=True
    )

if torch.cuda.is_available():
    pipe.enable_model_cpu_offload()
    pipe.enable_attention_slicing()

print(f"  Loaded in {time.time()-t0:.1f}s")

# ── Generate ──────────────────────────────────────────────────
print(f"\n[2/3] Generating map...")
t1 = time.time()

# Generate 4 variations with different seeds for best result
results = []
seeds   = [42, 1337, 2024, 9999]

for i, seed in enumerate(seeds):
    print(f"  Variation {i+1}/4 (seed={seed})...", end=" ", flush=True)
    generator = torch.Generator().manual_seed(seed)

    if use_img2img:
        ref_img = Image.open(ref_path).convert("RGB").resize((512, 512), Image.LANCZOS)
        img = pipe(
            prompt          = POSITIVE_PROMPT,
            negative_prompt = NEGATIVE_PROMPT,
            image           = ref_img,
            num_inference_steps = 4,
            strength        = 0.65,
            guidance_scale  = 0.0,
            generator       = generator
        ).images[0]
    else:
        img = pipe(
            prompt          = POSITIVE_PROMPT,
            negative_prompt = NEGATIVE_PROMPT,
            num_inference_steps = 4,
            guidance_scale  = 0.0,
            width=512, height=512,
            generator       = generator
        ).images[0]

    results.append((seed, img))
    t_var = time.time() - t1
    print(f"done ({t_var:.1f}s total)")

# ── Save All Variations ───────────────────────────────────────
print(f"\n[3/3] Saving {len(results)} variations...")
ts = datetime.now().strftime("%Y%m%d_%H%M%S")

saved = []
for i, (seed, img) in enumerate(results):
    # Save 512x512 original
    fname   = f"solaria_map_v{i+1}_seed{seed}_{ts}.png"
    fpath   = os.path.join(output_dir, fname)
    img.save(fpath)

    # Save 1024x1024 pixel-perfect upscale
    up      = img.resize((1024, 1024), Image.NEAREST)
    ufname  = f"solaria_map_v{i+1}_seed{seed}_{ts}_x2.png"
    up.save(os.path.join(output_dir, ufname))

    saved.append(fname)
    print(f"  Saved: asset_mentah/{fname}")
    print(f"  Saved: asset_mentah/{ufname}")

# Clean up
del pipe, results
if torch.cuda.is_available():
    torch.cuda.empty_cache()

# ── Summary ───────────────────────────────────────────────────
total = time.time() - t0
print("\n" + "=" * 60)
print(f"  DONE! {len(saved)} variations generated in {total:.1f}s")
print(f"  Best result: pick from asset_mentah/ folder")
print("=" * 60)
