// ฟังก์ชันสลับธีมเมื่อกดปุ่ม
function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    updateThemeButton(isLight);
}

// อัปเดตข้อความและไอคอนบนปุ่ม
function updateThemeButton(isLight) {
    const btn = document.getElementById('themeToggleBtn');
    if (isLight) {
        btn.innerHTML = '🌓 Switch Mode';
    } else {
        btn.innerHTML = '🌓 Switch Mode';
    }
}

// เมื่อโหลดหน้าเว็บ ให้เช็คว่าเคยตั้งธีมอะไรไว้
window.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        updateThemeButton(true);
    } else {
        updateThemeButton(false);
    }
});