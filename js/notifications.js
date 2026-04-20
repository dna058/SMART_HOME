import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
    doc, getDoc, onSnapshot, collection, query, orderBy, limit, addDoc, deleteDoc, serverTimestamp,
    where, updateDoc, getDocs
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// ======================================================
// 1. KHỞI TẠO GIAO DIỆN TỨC THÌ (CACHE-FIRST)
// ======================================================

const emailElTop = document.getElementById("userEmail");
const cachedNameTop = localStorage.getItem("cachedUsername");
if (emailElTop && cachedNameTop) emailElTop.innerText = `Chào, ${cachedNameTop}`;

const nameElTop = document.getElementById("displayHomeName");
const cachedHomeName = localStorage.getItem("activeHomeName");
if (nameElTop && cachedHomeName) nameElTop.innerText = cachedHomeName;

function renderNavbar(role) {
    const roleLink = document.getElementById("nav-role-action");
    const navNoti = document.getElementById("nav-notifications");
    if (!roleLink) return;

    if (role === "admin") {
        roleLink.href = "maintenance.html";
        roleLink.innerText = "Bảo trì & Sửa chữa";
    } else {
        roleLink.href = "profile.html";
        roleLink.innerText = "Hồ sơ cá nhân";
    }

    // Highlight active link
    const path = window.location.pathname;
    const allLinks = document.querySelectorAll('.menu a');
    allLinks.forEach(link => link.classList.remove('active'));

    if (path.includes("dashboard.html")) document.getElementById("nav-home")?.classList.add("active");
    if (path.includes("management.html")) document.getElementById("nav-devices")?.classList.add("active");
    if (path.includes("notifications.html")) navNoti?.classList.add("active");
    if (path.includes("profile.html") || path.includes("maintenance.html")) {
        roleLink.classList.add("active");
    }
}

// Chạy ngay lập tức khi load để không bị giật UI
const initRole = localStorage.getItem("userRole") || "user";
renderNavbar(initRole);

// Logout handler
document.getElementById("btnSignOut")?.addEventListener("click", () => {
    signOut(auth).then(() => {
        localStorage.clear();
        window.location.href = "login.html";
    });
});

// ======================================================
// 2. HỆ THỐNG THÔNG BÁO & CẢNH BÁO
// ======================================================

