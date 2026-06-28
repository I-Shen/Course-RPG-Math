const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

// Load .env manually to support Gemini API Key without extra npm dependencies
if (fs.existsSync(path.join(__dirname, '.env'))) {
  const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
  envContent.split(/\r?\n/).forEach(line => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db/database.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Membaca database
function readDB() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error("Gagal membaca database.json:", error);
    return { users: [], chapters: [], questions: [], shopItems: [], coopRooms: {} };
  }
}

// Helper: Menulis database
function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error("Gagal menulis database.json:", error);
  }
}

// ==================== API ENDPOINTS ====================

// 1. Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
  
  if (!user) {
    return res.status(401).json({ error: "Username atau Password salah!" });
  }

  // Cek Daily Login Streak untuk Siswa
  if (user.role === 'student') {
    const today = new Date().toISOString().split('T')[0];
    const lastLogin = user.stats.lastLoginDate;
    
    if (lastLogin !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      if (lastLogin === yesterdayStr) {
        user.stats.dailyStreak += 1;
      } else {
        user.stats.dailyStreak = 1;
      }
      
      // Bonus Gold Login Harian
      const loginBonus = user.stats.dailyStreak * 10;
      user.stats.gold += loginBonus;
      user.stats.lastLoginDate = today;
      writeDB(db);
      
      return res.json({ 
        message: `Selamat datang kembali! Login beruntun hari ke-${user.stats.dailyStreak}. Anda mendapatkan ${loginBonus} Gold!`,
        user: { username: user.username, role: user.role, stats: user.stats }
      });
    }
  }

  res.json({ user: { username: user.username, role: user.role, stats: user.stats } });
});

// 2. Mengambil Bab Soal
app.get('/api/chapters', (req, res) => {
  const db = readDB();
  res.json(db.chapters);
});

// 3. Mengambil Soal untuk Siswa (Kunci Jawaban Disembunyikan)
app.get('/api/questions/chapter/:chapterId', (req, res) => {
  const { chapterId } = req.params;
  const db = readDB();
  const chapterQuestions = db.questions
    .filter(q => q.chapterId === chapterId)
    .map(q => {
      // Sembunyikan indeks jawaban asli untuk keamanan client-side
      const { answer, ...rest } = q;
      return rest;
    });
  
  res.json(chapterQuestions);
});

// 4. Memproses Jawaban Soal Latihan & Boss (State-Machine Backend)
app.post('/api/answer', (req, res) => {
  const { username, questionId, selectedOption, timeElapsed } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  const question = db.questions.find(q => q.id === questionId);

  if (!user || !question) {
    return res.status(404).json({ error: "User atau Soal tidak ditemukan!" });
  }

  const isCorrect = question.answer === parseInt(selectedOption);
  let damageDealt = 0;
  let damageTaken = 0;
  let expGained = 0;
  let goldGained = 0;
  let message = "";
  let levelUp = false;

  const isBoss = question.id.endsWith('5') || question.id.endsWith('0'); // Soal ke-5 atau ke-10 di seed berakhiran 5 atau 0 (Boss)

  if (isCorrect) {
    // Hitung damage berdasarkan seberapa cepat murid menjawab
    const speedBonus = Math.max(0, (question.timeLimit - timeElapsed) / question.timeLimit);
    damageDealt = Math.round(isBoss ? (30 + speedBonus * 30) : (50 + speedBonus * 50));
    expGained = isBoss ? 40 : 15;
    goldGained = isBoss ? 20 : 10;
    
    // Perbarui Progres EXP & Gold
    user.stats.exp += expGained;
    user.stats.gold += goldGained;
    message = `Serangan berhasil! Anda menjawab dengan benar dan memberikan ${damageDealt} damage.`;

    // Cek Level Up
    const requiredExp = user.stats.level * 100;
    if (user.stats.exp >= requiredExp) {
      user.stats.exp -= requiredExp;
      user.stats.level += 1;
      user.stats.maxHp += 15;
      user.stats.hp = user.stats.maxHp; // Pulihkan HP penuh saat level up
      levelUp = true;
      message += ` Karakter Anda naik ke Level ${user.stats.level}! HP dipulihkan sepenuhnya.`;
      
      // Berikan Gelar baru berdasarkan level
      const titleMilestones = {
        2: "Algebra Novice",
        5: "Geometry Squire",
        8: "Trig Knight",
        12: "Calculus Archmage",
        20: "Mathematician Legend"
      };
      if (titleMilestones[user.stats.level]) {
        const newTitle = titleMilestones[user.stats.level];
        if (!user.stats.titles.includes(newTitle)) {
          user.stats.titles.push(newTitle);
          user.stats.activeTitle = newTitle;
          message += ` Anda dianugerahi gelar baru: "${newTitle}"!`;
        }
      }
    }
  } else {
    // Jawaban salah: Siswa menerima damage
    damageTaken = isBoss ? 25 : 15;
    user.stats.hp = Math.max(0, user.stats.hp - damageTaken);
    message = `Serangan meleset! Monster menyerang balik dan Anda kehilangan ${damageTaken} HP.`;
  }

  writeDB(db);

  res.json({
    correct: isCorrect,
    damageDealt,
    damageTaken,
    expGained,
    goldGained,
    levelUp,
    message,
    explanation: question.explanation,
    newStats: user.stats
  });
});

