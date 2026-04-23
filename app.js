// =============================================================
// 1. CONFIGURATION & GLOBAL STATE (ค่าตั้งต้นและตัวแปรหลัก)
// =============================================================
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzphLcVJIW04H-cvo2PYssfsvDbzepLnFO-tgVY5h5qFQwGYPT1vwizuX20CW3JHDNM1A/exec';

let allTeamsData = {};            // เก็บข้อมูลทีมทั้งหมดที่ Sync มาจาก Sheets
let currentActiveId = "VIEW_ALL"; // ID ทีมที่กำลังเลือก (ถ้าเป็น VIEW_ALL คือหน้า Leaderboard)
let currentEventName = "";        // ชื่อกิจกรรม (เช่น Drone Racing)
let currentSheetName = "";        // ชื่อ Sheet ที่ใช้ดึงข้อมูล (Data Sheet)
let currentClass = "";            // รุ่นการแข่งขัน (20 หรือ 40)
let timerInterval = null;         // ตัวแปรจับเวลา
let msElapsed = 0;                // เวลาที่ผ่านไป (มิลลิวินาที)
const MAX_TIME_MS = 180000;       // จำกัดเวลาที่ 3 นาที
let soccerScore = { red: 0, blue: 0 }; // คะแนน (สำหรับ Soccer/Futsal)

// =============================================================
// 2. INITIALIZATION & URL HANDLING (การตั้งค่าเริ่มต้นจาก URL)
// =============================================================
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    currentEventName = params.get('event') || "Unknown Event";
    currentSheetName = params.get('sheet') || "";
    currentClass = params.get('class') || ""; // ดึงค่าเลข 20 หรือ 40 จากลิงก์หน้าแรก
    
    const badge = document.getElementById('statusBadge');
    if (badge) {
        badge.innerText = `LIVE: ${currentEventName} ${currentClass ? 'Class ' + currentClass : ''}`;
    }
}

// =============================================================
// 3. DATABASE SYNC (ดึงรายชื่อทีมจาก Google Sheets)
// =============================================================
async function syncWithDatabase() {
    if (!currentSheetName) return;

    const display = document.getElementById('displayTeamName');
    const group = document.getElementById('teamGroup');
    const syncBtn = document.querySelector('button[onclick="syncWithDatabase()"]');
    
    const redSelect = document.getElementById('redTeamSelect');
    const blueSelect = document.getElementById('blueTeamSelect');
    
    if(syncBtn) syncBtn.innerHTML = '<span class="sync-icon-spin">🔄</span> Syncing...';
    if(display) display.innerText = "CONNECTING...";

    try {
        const response = await fetch(`${SCRIPT_URL}?sheetName=${encodeURIComponent(currentSheetName)}`);
        const teams = await response.json(); 

        if (teams.error) {
            if(display) display.innerText = "SHEET NOT FOUND";
            return;
        }

        allTeamsData = {}; 
        if(group) group.innerHTML = ''; 
        if(redSelect) redSelect.innerHTML = '<option value="">เลือกทีมแข่งขัน</option>'; 
        if(blueSelect) blueSelect.innerHTML = '<option value="">เลือกทีมแข่งขัน</option>'; 

        teams.forEach(team => {
            // แปลงข้อมูล Laps จาก String หรือ Array ดิบ ให้เป็น Object Format ที่ระบบต้องการ
            let processedLaps = [];
            if (team.laps) {
                if (typeof team.laps === 'string' && team.laps.trim() !== "") {
                    processedLaps = team.laps.split(',').map((t, idx) => ({
                        roundNum: idx + 1,
                        timeStr: t.trim()
                    }));
                } else if (Array.isArray(team.laps)) {
                    processedLaps = team.laps.map((l, idx) => 
                        typeof l === 'object' ? l : { roundNum: idx + 1, timeStr: String(l) }
                    );
                }
            }
            team.laps = processedLaps;
            allTeamsData[team.id] = team;
            const finalTeamName = (team.name && team.name !== "-" && team.name !== "") ? team.name : team.members;

            if(group) {
                const opt = document.createElement('option');
                opt.value = team.id;
                opt.textContent = `[${team.id}] ${finalTeamName}`;
                group.appendChild(opt);
            }

            [redSelect, blueSelect].forEach(select => {
                if(select) {
                    const opt = document.createElement('option');
                    opt.value = team.id;
                    opt.textContent = `[${team.id}] ${finalTeamName}`;
                    select.appendChild(opt);
                }
            });
        });

        if(syncBtn) syncBtn.innerHTML = '🔄 Sync Data';
        
        if(display) {
            if (currentActiveId === "VIEW_ALL") {
                display.innerText = "LEADERBOARD";
            } else {
                const t = allTeamsData[currentActiveId];
                const tName = (t.name && t.name !== "-" && t.name !== "") ? t.name : t.members;
                display.innerHTML = `<div>${t.id}</div><div style="font-size: 0.5em; opacity: 0.7;">${tName}</div>`;
            }
        }
        
        switchTab(currentActiveId); 
    } catch (e) { 
        if(display) display.innerText = "OFFLINE / ERROR";
        console.error(e);
    }
}