// Inject UI cảnh báo liên nhà
function injectCrossHomeAlertUI() {
    if (document.getElementById("crossHomeAlertBar")) return;
    const bar = document.createElement("div");
    bar.id = "crossHomeAlertBar";
    bar.style = `display:none; background:#e67e22; color:white; padding:12px 20px; text-align:center; font-weight:bold; position:sticky; top:0; z-index:9999; box-shadow:0 2px 10px rgba(0,0,0,0.2); animation:slideDown 0.4s ease-out;`;
    bar.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:center; gap:15px;">
            <span id="crossHomeAlertText">⚠️ Cảnh báo: Ngôi nhà khác có sự cố!</span>
            <button id="crossHomeAlertBtn" style="background:white; color:#e67e22; border:none; padding:5px 15px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">Vào kiểm tra ngay</button>
            <span onclick="this.parentElement.parentElement.style.display='none'" style="cursor:pointer; font-size:20px; margin-left:10px;">&times;</span>
        </div>
        <style> @keyframes slideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } } </style>
    `;
    document.body.prepend(bar);
}

function showCrossHomeAlert(homeId, homeName) {
    const bar = document.getElementById("crossHomeAlertBar");
    const text = document.getElementById("crossHomeAlertText");
    const btn = document.getElementById("crossHomeAlertBtn");
    if (bar && text && btn) {
        text.innerText = `⚠️ Cảnh báo: Ngôi nhà "${homeName}" đang có sự cố nghiêm trọng!`;
        btn.onclick = () => quickEnterHome(homeId, homeName);
        bar.style.display = "block";
        bar.style.background = "#d32f2f"; 
    }
}

async function quickEnterHome(homeId, homeName) {
    const password = prompt(`Nhập mật khẩu để vào nhanh "${homeName}":`);
    if (!password) return;
    try {
        const homeSnap = await getDoc(doc(db, "homes", homeId));
        if (!homeSnap.exists()) return alert("Nhà không tồn tại!");
        const homeData = homeSnap.data();
        if (String(homeData.homePassword) === String(password)) {
            localStorage.setItem("activeHomeId", homeId);
            localStorage.setItem("activeHomeName", homeName);
            alert(`Đang kết nối vào "${homeName}"...`);
            window.location.href = "dashboard.html";
        } else { alert("Sai mật khẩu!"); }
    } catch (e) { alert("Lỗi: " + e.message); }
}

// Log thông báo dùng chung
window.logNotification = async (homeId, action, details, category = "management", extraData = {}) => {
    try {
        if (!homeId || !auth.currentUser) return;
        const role = localStorage.getItem("userRole") || "user";
        const email = auth.currentUser.email;
        let homeName = "ngôi nhà này";
        const homeSnap = await getDoc(doc(db, "homes", homeId));
        if (homeSnap.exists()) homeName = homeSnap.data().homeName || "ngôi nhà này";

        let message = details;
        if (category !== "danger") {
            const roleName = role.toLowerCase() === "admin" ? "Admin" : "User";
            message = `Tài khoản (${roleName}) ${email} đã ${action}: ${details}`;
        }
        
        let title = "Quản lý hệ thống";
        if (category === "danger") title = `Phát hiện bất thường trong "${homeName}"`;
        if (category === "maintenance_request") title = `Yêu cầu sửa chữa tại "${homeName}"`;
        if (category === "maintenance_complete") title = `Đã hoàn tất sửa chữa tại "${homeName}"`;

        const notiData = {
            title, message, role, email, action, details, category, homeId, homeName,
            timestamp: new Date().toISOString(), ...extraData
        };

        await addDoc(collection(db, "homes", homeId, "notifications"), notiData);
        if (category !== "device_toggle") {
            await addDoc(collection(db, "notifications"), notiData).catch(()=>{});
        }
    } catch (e) { console.error("Lỗi logNotification:", e); }
};

// ======================================================
// 3. LOGIC AUTH & RENDER LIST (MAIN)
// ======================================================

onAuthStateChanged(auth, async (user) => {
    if (!user) return window.location.href = "login.html";

    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists()) return;

    const userData = userSnap.data();
    const userRole = (userData.role || "user").toLowerCase();
    localStorage.setItem("userRole", userRole);
    localStorage.setItem("cachedUsername", userData.username || user.email);
    if (emailElTop) emailElTop.innerText = `Chào, ${userData.username || user.email}`;
    renderNavbar(userRole);

    injectCrossHomeAlertUI();
    startBadgeListener(userRole, userData);

    // Render danh sách (nếu đang ở trang thông báo)
    const notiListEl = document.getElementById("notificationsList");
    if (notiListEl) renderNotificationsPage(userRole, userData, notiListEl);
});

async function renderNotificationsPage(userRole, userData, notiListEl) {
    let notificationsMap = new Map();
    let deviceStatusMap = {};
    const activeHomeId = localStorage.getItem("activeHomeId");

    // 1. Fetch trạng thái thiết bị để hồi tố cho nút "Đã sửa chữa"
    let homeIdsToFetch = activeHomeId ? [activeHomeId] : [...(userData.joinedHomeIds || [])];
    if (userData.ownedHomeId && !homeIdsToFetch.includes(userData.ownedHomeId)) homeIdsToFetch.push(userData.ownedHomeId);

    if (userRole === 'admin' && !activeHomeId) {
        const allHomes = await getDocs(collection(db, "homes"));
        allHomes.forEach(h => { if(!homeIdsToFetch.includes(h.id)) homeIdsToFetch.push(h.id); });
    }

    // 1. Tải trạng thái thiết bị của TẤT CẢ các nhà SONG SONG (Parallel Fetching)
    const statusPromises = homeIdsToFetch.map(async (hId) => {
        try {
            const devs = await getDocs(collection(db, "homes", hId, "devices"));
            devs.forEach(d => { deviceStatusMap[d.id] = d.data().status_health || "good"; });
        } catch (e) { console.warn(`Lỗi tải thiết bị nhà ${hId}:`, e); }
    });
    await Promise.all(statusPromises);

    const renderAction = () => {
        const sortedNotis = Array.from(notificationsMap.values()).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
        notiListEl.innerHTML = sortedNotis.length ? "" : "<li class='noti-empty'>Chưa có thông báo nào.</li>";
        
        sortedNotis.forEach(data => {
            const isDanger = data.category === "danger";
            const isMaintenance = data.category === "maintenance_request" || data.title?.includes("Yêu cầu sửa chữa");
            const isFixed = data.isFixed === true || (data.deviceId && deviceStatusMap[data.deviceId] === 'good');
            
            // Lọc theo nhà đang active
            if (activeHomeId && data.homeId && data.homeId !== activeHomeId) return;

            const timeStr = new Date(data.timestamp).toLocaleString("vi-VN");
            let icon = '🔔', bg = '#3498db';
            if (isDanger) { icon = '🔥'; bg = '#e74c3c'; }
            if (isMaintenance) { icon = '🚩'; bg = '#e67422'; }
            if (data.category === 'maintenance_complete' || data.title?.includes("hoàn tất")) { icon = '✅'; bg = '#2ecc71'; }

            const li = document.createElement("li");
            li.className = "noti-item";
            li.style = "display:flex; align-items:center; padding:15px; border-bottom:1px solid #eee; transition: background 0.2s;";
            
            // LOGIC NÚT BẤM CẢI TIẾN:
            let actionHtml = "";
            if (isFixed && (isDanger || isMaintenance)) {
                actionHtml = '<span style="color:#2ecc71; font-weight:bold; font-size:13px;">✅ Đã sửa chữa</span>';
            } else if (userRole === 'admin') {
                if (isDanger) {
                    actionHtml = `<span style="background:#3498db; color:white; padding:5px 12px; border-radius:4px; font-size:12px; font-weight:bold;">Liên lạc với user</span>`;
                } else if (isMaintenance) {
                    actionHtml = `<button onclick="goToRepair('${data.homeId}', '${(data.homeName || "").replace(/'/g, "\\'")}')" style="background:#d32f2f; color:white; border:none; padding:5px 12px; border-radius:4px; font-size:12px; cursor:pointer;">Xử lý ngay</button>`;
                }
            } else if (userRole === 'user' && isDanger) {
                // User: Hiện nút báo hỏng khi có sự cố bất thường
                actionHtml = `<button onclick="handleQuickReport('${data.homeId}', '${(data.homeName || "").replace(/'/g, "\\'")}', '${data.deviceId}', '${(data.deviceName || "Thiết bị").replace(/'/g, "\\'")}')" style="background:#e67e22; color:white; border:none; padding:5px 12px; border-radius:4px; font-size:12px; cursor:pointer; font-weight:bold;">Báo hỏng Admin</button>`;
            }

            li.innerHTML = `
                <div style="background:${bg}; color:white; width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-right:15px; font-size:18px;">${icon}</div>
                <div style="flex:1;">
                    <p style="margin:0; font-weight:bold; color:#333;">${data.title} <span style="font-weight:normal; font-size:12px; color:#888; float:right;">${timeStr}</span></p>
                    <p style="margin:5px 0 0; font-size:14px; color:#666;">${data.message}</p>
                    <div style="margin-top:8px; display:flex; justify-content:flex-end;">
                        ${actionHtml}
                    </div>
                </div>
            `;
            notiListEl.appendChild(li);
        });
    };

    // 2. Lắng nghe real-time
    if (userRole === 'admin') {
        const qGlobal = query(collection(db, "notifications"), orderBy("timestamp", "desc"), limit(50));
        onSnapshot(qGlobal, (snap) => {
            snap.forEach(d => notificationsMap.set(d.id, {...d.data(), id: d.id}));
            renderAction();
        });
    } else {
        homeIdsToFetch.forEach(hId => {
            const qHome = query(collection(db, "homes", hId, "notifications"), orderBy("timestamp", "desc"), limit(20));
            onSnapshot(qHome, (snap) => {
                snap.forEach(d => notificationsMap.set(d.id, {...d.data(), id: d.id}));
                renderAction();
            });
        });
    }

    // Đánh dấu đã đọc
    localStorage.setItem("lastViewedNotifications", new Date().toISOString());
}

