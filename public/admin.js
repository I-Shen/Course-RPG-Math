let currentUser = null;
let allQuestions = [];

window.onload = () => {
  currentUser = JSON.parse(localStorage.getItem('currentUser'));
  if (!currentUser || currentUser.role !== 'teacher') {
    window.location.href = 'login.html';
    return;
  }

  // Ambil data murid dan soal
  fetchStudentsList();
  fetchQuestionsList();

  // Inisialisasi audio
  document.body.addEventListener('click', () => {
    window.audioEngine.init();
  }, { once: true });

  // Event handler tambah murid
  document.getElementById('add-student-form').addEventListener('submit', registerStudent);
  // Event handler simpan soal (Tambah/Edit)
  document.getElementById('question-form').addEventListener('submit', saveQuestion);
};

// ==================== MONITORING SISWA ====================

async function fetchStudentsList() {
  try {
    const res = await fetch('/api/admin/students');
    const students = await res.json();
    if (!res.ok) throw new Error("Gagal memuat daftar siswa.");

    const container = document.getElementById('students-list-container');
    container.innerHTML = '';

    if (students.length === 0) {
      container.innerHTML = '<p style="font-size: 7px; color: var(--text-gray);">Belum ada siswa terdaftar.</p>';
      return;
    }

    students.forEach(s => {
      const row = document.createElement('div');
      row.className = 'student-row';
      row.innerHTML = `
        <div>
          <span style="color: var(--text-yellow);">🛡️ ${s.username}</span><br>
          <span style="color: var(--text-gray); font-size: 6px;">
            LV: ${s.stats.level} | HP: ${s.stats.hp}/${s.stats.maxHp} | Gold: ${s.stats.gold}
          </span>
        </div>
        <div style="text-align: right;">
          <span style="color: #ff8800; font-size: 6px;">Streak: ${s.stats.dailyStreak} 🔥</span><br>
          <span style="font-size: 5px; color: var(--text-gray);">Login: ${s.stats.lastLoginDate}</span>
        </div>
      `;
      container.appendChild(row);
    });
  } catch (err) {
    console.error(err.message);
  }
}