// 5. Penyelamatan Saat HP 0 (Rescue Question)
app.post('/api/rescue-answer', (req, res) => {
  const { username, questionId, selectedOption } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  const question = db.questions.find(q => q.id === questionId);

  if (!user || !question) {
    return res.status(404).json({ error: "User atau Soal tidak ditemukan!" });
  }

  const isCorrect = question.answer === parseInt(selectedOption);

  if (isCorrect) {
    // Bangkitkan dengan 25% HP dan beri notifikasi
    user.stats.hp = Math.round(user.stats.maxHp * 0.25);
    writeDB(db);
    res.json({
      success: true,
      message: `Kebangkitan Berhasil! Anda menjawab Soal Penyelamat dengan benar. Karakter kembali bangkit dengan ${user.stats.hp} HP!`,
      newStats: user.stats
    });
  } else {
    res.json({
      success: false,
      message: `Penyelamatan Gagal! Anda gugur dalam pertempuran dan terpaksa kembali ke Kota.`,
      newStats: user.stats
    });
  }
});

// 6. Dapatkan Item Toko
app.get('/api/shop/items', (req, res) => {
  const db = readDB();
  res.json(db.shopItems);
});

// 7. Beli Item dari Shop
app.post('/api/shop/buy', (req, res) => {
  const { username, itemId } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  const item = db.shopItems.find(i => i.id === itemId);

  if (!user || !item) {
    return res.status(404).json({ error: "User atau Item tidak ditemukan!" });
  }

  if (user.stats.gold < item.cost) {
    return res.status(400).json({ error: "Gold Anda tidak cukup!" });
  }

  if (user.stats.inventory.includes(item.id)) {
    return res.status(400).json({ error: "Anda sudah memiliki item ini!" });
  }

  // Potong emas dan simpan ke inventori
  user.stats.gold -= item.cost;
  user.stats.inventory.push(item.id);
  writeDB(db);

  res.json({ message: `Berhasil membeli ${item.name}!`, newStats: user.stats });
});

// 8. Equip Gear
app.post('/api/shop/equip', (req, res) => {
  const { username, itemId } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  const item = db.shopItems.find(i => i.id === itemId);

  if (!user) {
    return res.status(404).json({ error: "User tidak ditemukan!" });
  }

  if (itemId === "None") {
    // Unequip item
    return res.status(400).json({ error: "Gunakan tipe item spesifik untuk dilepas." });
  }

  if (!item || !user.stats.inventory.includes(item.id)) {
    return res.status(400).json({ error: "Item tidak dimiliki di inventori!" });
  }

  // Pasang item berdasarkan kategori
  user.stats.equippedGear[item.type] = item.name;
  writeDB(db);

  res.json({ message: `Berhasil menggunakan ${item.name}!`, newStats: user.stats });
});

// 9. Pulihkan HP saat di Kota (Town Rest)
app.post('/api/town/heal', (req, res) => {
  const { username } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());

  if (!user) {
    return res.status(404).json({ error: "User tidak ditemukan!" });
  }

  // Pemulihan HP di Kota (gratis, memulihkan HP penuh)
  user.stats.hp = user.stats.maxHp;
  writeDB(db);
  res.json({ message: "HP Anda telah dipulihkan sepenuhnya di Penginapan Kota!", newStats: user.stats });
});