// ======================================================
// 4. BADGE LISTENER (DẤU ĐỎ)
// ======================================================
function startBadgeListener(userRole, userData) {
    const navNoti = document.getElementById("nav-notifications");
    if (!navNoti || window.location.pathname.includes("notifications.html")) return;

    const checkNoti = (data) => {
        const lastView = new Date(localStorage.getItem("lastViewedNotifications") || 0).getTime();
        const notiTime = new Date(data.timestamp).getTime();
        
        if (notiTime > lastView) {
            // Chỉ cập nhật nếu giao diện chưa có dấu đỏ (Tránh lag do cập nhật DOM liên tục)
            if (navNoti.dataset.hasBadge !== "true") {
                navNoti.innerHTML = `Thông báo <span style="display:inline-block; width:8px; height:8px; background:#ff4757; border-radius:50%; margin-left:4px; border:1px solid white;"></span>`;
                navNoti.style.color = "#ff4757";
                navNoti.style.fontWeight = "bold";
                navNoti.dataset.hasBadge = "true";
            }
            
            // Check cross-home alert
            const activeHomeId = localStorage.getItem("activeHomeId");
            if (activeHomeId && data.homeId && data.homeId !== activeHomeId) {
                if (data.category === "danger" || data.category === "maintenance_request") {
                    showCrossHomeAlert(data.homeId, data.homeName || "khác");
                }
            }
        }
    };

    if (userRole === 'admin') {
        onSnapshot(query(collection(db, "notifications"), orderBy("timestamp", "desc"), limit(1)), (s) => {
            if (!s.empty) checkNoti(s.docs[0].data());
        });
    } else {
        let homeIds = [...(userData.joinedHomeIds || [])];
        if (userData.ownedHomeId) homeIds.push(userData.ownedHomeId);
        homeIds.forEach(hId => {
            onSnapshot(query(collection(db, "homes", hId, "notifications"), orderBy("timestamp", "desc"), limit(1)), (s) => {
                if (!s.empty) checkNoti(s.docs[0].data());
            });
        });
    }
}