async function registerStudent(e) {
  e.preventDefault();
  window.audioEngine.playBeep();

  const nameInput = document.getElementById('new-student-name');
  const passInput = document.getElementById('new-student-pass');

  const username = nameInput.value.trim();
  const password = passInput.value.trim();

  try {
    const res = await fetch('/api/admin/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    window.audioEngine.playLevelUp(); // play sound koin/sukses
    alert(data.message);
    
    nameInput.value = '';
    passInput.value = '';

    // Refresh daftar murid
    fetchStudentsList();
  } catch (err) {
    alert(err.message);
    window.audioEngine.playHurt();
  }
}

// ==================== CRUD BANK SOAL ====================

async function fetchQuestionsList() {
  try {
    const res = await fetch('/api/admin/questions');
    allQuestions = await res.json();
    if (!res.ok) throw new Error("Gagal mengambil daftar soal.");

    renderQuestions();
  } catch (err) {
    console.error(err.message);
  }
}

function renderQuestions() {
  const container = document.getElementById('questions-list-container');
  container.innerHTML = '';

  // Ambil nilai filter saat ini
  const chFilterEl = document.getElementById('filter-chapter');
  const effFilterEl = document.getElementById('filter-effect');
  const chapterFilter = chFilterEl ? chFilterEl.value : 'all';
  const effectFilter = effFilterEl ? effFilterEl.value : 'all';

  // Filter daftar soal
  const filteredQuestions = allQuestions.filter(q => {
    const matchChapter = (chapterFilter === 'all' || q.chapterId === chapterFilter);
    const matchEffect = (effectFilter === 'all' || (q.typeEffect || 'none') === effectFilter);
    return matchChapter && matchEffect;
  });

  if (filteredQuestions.length === 0) {
    container.innerHTML = '<p style="font-size: 7px; color: var(--text-gray);">Tidak ada soal yang cocok dengan filter.</p>';
    return;
  }

  // Dapatkan nama bab untuk label
  const chapterLabels = {
    ch1: "[SD] Bab 1: Operasi Dasar Bilangan",
    ch2: "[SD] Bab 2: Pecahan Sederhana",
    ch3: "[SMP] Bab 3: Persamaan Linear",
    ch4: "[SMP] Bab 4: Aritmatika Sosial",
    ch5: "[SMA] Bab 5: Trigonometri Dasar",
    ch6: "[SMA] Bab 6: Limit & Turunan",
    ch7: "[College] Bab 7: Matriks & OBE",
    ch8: "[College] Bab 8: PD Biasa"
  };

  filteredQuestions.forEach(q => {
    const div = document.createElement('div');
    div.className = 'jrpg-window';
    div.style.padding = '8px';
    div.style.background = 'rgba(0,0,0,0.6)';
    div.style.fontSize = '8px';
    div.style.display = 'flex';
    div.style.justifyContent = 'space-between';
    div.style.alignItems = 'center';

    div.innerHTML = `
      <div style="flex: 1; margin-right: 15px;">
        <span style="color: var(--text-yellow); font-size: 7px;">${chapterLabels[q.chapterId] || q.chapterId}</span><br>
        <span style="line-height: 1.4;">${q.question}</span><br>
        <span style="color: var(--text-green); font-size: 6px;">Jawab: Pilihan ${String.fromCharCode(65 + q.answer)} | Waktu: ${q.timeLimit}s | Efek: ${q.typeEffect}</span>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="jrpg-btn" onclick="editQuestion('${q.id}')" style="padding: 4px 6px; font-size: 6px;">EDIT</button>
        <button class="jrpg-btn" onclick="deleteQuestion('${q.id}')" style="padding: 4px 6px; font-size: 6px; border-color: var(--text-red);">HAPUS</button>
      </div>
    `;
    container.appendChild(div);
  });
}

function editQuestion(id) {
  window.audioEngine.playBeep();
  const q = allQuestions.find(item => item.id === id);
  if (!q) return;

  document.getElementById('edit-question-id').value = q.id;
  document.getElementById('q-text').value = q.question;
  document.getElementById('q-chapter').value = q.chapterId;
  document.getElementById('q-effect').value = q.typeEffect || 'none';
  document.getElementById('q-opt0').value = q.options[0] || '';
  document.getElementById('q-opt1').value = q.options[1] || '';
  document.getElementById('q-opt2').value = q.options[2] || '';
  document.getElementById('q-opt3').value = q.options[3] || '';
  document.getElementById('q-answer').value = q.answer;
  document.getElementById('q-limit').value = q.timeLimit;
  document.getElementById('q-explain').value = q.explanation || '';

  document.getElementById('save-btn').innerText = 'PERBARUI SOAL';
}

async function saveQuestion(e) {
  e.preventDefault();
  window.audioEngine.playBeep();

  const editId = document.getElementById('edit-question-id').value;
  const question = document.getElementById('q-text').value;
  const chapterId = document.getElementById('q-chapter').value;
  const typeEffect = document.getElementById('q-effect').value;
  const options = [
    document.getElementById('q-opt0').value.trim(),
    document.getElementById('q-opt1').value.trim(),
    document.getElementById('q-opt2').value.trim(),
    document.getElementById('q-opt3').value.trim()
  ].filter(opt => opt !== ''); // Saring isi kosong

  const answer = parseInt(document.getElementById('q-answer').value);
  const timeLimit = parseInt(document.getElementById('q-limit').value);
  const explanation = document.getElementById('q-explain').value.trim();

  // Tentukan tingkat pendidikan berdasarkan bab
  let difficulty = 'easy';
  if (chapterId === 'ch7' || chapterId === 'ch8') difficulty = 'hard';
  else if (chapterId === 'ch3' || chapterId === 'ch4' || chapterId === 'ch5' || chapterId === 'ch6') difficulty = 'medium';

  const questionData = {
    chapterId,
    question,
    options,
    answer,
    timeLimit,
    explanation,
    typeEffect,
    difficulty
  };

  try {
    let res, data;
    if (editId) {
      // Edit Mode
      res = await fetch(`/api/admin/questions/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(questionData)
      });
    } else {
      // Add Mode
      res = await fetch('/api/admin/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(questionData)
      });
    }

    data = await res.json();
    if (!res.ok) throw new Error(data.error);

    window.audioEngine.playLevelUp(); // play sound sukses
    alert(data.message);

    resetQuestionForm();
    fetchQuestionsList();
  } catch (err) {
    alert(err.message);
    window.audioEngine.playHurt();
  }
}

async function deleteQuestion(id) {
  window.audioEngine.playBeep();
  if (!confirm("Apakah Anda yakin ingin menghapus soal matematika ini?")) return;

  try {
    const res = await fetch(`/api/admin/questions/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    window.audioEngine.playSlash();
    alert(data.message);
    fetchQuestionsList();
  } catch (err) {
    alert(err.message);
  }
}

function resetQuestionForm() {
  window.audioEngine.playBeep();
  document.getElementById('edit-question-id').value = '';
  document.getElementById('question-form').reset();
  document.getElementById('save-btn').innerText = 'SIMPAN SOAL';
}

function logout() {
  localStorage.removeItem('currentUser');
  window.location.href = 'login.html';
}

function applyFilters() {
  renderQuestions();
}

async function generateQuestionWithAI() {
  window.audioEngine.playBeep();
  
  const chapterId = document.getElementById('q-chapter').value;
  const effect = document.getElementById('q-effect').value;
  const timeLimit = document.getElementById('q-limit').value;
  const fallbackModel = document.getElementById('q-ai-fallback').value;
  
  let level = "SD";
  if (chapterId === 'ch3' || chapterId === 'ch4') level = "SMP";
  else if (chapterId === 'ch5' || chapterId === 'q6' || chapterId === 'ch6') level = "SMA";
  else if (chapterId === 'ch7' || chapterId === 'ch8') level = "College";

  const difficulty = (chapterId === 'ch1' || chapterId === 'ch2') ? "easy" : 
                     (chapterId === 'ch3' || chapterId === 'ch4' || chapterId === 'ch5') ? "medium" : "hard";

  const btn = document.getElementById('ai-gen-btn');
  const originalText = btn.innerHTML;
  
  btn.disabled = true;
  btn.innerHTML = "🤖 GENERATING...";
  btn.style.opacity = "0.6";

  try {
    const res = await fetch('/api/admin/questions/generate-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterId, level, difficulty, fallbackModel })
    });
    
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error + (data.suggestion ? "\n\n" + data.suggestion : ""));
    }

    document.getElementById('edit-question-id').value = '';
    document.getElementById('q-text').value = data.question;
    document.getElementById('q-opt0').value = data.options[0] || '';
    document.getElementById('q-opt1').value = data.options[1] || '';
    document.getElementById('q-opt2').value = data.options[2] || '';
    document.getElementById('q-opt3').value = data.options[3] || '';
    document.getElementById('q-answer').value = data.answer;
    document.getElementById('q-limit').value = timeLimit;
    document.getElementById('q-explain').value = data.explanation || '';
    
    document.getElementById('save-btn').innerText = 'SIMPAN SOAL (PREVIEW AI)';
    
    if (window.audioEngine && typeof window.audioEngine.playCoin === 'function') {
      window.audioEngine.playCoin();
    } else {
      window.audioEngine.playBeep();
    }

  } catch (err) {
    alert(err.message);
    if (window.audioEngine && typeof window.audioEngine.playHurt === 'function') {
      window.audioEngine.playHurt();
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
    btn.style.opacity = "1.0";
  }
}