// =============================================================
// 4. UI TABS & NAVIGATION (การสลับหน้าจอแสดงผล)
// =============================================================
function switchTab(val) {
    currentActiveId = val;
    const tbody = document.getElementById('scoreBody');
    const displayTitle = document.getElementById('displayTeamName');
    const displayRound = document.getElementById('displayRound');

    if (!tbody) return;

    if (val === "VIEW_ALL") {
        if(displayTitle) displayTitle.innerText = "LEADERBOARD";
        if(displayRound) displayRound.innerText = "LIVE STATS";
        renderLeaderboard();
    } else {
        const team = allTeamsData[val];
        if(!team) return;
        
        if(displayTitle) {
            const finalName = (team.name && team.name !== "-" && team.name !== "") ? team.name : team.members;
            displayTitle.innerHTML = `
                <div class="line-1">${team.id}</div>
                <div class="line-2" style="font-size: 0.4em; opacity: 0.6; margin-top: -5px; text-transform: none;">${finalName}</div>
            `;
        }
        
        if(displayRound) displayRound.innerText = `ROUNDS: ${team.laps.length}/2`;
        renderSingleTeam(team);
    }
}

// =============================================================
// 5. RENDER FUNCTIONS (การแสดงผลตารางข้อมูล)
// =============================================================

// แสดงตารางอันดับรวม (Leaderboard)
function renderLeaderboard() {
    const tbody = document.getElementById('scoreBody');
    if(!tbody) return;
    
    let list = Object.keys(allTeamsData)
        .map(id => {
            const team = allTeamsData[id];
            // กรองเอาเฉพาะรอบที่มีเวลาที่ถูกต้อง (น้อยกว่า 9999999)
            const validLaps = (team.laps || []).filter(l => timeToMs(l.timeStr) < 9999999);
            if (validLaps.length === 0) return null;

            // หารอบที่ทำเวลาได้ดีที่สุดจากรอบที่ถูกต้อง
            let bestLap = validLaps.reduce((prev, curr) => 
                timeToMs(curr.timeStr) < timeToMs(prev.timeStr) ? curr : prev
            );
            const finalTeamName = (team.name && team.name !== "-" && team.name !== "") ? team.name : team.members;
            return { 
                id: id, 
                name: finalTeamName, 
                bestTime: bestLap.timeStr, 
                ms: timeToMs(bestLap.timeStr)
            };
        })
        .filter(item => item !== null) // แสดงเฉพาะทีมที่มีผลการแข่งขันที่สมบูรณ์
        .sort((a, b) => a.ms - b.ms); 

    tbody.innerHTML = list.map((item, i) => {
        const rankClass = i === 0 ? 'rank-1st' : i === 1 ? 'rank-2nd' : i === 2 ? 'rank-3rd' : '';
        const rowClass = i === 0 ? 'winner-row' : i === 1 ? 'rank-2nd-row' : i === 2 ? 'rank-3rd-row' : '';
        
        let rankDisplay = i + 1;
        if (i === 0) rankDisplay = `1<span class="text-2xl align-top ml-0.5">st</span>`;
        else if (i === 1) rankDisplay = `2<span class="text-2xl align-top ml-0.5">nd</span>`;
        else if (i === 2) rankDisplay = `3<span class="text-2xl align-top ml-0.5">rd</span>`;

        return `
        <tr class="border-b border-white/5 hover:bg-white/5 transition-all ${rowClass}">
            <td class="p-6 race-font font-black italic text-6xl ${rankClass} ${i >= 3 ? 'opacity-40' : ''}">
                ${rankDisplay}
            </td>
            <td class="p-6">
                <div class="text-3xl font-black uppercase italic">${item.id}</div>
                <div class="text-lg font-bold opacity-70">${item.name}</div>
            </td>
            <td class="p-6 digital-font text-5xl text-right font-black ${i === 0 ? 'text-yellow-400' : 'text-red-500'}">
                ${item.bestTime}
            </td>
        </tr>`;
    }).join('') || `<tr><td class="p-20 text-center opacity-20 italic">WAITING FOR RECORDS...</td></tr>`;
}