// ======================================================
// 5. CÁC HÀM XỬ LÝ TOÀN CỤC (WINDOW)
// ======================================================

window.goToRepair = async (homeId, homeName) => {
    const activeHomeId = localStorage.getItem("activeHomeId");

    // Nếu đã ở trong chính ngôi nhà này -> Chuyển thẳng
    if (homeId === activeHomeId) {
        window.location.href = "maintenance.html";
        return;
    }

    const password = prompt(`Phát hiện sự cố tại "${homeName}".\nVui lòng nhập mật khẩu nhà để vào hệ thống bảo trì:`);
    if (!password) return;

    try {
        const homeSnap = await getDoc(doc(db, "homes", homeId));
        if (!homeSnap.exists()) return alert("Không tìm thấy dữ liệu nhà!");

        const realPassword = homeSnap.data().homePassword;
        if (String(password).trim() === String(realPassword).trim()) {
            localStorage.setItem("activeHomeId", homeId);
            localStorage.setItem("activeHomeName", homeName);
            alert(`✅ Xác thực thành công! Đang vào nhà "${homeName}"...`);
            window.location.href = "maintenance.html";
        } else {
            alert("❌ Sai mật khẩu bảo mật!");
        }
    } catch (e) {
        console.error("Lỗi xác thực:", e);
        alert("Lỗi: " + e.message);
    }
};

window.handleQuickReport = async (homeId, homeName, deviceId, deviceName) => {
    const activeHomeId = localStorage.getItem("activeHomeId");

    // Nếu người dùng đang ở trong chính ngôi nhà này rồi -> Bấm báo hỏng luôn
    if (homeId === activeHomeId) {
        if (window.reportDeviceIssue) {
            await window.reportDeviceIssue(deviceId, deviceName);
            return;
        }
    }

    const password = prompt(`Phát hiện sự cố tại "${homeName}".\nVui lòng nhập mật khẩu nhà để xác thực và gửi báo hỏng tới Admin:`);
    if (!password) return;

    try {
        const homeSnap = await getDoc(doc(db, "homes", homeId));
        if (!homeSnap.exists()) return alert("Không tìm thấy dữ liệu nhà!");
        
        const realPassword = homeSnap.data().homePassword;
        if (String(password).trim() === String(realPassword).trim()) {
            localStorage.setItem("activeHomeId", homeId);
            localStorage.setItem("activeHomeName", homeName);
            if (window.reportDeviceIssue) {
                await window.reportDeviceIssue(deviceId, deviceName);
                alert(`✅ Đã gửi báo hỏng thiết bị "${deviceName}" tới Admin!`);
            } else {
                alert("Hệ thống đang bận, vui lòng thử lại sau.");
            }
        } else {
            alert("❌ Sai mật khẩu nhà!");
        }
    } catch (e) {
        console.error("Lỗi báo hỏng nhanh:", e);
        alert("Lỗi kết nối: " + e.message);
    }
};