// 10. Klaim Code Redeem (Simulasi Top-Up Gratis)
app.post('/api/redeem', (req, res) => {
  const { username, code } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());

  if (!user) {
    return res.status(404).json({ error: "User tidak ditemukan!" });
  }

  const cleanCode = code.trim().toUpperCase();
  let goldReward = 0;
  let msg = "";

  if (cleanCode === "PIXELMATH90") {
    goldReward = 100;
    msg = "Code berhasil! Mendapatkan 100 Gold secara gratis.";
  } else if (cleanCode === "SUPERSCHOLAR") {
    goldReward = 250;
    msg = "Code Legendaris! Mendapatkan 250 Gold secara gratis.";
  } else {
    return res.status(400).json({ error: "Redeem Code salah atau kadaluarsa!" });
  }

  user.stats.gold += goldReward;
  writeDB(db);

  res.json({ message: msg, newStats: user.stats });
});

// ==================== ADMIN / TEACHER ENDPOINTS ====================

// 1. Get All Students
app.get('/api/admin/students', (req, res) => {
  const db = readDB();
  const students = db.users.filter(u => u.role === 'student');
  res.json(students);
});

// 2. Register New Student
app.post('/api/admin/students', (req, res) => {
  const { username, password } = req.body;
  const db = readDB();

  if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: "Username siswa sudah terdaftar!" });
  }

  const newStudent = {
    username: username.trim(),
    password: password.trim(),
    role: "student",
    stats: {
      level: 1,
      exp: 0,
      hp: 100,
      maxHp: 100,
      gold: 50,
      gender: "male",
      charClass: "Warrior",
      equippedGear: { weapon: "None", hat: "None", armor: "None" },
      inventory: [],
      titles: ["Novice Learner"],
      activeTitle: "Novice Learner",
      dailyStreak: 1,
      lastLoginDate: new Date().toISOString().split('T')[0]
    }
  };

  db.users.push(newStudent);
  writeDB(db);
  res.json({ message: `Siswa "${username}" berhasil didaftarkan!`, student: newStudent });
});

// 3. Get All Questions (For Admin Editor)
app.get('/api/admin/questions', (req, res) => {
  const db = readDB();
  res.json(db.questions);
});

// 4. Create New Question
app.post('/api/admin/questions', (req, res) => {
  const newQ = req.body;
  const db = readDB();

  newQ.id = "q" + (db.questions.length + 1);
  newQ.answer = parseInt(newQ.answer);
  newQ.timeLimit = parseInt(newQ.timeLimit);

  db.questions.push(newQ);
  writeDB(db);
  res.json({ message: "Soal berhasil ditambahkan!", question: newQ });
});

// 5. Update Question
app.put('/api/admin/questions/:id', (req, res) => {
  const { id } = req.params;
  const updatedQ = req.body;
  const db = readDB();

  const idx = db.questions.findIndex(q => q.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Soal tidak ditemukan!" });
  }

  updatedQ.answer = parseInt(updatedQ.answer);
  updatedQ.timeLimit = parseInt(updatedQ.timeLimit);
  db.questions[idx] = { ...db.questions[idx], ...updatedQ };
  writeDB(db);

  res.json({ message: "Soal berhasil diperbarui!" });
});

// 6. Delete Question
app.delete('/api/admin/questions/:id', (req, res) => {
  const { id } = req.params;
  const db = readDB();

  const filtered = db.questions.filter(q => q.id !== id);
  if (filtered.length === db.questions.length) {
    return res.status(404).json({ error: "Soal tidak ditemukan!" });
  }

  db.questions = filtered;
  writeDB(db);
  res.json({ message: "Soal berhasil dihapus!" });
});

