// Landing page navbar button handlers

document.addEventListener('DOMContentLoaded', () => {
    console.log('[Landing Page] DOMContentLoaded fired');
    
    // Home button - reload landing page
    const homeBtn = document.getElementById('home-btn');
    console.log('[Landing Page] homeBtn:', homeBtn);
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            console.log('[Landing Page] Home button clicked');
            window.location.href = 'index.html';
        });
    }

    // Leaderboard button - navigate to app page and show leaderboard section
    const leaderboardBtn = document.getElementById('leaderboard-nav-btn');
    console.log('[Landing Page] leaderboardBtn:', leaderboardBtn);
    if (leaderboardBtn) {
        leaderboardBtn.addEventListener('click', async () => {
            console.log('[Landing Page] Leaderboard button clicked - checking Clerk login');
            if (window.Clerk) {
                await window.Clerk.load();
                const user = window.Clerk.user;
                if (!user || !user.id) {
                    console.log('[Landing Page] User not logged in - redirecting to login page');
                    window.location.href = 'auth.html';
                    return;
                }
                console.log('[Landing Page] User logged in - navigating to app.html#leaderboard');
                window.location.href = 'app.html#leaderboard';
            } else {
                console.error('[Landing Page] Clerk not loaded - redirecting to login page');
                window.location.href = 'auth.html';
            }
        });
    }

    // Rules button - show rules modal
    const rulesBtn = document.getElementById('rules-btn');
    console.log('[Landing Page] rulesBtn:', rulesBtn);
    if (rulesBtn) {
        rulesBtn.addEventListener('click', () => {
            console.log('[Landing Page] Rules button clicked');
            showRulesModal();
        });
    }
});

function showRulesModal() {
    // Create modal overlay if it doesn't exist
    let modalOverlay = document.getElementById('modal-overlay');
    if (!modalOverlay) {
        modalOverlay = document.createElement('div');
        modalOverlay.id = 'modal-overlay';
        modalOverlay.className = 'modal-overlay';
        modalOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
        `;

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 30px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        `;

        modal.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0; color: #01164D;">How to Play</h2>
                <button id="modal-close-btn" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #01164D;">&times;</button>
            </div>
            <div style="color: #333; line-height: 1.8; font-size: 16px;">
                <p><strong>1️⃣ Enter your name</strong> to get started.</p>
                <p><strong>2️⃣ Choose a game mode</strong> — Couple or Friend.</p>
                <p><strong>3️⃣ Create or join a room</strong> with a unique code.</p>
                <p><strong>4️⃣ Answer 5 random questions</strong> along with your friends.</p>
                <p><strong>5️⃣ Earn points for matches</strong> — highest score wins!</p>
                <p style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666;">
                    The largest group of players with the same answer gets points. Share with friends and see who knows you best!
                </p>
            </div>
        `;

        modalOverlay.appendChild(modal);
        document.body.appendChild(modalOverlay);

        // Attach close button handler
        const closeBtn = modal.querySelector('#modal-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => modalOverlay.remove());
        }

        // Close modal on overlay click
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
            }
        });
    } else {
        modalOverlay.style.display = 'flex';
    }
}