// แสดงผลคะแนนรายทีมที่เลือก
function renderSingleTeam(team) {
    const tbody = document.getElementById('scoreBody');
    if(!tbody) return;

    let minMs = 9999999;
    let bestLapIndex = -1;

    // หาตำแหน่ง (Index) ของรอบที่เวลาดีที่สุดรอบแรกเพียงอันเดียว
    if (team.laps && team.laps.length > 0) {
        team.laps.forEach((l, idx) => {
            const currentMs = timeToMs(l.timeStr);
            if (currentMs < minMs) {
                minMs = currentMs;
                bestLapIndex = idx;
            }
        });
    }

    tbody.innerHTML = team.laps.map((l, idx) => {
        const isBest = idx === bestLapIndex && minMs < 9999999;

        return `
        <tr class="border-b border-white/5 transition-all ${isBest ? 'best-round-row' : ''}">
            <td class="p-10 race-font font-black italic text-5xl">
                ROUND ${l.roundNum}
                ${isBest ? '<span class="ml-4 text-sm bg-green-600 text-white px-3 py-1 not-italic rounded-md shadow-lg shadow-green-900/20">THE BEST</span>' : ''}
            </td>
            <td class="p-10 digital-font text-8xl text-right font-black ${isBest ? 'text-green-500' : 'text-red-500'}">
                ${l.timeStr}
            </td>
        </tr>`;
    }).join('') || `<tr><td class="p-20 text-center opacity-20 italic">No record found</td></tr>`;
}

// =============================================================
// 6. SAVE DATA (บันทึกข้อมูลลง Database)
// =============================================================
async function addLap() {
    const id = document.getElementById('teamId').value;
    if (!id || id === "VIEW_ALL") return alert("กรุณาเลือกนักแข่งก่อน!");

    const teamInfo = allTeamsData[id];
    const m = document.getElementById('inMin').value || 0;
    const s = document.getElementById('inSec').value || 0;
    const ms = document.getElementById('inMs').value || 0;
    
    const timeStr = `${m}:${s.toString().padStart(2,'0')}:${ms.toString().padStart(3,'0')}`;
    
    if (teamInfo.laps.length >= 2) return alert("แข่งครบ 2 รอบแล้ว!");

    const finalNameForSave = (teamInfo.name && teamInfo.name !== "-" && teamInfo.name !== "") ? teamInfo.name : teamInfo.members;
    const fullCategory = `${currentEventName} ${currentClass ? 'Class ' + currentClass : ''}`.trim();

    // ตรวจสอบชื่อชีตเป้าหมายสำหรับบันทึกคะแนน (เพื่อให้ตรงกับ handleGetData ใน Apps Script)
    let targetScoreSheet = "Scores";
    if (currentEventName.toLowerCase().includes("soccer")) targetScoreSheet = "Scores Soccer";
    else if (currentEventName.toLowerCase().includes("futsal")) targetScoreSheet = "Scores Futsal";

    // สร้างข้อมูลสำหรับบันทึก
    const lapData = { 
        action: "saveRacing", 
        id: id, 
        personalId: teamInfo.personalId,
        members: teamInfo.members, 
        name: finalNameForSave, 
        round: teamInfo.laps.length + 1, 
        time: timeStr, 
        category: fullCategory,
        sheetName: targetScoreSheet, // ส่งไปที่ชีต Scores เสมอตามเงื่อนไข
        sourceSheet: currentSheetName  // ส่งชื่อชีตรายชื่อไปด้วยเพื่อให้ Apps Script ใช้ระบุแหล่งที่มา
    };
    console.log("Sending lap data to server:", lapData);

    const btn = document.getElementById('addBtn');
    btn.innerText = "SAVING..."; 
    btn.disabled = true;
    
    try {
        await fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(lapData) });
       teamInfo.laps.push({ 
    roundNum: lapData.round, 
    timeStr: lapData.time 
});
        switchTab(id);
        
        document.getElementById('inMin').value = '';
        document.getElementById('inSec').value = '';
        document.getElementById('inMs').value = '';
        btn.innerText = "SAVE RECORD"; btn.disabled = false;
    } catch (e) { 
        alert("ส่งข้อมูลไม่สำเร็จ"); 
        btn.innerText = "SAVE RECORD"; btn.disabled = false;
    }
}