// 6.5. Generate Question with AI (Supports Gemini Cloud & Ollama Local Fallback)
app.post('/api/admin/questions/generate-ai', async (req, res) => {
  const { chapterId, level, difficulty, fallbackModel } = req.body;
  
  const chapterLabels = {
    ch1: "Operasi Dasar Bilangan (SD - penjumlahan, pengurangan, perkalian, pembagian sederhana)",
    ch2: "Pecahan Sederhana (SD)",
    ch3: "Persamaan Linear (SMP)",
    ch4: "Aritmatika Sosial (SMP - untung, rugi, diskon, tabungan)",
    ch5: "Trigonometri Dasar (SMA - sin, cos, tan, sudut istimewa)",
    ch6: "Limit & Turunan (SMA)",
    ch7: "Matriks & OBE (College - perkalian matriks, invers, eliminasi gauss)",
    ch8: "PD Biasa (College - persamaan diferensial tingkat 1)"
  };

  const topic = chapterLabels[chapterId] || chapterId;
  const geminiKey = process.env.GEMINI_API_KEY;

  const prompt = `Anda adalah AI asisten pembuat soal matematika RPG retro. Buatlah sebuah soal matematika berkualitas tinggi dalam Bahasa Indonesia.
Tingkat Sekolah: ${level}
Bab Topik: ${topic}
Tingkat Kesulitan: ${difficulty}
 
ATURAN KETAT:
- Format respon harus berupa JSON yang valid saja, TANPA tanda kutip kode markdown (\`\`\`json ... \`\`\`) atau teks pengantar lainnya.
- Pilihan ganda harus berjumlah tepat 4 opsi.
- Jawaban benar ditunjukkan dengan 'answer' yang merupakan indeks angka (integer) dari 0 sampai 3.
- Berikan penjelasan langkah solusi matematika singkat dan mendidik di bidang 'explanation'.
- Teks soal tidak boleh terlalu panjang agar muat di HUD game.

Format JSON Output:
{
  "question": "Teks pertanyaan soal...",
  "options": ["Jawaban A", "Jawaban B", "Jawaban C", "Jawaban D"],
  "answer": 0,
  "explanation": "Langkah pengerjaan..."
}`;

  const callOllama = async (modelName) => {
    const ollamaUrl = "http://localhost:11434/api/chat";
    const body = {
      model: modelName || process.env.OLLAMA_MODEL || "llama3",
      messages: [{ role: "user", content: prompt }],
      stream: false,
      format: "json"
    };
    
    const ollamaRes = await fetch(ollamaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    
    if (!ollamaRes.ok) throw new Error("Gagal memanggil Ollama lokal.");
    const data = await ollamaRes.json();
    return data.message.content;
  };

  const callGemini = async () => {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiKey}`;
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };
    
    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    
    if (!geminiRes.ok) {
      const errData = await geminiRes.json().catch(() => ({}));
      const msg = errData.error?.message || "Gagal memanggil Gemini API.";
      throw new Error(msg);
    }
    const data = await geminiRes.json();
    return data.candidates[0].content.parts[0].text;
  };

  try {
    let aiTextResult = "";
    const isGeminiAvailable = geminiKey && geminiKey !== "MASUKKAN_KEY_GEMINI_ANDA_DISINI";
    
    if (isGeminiAvailable) {
      try {
        aiTextResult = await callGemini();
      } catch (geminiErr) {
        console.warn(`Gemini API error, falling back to Ollama (${fallbackModel || 'default'}):`, geminiErr.message);
        aiTextResult = await callOllama(fallbackModel);
      }
    } else {
      aiTextResult = await callOllama(fallbackModel);
    }

    let cleanJsonText = aiTextResult.trim();
    if (cleanJsonText.startsWith("```json")) {
      cleanJsonText = cleanJsonText.substring(7);
    } else if (cleanJsonText.startsWith("```")) {
      cleanJsonText = cleanJsonText.substring(3);
    }
    if (cleanJsonText.endsWith("```")) {
      cleanJsonText = cleanJsonText.substring(0, cleanJsonText.length - 3);
    }
    cleanJsonText = cleanJsonText.trim();

    const parsedQuestion = JSON.parse(cleanJsonText);
    
    if (!parsedQuestion.question || !Array.isArray(parsedQuestion.options) || parsedQuestion.options.length < 2) {
      throw new Error("Format output AI tidak lengkap.");
    }

    res.json({
      success: true,
      question: parsedQuestion.question,
      options: parsedQuestion.options,
      answer: parsedQuestion.answer,
      explanation: parsedQuestion.explanation
    });

  } catch (err) {
    console.error("AI Generation Error:", err.message);
    
    let suggestion = "Pastikan Anda telah mendaftarkan GEMINI_API_KEY gratis Anda di dalam berkas .env.";
    if (!geminiKey || geminiKey === "MASUKKAN_KEY_GEMINI_ANDA_DISINI") {
      suggestion += ` Alternatifnya, jalankan server Ollama lokal di port 11434 (model ${fallbackModel || 'llama3'}).`;
    } else {
      suggestion = `Terjadi kesalahan saat memanggil AI: ${err.message}`;
    }
    
    res.status(500).json({ 
      error: "Gagal men-generate soal menggunakan AI.", 
      details: err.message,
      suggestion: suggestion
    });
  }
});


// ==================== WEBSOCKET MULTIPLAYER ROOMS (CO-OP) ====================

const activeRooms = {}; // Format: { roomId: { id, players: [], boss: {}, status: 'waiting' } }

