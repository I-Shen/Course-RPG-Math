import os
import sys

# Disable Hugging Face telemetry and extra telemetry connections
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "0"

import torch
from diffusers import AutoPipelineForText2Image
from huggingface_hub import snapshot_download

# Configure external cache directory
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
workspace_dir = os.path.dirname(parent_dir)
models_cache_dir = os.path.join(workspace_dir, "models")

# Set Hugging Face environment variables to redirect downloads
os.environ["HF_HOME"] = models_cache_dir
os.environ["HF_HUB_CACHE"] = models_cache_dir

print("========================================================")
print("STABLE DIFFUSION XL (SDXL) TEST ENVIRONMENT")
print("========================================================")
print(f"Python Version: {sys.version}")
print(f"Cache Directory: {models_cache_dir}")
print(f"CUDA is available: {torch.cuda.is_available()}")

if torch.cuda.is_available():
    print(f"Active GPU: {torch.cuda.get_device_name(0)}")
    print(f"Current VRAM Allocated: {torch.cuda.memory_allocated(0) / 1024**2:.2f} MB")
else:
    print("WARNING: CUDA is NOT available. Running on CPU will be extremely slow!")

# We use sdxl-turbo because it is optimized for 1-step generations (perfect for 6GB VRAM)
model_id = "stabilityai/sdxl-turbo"

import time

# Step 1: Pre-download model sequentially with automatic retry loop (WinError 10054/10038 bypass)
print(f"\n[STEP 1/2] Pre-downloading model '{model_id}' sequentially (max_workers=1)...")
max_retries = 6
for attempt in range(max_retries):
    try:
        print(f"Pre-download attempt {attempt + 1}/{max_retries}...")
        snapshot_download(
            repo_id=model_id,
            cache_dir=models_cache_dir,
            max_workers=1,
            ignore_patterns=["*.bin", "*.msgpack", "*.ckpt", "*non_ema*", "*keras*"]
        )
        print("Pre-download completed successfully!")
        break
    except Exception as e:
        print(f"Attempt {attempt + 1} failed: {e}")
        if attempt < max_retries - 1:
            print("Retrying in 5 seconds...")
            time.sleep(5)
        else:
            print("All pre-download attempts failed. Exiting with error to trigger retry loop...")
            sys.exit(1)


# Step 2: Load model into Diffusers pipeline
print(f"\n[STEP 2/2] Loading model '{model_id}' into pipeline (using fp16)...")
try:
    pipe = AutoPipelineForText2Image.from_pretrained(
        model_id, 
        torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32, 
        variant="fp16" if torch.cuda.is_available() else None,
        cache_dir=models_cache_dir,
        local_files_only=True
    )
    
    # 6GB VRAM Optimization: Enable CPU Model Offloading & Attention Slicing
    if torch.cuda.is_available():
        print("Enabling VRAM optimizations (Model CPU Offload & Attention Slicing)...")
        # CPU model offload is much more VRAM-efficient than pipe.to("cuda") for SDXL on 6GB GPUs
        pipe.enable_model_cpu_offload()
        pipe.enable_attention_slicing()
    else:
        pipe = pipe.to("cpu")

    prompt = "A JRPG retro 16-bit town plaza with fountain, medieval pixel art style, vibrant colors"
    print(f"\nGenerating image with prompt: '{prompt}'...")
    
    # SDXL Turbo uses 1 inference step and a guidance scale of 0.0 for optimal results
    result = pipe(
        prompt=prompt, 
        num_inference_steps=1, 
        guidance_scale=0.0
    )
    
    image = result.images[0]
    
    # Save the output image inside the project folder
    output_path = os.path.join(parent_dir, "sdxl_output.png")
    image.save(output_path)
    print(f"Saved to: {os.path.abspath(output_path)}")
    print("========================================================")

except Exception as e:
    print("\nERROR occurred during SDXL loading or generation:")
    print(e)
    sys.exit(1)

