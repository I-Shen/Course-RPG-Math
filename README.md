# 🎮 Pixel Math RPG — Solaria

Game RPG berbasis browser dengan tema matematika & fisika. Dibangun dengan Node.js, HTML/CSS/JS, dan AI (Gemini + Ollama).

## ✨ Fitur Utama
- 🗺️ Peta kota Solaria (top-down 2D JRPG style)
- ⚔️ Sistem pertarungan dengan soal matematika
- 🤖 AI Tutor menggunakan Gemini API / Ollama (Phi-3 lokal)
- 🔮 Easter Egg: rune matematika tersembunyi di peta
- 🎨 Aset visual dihasilkan oleh SDXL Turbo (AI lokal)

---

## 🚀 Cara Setup di Laptop Baru

### 1. Clone Repository
```bash
git clone https://github.com/USERNAME/pixel_math_rpg.git
cd pixel_math_rpg
```

### 2. Install Node Dependencies
```bash
npm install
```

### 3. Setup Environment Variables
```bash
# Copy template .env
cp .env.example .env

# Edit file .env dan isi:
# - GEMINI_API_KEY (dapatkan gratis di https://aistudio.google.com/)
# - OLLAMA_MODEL (default: phi3)
```

### 4. Jalankan Server
```bash
node server.js
```

Buka browser ke: **http://localhost:3000**

---

## 🤖 Setup AI Tutor Lokal (Opsional)

Jika ingin AI Tutor berjalan **100% offline** tanpa Gemini API:

### Install Ollama
Download dari: https://ollama.com/download

### Pull Model Phi-3
```bash
ollama pull phi3
```

### Jalankan Ollama (wajib sebelum main)
```bash
ollama serve
```

Atau di Windows, jalankan file `ollama/start_ollama.bat`

---

## 🎨 Generate Aset SDXL (Opsional)

Jika ingin generate ulang aset gambar dengan SDXL Turbo:

### Prasyarat
- Python 3.10+
- GPU NVIDIA dengan CUDA (minimal 6GB VRAM)
- ~15GB ruang disk untuk model SDXL

### Install Dependencies Python
```bash
python -m venv .venv_sdxl
.venv_sdxl\Scripts\activate   # Windows
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
pip install diffusers transformers accelerate peft huggingface_hub pillow
```

### Generate Gambar
```bash
.venv_sdxl\Scripts\python scripts\generate_map_sdxl.py
```
Output tersimpan di folder `asset_mentah/`

---

## 📁 Struktur Folder

```
pixel_math_rpg/
├── public/              # Frontend (HTML, CSS, JS)
│   ├── index.html       # Halaman utama game
│   ├── style.css        # Styling peta & UI
│   ├── game.js          # Logika game utama
│   ├── sound.js         # Efek suara chiptune
│   └── admin.html       # Panel admin soal
├── scripts/             # Script Python (SDXL generator)
├── ollama/              # Konfigurasi Ollama
├── server.js            # Backend Node.js
├── package.json         # Node dependencies
├── .env.example         # Template environment variables
└── README.md
```

---

## 🛠️ Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JS |
| Backend | Node.js (Express) |
| AI Cloud | Google Gemini API |
| AI Lokal | Ollama + Phi-3 |
| Image Gen | SDXL Turbo (Hugging Face) |
| Database | JSON file (db/) |

---

## 🤝 Kontribusi

1. Fork repository ini
2. Buat branch baru: `git checkout -b fitur/nama-fitur`
3. Commit perubahan: `git commit -m "Tambah fitur X"`
4. Push ke branch: `git push origin fitur/nama-fitur`
5. Buat Pull Request

---

## 📝 Catatan Penting
- File `.env` **tidak** masuk GitHub (berisi API key rahasia)
- Folder `node_modules/` dan `.venv_sdxl/` **tidak** masuk GitHub (terlalu besar)
- Folder `asset_mentah/` dan `db/` **tidak** masuk GitHub (generate lokal)