wss.on('connection', (ws) => {
  let userContext = { username: null, roomId: null };

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      const db = readDB();

      switch (data.type) {
        case 'join': {
          const { username, roomId, gender, charClass } = data;
          userContext.username = username;
          userContext.roomId = roomId;

          if (!activeRooms[roomId]) {
            // Inisialisasi Boss Room Khusus Matematika Co-Op
            activeRooms[roomId] = {
              id: roomId,
              players: [],
              boss: {
                name: "Fraction Emperor",
                maxHp: 500,
                hp: 500,
                currentQuestion: null,
                timer: 20,
                statusEffect: "none"
              },
              status: 'waiting',
              questionPool: db.questions.filter(q => q.difficulty === 'hard') // Pilih soal level Hard untuk coop
            };
          }

          const room = activeRooms[roomId];
          
          if (room.status === 'fighting') {
            ws.send(JSON.stringify({ type: 'error', message: 'Pertarungan di room ini sudah dimulai!' }));
            break;
          }

          if (room.players.length >= 3) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room penuh! Maksimal 3 pemain.' }));
            break;
          }

          // Tambahkan pemain
          const playerStats = db.users.find(u => u.username.toLowerCase() === username.toLowerCase())?.stats || { level: 1, maxHp: 100 };
          
          const newPlayer = {
            username,
            gender,
            charClass,
            level: playerStats.level,
            maxHp: playerStats.maxHp,
            hp: playerStats.maxHp,
            damageDealt: 0,
            ws
          };

          room.players.push(newPlayer);
          
          // Broadcast daftar pemain ke room
          broadcastToRoom(roomId, {
            type: 'room_update',
            players: room.players.map(p => ({
              username: p.username,
              gender: p.gender,
              charClass: p.charClass,
              level: p.level,
              maxHp: p.maxHp,
              hp: p.hp,
              damageDealt: p.damageDealt
            })),
            status: room.status
          });
          break;
        }

        case 'start': {
          const { roomId } = data;
          const room = activeRooms[roomId];
          if (!room || room.status !== 'waiting') break;

          room.status = 'fighting';
          sendNextBossQuestion(roomId);
          break;
        }

        case 'answer': {
          const { roomId, username, questionId, selectedOption, timeElapsed } = data;
          const room = activeRooms[roomId];
          if (!room || room.status !== 'fighting') break;

          const player = room.players.find(p => p.username === username);
          const question = room.questionPool.find(q => q.id === questionId);

          if (!player || player.hp <= 0 || !question) break;

          const isCorrect = question.answer === parseInt(selectedOption);
          
          if (isCorrect) {
            // Hitung damage multiplier berdasarkan Job Class
            let jobMultiplier = 1.0;
            if (player.charClass === 'Warrior') jobMultiplier = 1.3; // Warrior memberikan damage fisik 30% lebih besar
            if (player.charClass === 'Mage') jobMultiplier = 1.1; // Mage memberikan damage sihir 10% lebih besar
            
            const speedFactor = Math.max(0.2, (question.timeLimit - timeElapsed) / question.timeLimit);
            const finalDamage = Math.round(50 * speedFactor * jobMultiplier);

            room.boss.hp = Math.max(0, room.boss.hp - finalDamage);
            player.damageDealt += finalDamage;

            broadcastToRoom(roomId, {
              type: 'battle_event',
              message: `${player.username} (${player.charClass}) menjawab BENAR dan memberikan ${finalDamage} damage ke Boss!`,
              bossHp: room.boss.hp,
              players: room.players.map(p => ({
                username: p.username,
                hp: p.hp,
                maxHp: p.maxHp,
                damageDealt: p.damageDealt
              }))
            });

            // Cek jika HP Boss < 20% untuk memicu BGM tempo cepat
            if (room.boss.hp > 0 && room.boss.hp <= room.boss.maxHp * 0.2) {
              broadcastToRoom(roomId, { type: 'music_tempo_alert', fast: true });
            }

            // Cek Victory
            if (room.boss.hp <= 0) {
              room.status = 'finished';
              
              // Cari MVP (Pemain dengan damage terbesar)
              let mvp = room.players[0];
              room.players.forEach(p => {
                if (p.damageDealt > mvp.damageDealt) mvp = p;
              });

              // Hadiahi Gelar Langka & Emas untuk semua pemain
              room.players.forEach(p => {
                const dbUser = db.users.find(u => u.username.toLowerCase() === p.username.toLowerCase());
                if (dbUser) {
                  dbUser.stats.gold += 50;
                  if (p.username === mvp.username) {
                    dbUser.stats.gold += 30; // Bonus Emas MVP
                    if (!dbUser.stats.titles.includes("Co-Op MVP")) {
                      dbUser.stats.titles.push("Co-Op MVP");
                      dbUser.stats.activeTitle = "Co-Op MVP";
                    }
                  }
                  if (!dbUser.stats.titles.includes("Giant Slayer")) {
                    dbUser.stats.titles.push("Giant Slayer");
                  }
                }
              });
              writeDB(db);

              broadcastToRoom(roomId, {
                type: 'victory',
                message: `Kemenangan! Boss berhasil dikalahkan bersama. Semua pemain mendapatkan 50 Gold!`,
                mvp: mvp.username,
                mvpReward: `Gelar "Co-Op MVP" dan tambahan +30 Gold diberikan kepada MVP: ${mvp.username}!`
              });
              delete activeRooms[roomId];
              break;
            }
          } else {
            // Jawaban salah: Boss menyerang balik
            // Jika Cleric menjawab, damage boss ke tim berkurang
            const bossDamage = player.charClass === 'Cleric' ? 15 : 25;
            player.hp = Math.max(0, player.hp - bossDamage);

            broadcastToRoom(roomId, {
              type: 'battle_event',
              message: `${player.username} menjawab SALAH! Boss menyerang balik dan memberikan ${bossDamage} damage ke ${player.username}.`,
              bossHp: room.boss.hp,
              players: room.players.map(p => ({
                username: p.username,
                hp: p.hp,
                maxHp: p.maxHp,
                damageDealt: p.damageDealt
              }))
            });

            // Cek apakah seluruh pemain KO
            const allKO = room.players.every(p => p.hp <= 0);
            if (allKO) {
              room.status = 'finished';
              broadcastToRoom(roomId, {
                type: 'defeat',
                message: "Semua anggota tim gugur! Boss mengalahkan kalian. Silakan kembali ke Kota untuk berlatih."
              });
              delete activeRooms[roomId];
              break;
            }
          }

          // Kirim soal berikutnya
          sendNextBossQuestion(roomId);
          break;
        }

        case 'chat': {
          const { roomId, username, text } = data;
          broadcastToRoom(roomId, {
            type: 'chat_msg',
            username,
            text
          });
          break;
        }
      }
    } catch (e) {
      console.error("Gagal memproses WS message:", e);
    }
  });

  ws.on('close', () => {
    const { username, roomId } = userContext;
    if (roomId && activeRooms[roomId]) {
      const room = activeRooms[roomId];
      room.players = room.players.filter(p => p.username !== username);

      if (room.players.length === 0) {
        delete activeRooms[roomId];
      } else {
        broadcastToRoom(roomId, {
          type: 'battle_event',
          message: `${username} keluar dari ruang pertarungan.`,
          players: room.players.map(p => ({
            username: p.username,
            hp: p.hp,
            maxHp: p.maxHp,
            damageDealt: p.damageDealt
          }))
        });
      }
    }
  });
});