// =============================================================
// 7. HELPER FUNCTIONS (ฟังก์ชันเสริมอื่นๆ)
// =============================================================

// แปลงข้อความเวลา 0:00:000 เป็นตัวเลขมิลลิวินาที
function timeToMs(str) {
    if (!str || str === "-") return 9999999;
    
    // มาตรฐานข้อมูล: ล้างช่องว่าง, ล้าง single quote, และแปลงจุด (.) ให้เป็น (:) เพื่อรองรับ format จาก Sheets
    let s = String(str).replace(/'/g, "").replace(/\s/g, "").replace(/\./g, ":").trim();
    
    if (s.includes('T') || s === "-" || s === "") return 9999999;

    try { 
        const p = s.split(':').filter(v => v !== ""); 
        if (p.length === 3) {
            // รูปแบบ M:S:ms
            return (parseInt(p[0]) * 60000) + (parseInt(p[1]) * 1000) + parseInt(p[2]);
        } else if (p.length === 2) {
            // รูปแบบ S:ms
            return (parseInt(p[0]) * 1000) + parseInt(p[1]);
        }
        return 9999999; 
    } catch { return 9999999; } 
}

// =============================================================
// 8. TIMER & SCORE SYSTEM (ระบบเวลาและคะแนน)
// =============================================================
function updateTimerUI() {
    const mins = Math.floor(msElapsed / 60000);
    const secs = Math.floor((msElapsed % 60000) / 1000);
    const ms = Math.floor(msElapsed % 1000);
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(3, '0')}`;
    const display = document.getElementById('timerDisplay') || document.getElementById('soccerTimer');
    if (display) display.innerText = timeStr;
}

function startTimer() {
    if (timerInterval) return; 
    const startTime = Date.now() - msElapsed;
    timerInterval = setInterval(() => {
        msElapsed = Date.now() - startTime;
        if (msElapsed >= MAX_TIME_MS) {
            msElapsed = MAX_TIME_MS;
            updateTimerUI();
            stopTimer();
            alert("⚠️ หมดเวลา!");
        } else {
            updateTimerUI();
        }
    }, 10);
}

function stopTimer() { clearInterval(timerInterval); timerInterval = null; }
function resetTimer() { stopTimer(); msElapsed = 0; updateTimerUI(); }

// Score System
function changeScore(team, val) {
    if (team === 'red') {
        soccerScore.red = Math.max(0, soccerScore.red + val);
        document.getElementById('scoreRed').innerText = soccerScore.red;
    } else {
        soccerScore.blue = Math.max(0, soccerScore.blue + val);
        document.getElementById('scoreBlue').innerText = soccerScore.blue;
    }
}

function resetSoccer() {
    if (!confirm("รีเซ็ตทั้งหมด?")) return;
    resetTimer();
    soccerScore = { red: 0, blue: 0 };
    document.getElementById('scoreRed').innerText = "0";
    document.getElementById('scoreBlue').innerText = "0";
}

// =============================================================
// 9. THEME & EVENT LISTENERS
// =============================================================
function toggleTheme() {
    document.body.classList.toggle('light-mode');
    localStorage.setItem('theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
}

window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('theme') === 'light') document.body.classList.add('light-mode');
    getUrlParams();
    syncWithDatabase();

    const inputs = ['inMin', 'inSec', 'inMs'];
    const limits = [1, 2, 3];
    inputs.forEach((id, idx) => {
        const el = document.getElementById(id);
        if(!el) return;
        el.addEventListener('input', () => {
            if (el.value.length > limits[idx]) el.value = el.value.slice(0, limits[idx]);
            if (el.value.length === limits[idx] && inputs[idx+1]) document.getElementById(inputs[idx+1]).focus();
        });
    });
});
