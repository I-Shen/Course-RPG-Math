import os
import sys
import time

print("=" * 60)
print("  SDXL CONNECTION & HEALTH TEST")
print("=" * 60)

# â”€â”€ 1. Path Setup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
script_dir   = os.path.dirname(os.path.abspath(__file__))
project_dir  = os.path.dirname(script_dir)
workspace_dir = os.path.dirname(project_dir)
models_dir   = os.path.join(workspace_dir, "models")

os.environ["HF_HOME"]          = models_dir
os.environ["HF_HUB_CACHE"]    = models_dir
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "0"

print(f"\n[1/5] Path Check")
print(f"  Project   : {project_dir}")
print(f"  Models Dir: {models_dir}")
print(f"  Exists    : {os.path.exists(models_dir)}")

# â”€â”€ 2. PyTorch & CUDA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
print(f"\n[2/5] PyTorch & CUDA Check")
try:
    import torch
    print(f"  PyTorch Version : {torch.__version__}")
    print(f"  CUDA Available  : {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"  GPU Name        : {torch.cuda.get_device_name(0)}")
        total_vram = torch.cuda.get_device_properties(0).total_memory / 1024**3
        free_vram  = (torch.cuda.get_device_properties(0).total_memory
                      - torch.cuda.memory_allocated(0)) / 1024**3
        print(f"  Total VRAM      : {total_vram:.2f} GB")
        print(f"  Free VRAM       : {free_vram:.2f} GB")
    else:
        print("  WARNING: CUDA not available - will use CPU (very slow!)")
except ImportError as e:
    print(f"  ERROR: PyTorch not installed! {e}")
    sys.exit(1)

# â”€â”€ 3. Diffusers Library â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
print(f"\n[3/5] Diffusers Library Check")
try:
    import diffusers
    import transformers
    import accelerate
    print(f"  diffusers    : {diffusers.__version__}")
    print(f"  transformers : {transformers.__version__}")
    print(f"  accelerate   : {accelerate.__version__}")
except ImportError as e:
    print(f"  ERROR: Missing library! {e}")
    sys.exit(1)

# â”€â”€ 4. Model Cache Integrity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
print(f"\n[4/5] Model Cache Integrity Check")
model_slug = "models--stabilityai--sdxl-turbo"
model_path = os.path.join(models_dir, model_slug)

if not os.path.exists(model_path):
    print(f"  ERROR: Model cache NOT found at: {model_path}")
    print("  Run install_sdxl.bat first!")
    sys.exit(1)

snapshots_dir = os.path.join(model_path, "snapshots")
if os.path.exists(snapshots_dir):
    snapshot_ids = os.listdir(snapshots_dir)
    print(f"  Model folder  : FOUND âœ“")
    print(f"  Snapshot hash : {snapshot_ids[0] if snapshot_ids else 'EMPTY!'}")
    
    # Count key files
    snap_path = os.path.join(snapshots_dir, snapshot_ids[0]) if snapshot_ids else ""
    if snap_path and os.path.exists(snap_path):
        all_files = []
        for root, dirs, files in os.walk(snap_path):
            for f in files:
                all_files.append(f)
        safetensors = [f for f in all_files if f.endswith(".safetensors")]
        json_files  = [f for f in all_files if f.endswith(".json")]
        print(f"  .safetensors  : {len(safetensors)} file(s)")
        print(f"  .json configs : {len(json_files)} file(s)")
        
        # Check critical UNet file
        unet_ok = any("unet" in f.lower() or "model" in f.lower() for f in safetensors)
        print(f"  UNet weights  : {'FOUND âœ“' if unet_ok else 'NOT FOUND âœ—'}")
else:
    print(f"  ERROR: No snapshots folder found!")
    sys.exit(1)

# â”€â”€ 5. Pipeline Quick Load Test â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
print(f"\n[5/5] Pipeline Load Test (no image generation)")
print("  Loading SDXL pipeline from local cache...")
t0 = time.time()

try:
    from diffusers import AutoPipelineForText2Image

    dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    pipe = AutoPipelineForText2Image.from_pretrained(
        "stabilityai/sdxl-turbo",
        torch_dtype=dtype,
        variant="fp16" if torch.cuda.is_available() else None,
        cache_dir=models_dir,
        local_files_only=True
    )

    if torch.cuda.is_available():
        pipe.enable_model_cpu_offload()
        pipe.enable_attention_slicing()
    
    elapsed = time.time() - t0
    print(f"  Pipeline loaded: OK âœ“  ({elapsed:.1f}s)")
    print(f"  Device         : {next(pipe.unet.parameters()).device}")
    
    # Free memory after test
    del pipe
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    print(f"  Memory cleaned : OK âœ“")

except Exception as e:
    print(f"  ERROR loading pipeline: {e}")
    sys.exit(1)

# â”€â”€ Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
print("\n" + "=" * 60)
print("  âœ… ALL CHECKS PASSED - SDXL READY TO USE!")
print("=" * 60)