// Helper: Mengirim Soal Boss Berikutnya ke Room
function sendNextBossQuestion(roomId) {
  const room = activeRooms[roomId];
  if (!room || room.status !== 'fighting') return;

  const randIdx = Math.floor(Math.random() * room.questionPool.length);
  const rawQuestion = room.questionPool[randIdx];

  // Acak efek status yang dipasang pada soal ini (Poison, Blind, Silence)
  const statusEffects = ["none", "poison", "blind", "silence"];
  const randomEffect = statusEffects[Math.floor(Math.random() * statusEffects.length)];

  room.boss.currentQuestion = {
    id: rawQuestion.id,
    question: rawQuestion.question,
    options: rawQuestion.options,
    timeLimit: rawQuestion.timeLimit,
    typeEffect: randomEffect
  };

  broadcastToRoom(roomId, {
    type: 'boss_question',
    bossQuestion: room.boss.currentQuestion,
    bossHp: room.boss.hp
  });
}

// Helper: Broadcast pesan ke seluruh anggota room
function broadcastToRoom(roomId, payload) {
  const room = activeRooms[roomId];
  if (!room) return;

  room.players.forEach(p => {
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(JSON.stringify(payload));
    }
  });
}


// Start Server HTTP + Websocket
server.listen(PORT, () => {
  console.log(`[SERVER RUNNING] http://localhost:${PORT}`);
});
