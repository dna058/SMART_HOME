import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
    doc, getDoc, onSnapshot, collection, query, orderBy, limit, addDoc, deleteDoc, serverTimestamp,
    where, updateDoc, getDocs
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// --- XỬ LÝ THANH CẢNH BÁO LIÊN NHÀ (CROSS-HOME ALERT) ---
function injectCrossHomeAlertUI() {
    if (document.getElementById("crossHomeAlertBar")) return;
    const bar = document.createElement("div");
    bar.id = "crossHomeAlertBar";
    bar.style = `
        display: none; 
        background: #e67e22; 
        color: white; 
        padding: 12px 20px; 
        text-align: center; 
        font-weight: bold; 
        position: sticky; 
        top: 0; 
        z-index: 9999; 
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        animation: slideDown 0.4s ease-out;
    `;
    bar.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:center; gap:15px;">
            <span id="crossHomeAlertText">⚠️ Cảnh báo: Thiết bị tại nhà khác đang gặp sự cố!</span>
            <button id="crossHomeAlertBtn" style="background:white; color:#e67e22; border:none; padding:5px 15px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">Vào kiểm tra ngay</button>
            <span onclick="this.parentElement.parentElement.style.display='none'" style="cursor:pointer; font-size:20px; margin-left:10px;">&times;</span>
        </div>
        <style>
            @keyframes slideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } }
        </style>
    `;
    document.body.prepend(bar);
}

function showCrossHomeAlert(homeId, homeName) {
    const bar = document.getElementById("crossHomeAlertBar");
    const text = document.getElementById("crossHomeAlertText");
    const btn = document.getElementById("crossHomeAlertBtn");
    
    if (bar && text && btn) {
        text.innerText = `⚠️ Cảnh báo: Ngôi nhà "${homeName}" đang có thiết bị gặp sự cố nghiêm trọng!`;
        btn.onclick = () => quickEnterHome(homeId, homeName);
        bar.style.display = "block";
        bar.style.background = "#d32f2f"; 
    }
}

async function quickEnterHome(homeId, homeName) {
    const password = prompt(`Vui lòng nhập mật khẩu để vào nhanh nhà "${homeName}":`);
    if (!password) return;

    try {
        const homeSnap = await getDoc(doc(db, "homes", homeId));
        if (!homeSnap.exists()) return alert("Nhà không tồn tại!");
        
        const homeData = homeSnap.data();
        if (String(homeData.homePassword) === String(password)) {
            localStorage.setItem("activeHomeId", homeId);
            localStorage.setItem("activeHomeName", homeName);
            // Cập nhật joinedHomeIds nếu cần
            if (auth.currentUser) {
                const { arrayUnion } = await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js");
                await updateDoc(doc(db, "users", auth.currentUser.uid), {
                    joinedHomeIds: arrayUnion(homeId)
                }).catch(() => {});
            }
            alert(`Đang vào nhà "${homeName}"...`);
            location.href = "dashboard.html";
        } else {
            alert("Sai mật khẩu nhà!");
        }
    } catch (e) {
        console.error("Lỗi vào nhà nhanh:", e);
        alert("Lỗi: " + e.message);
    }
}

// --- XỬ LÝ DẤU ĐỎ THÔNG BÁO ---
window.addEventListener('beforeunload', () => {
    if (window.location.pathname.includes("notifications.html")) {
        localStorage.setItem("lastViewedNotifications", new Date().toISOString());
    }
});

/**
 * HÀM GỬI THÔNG BÁO DÙNG CHUNG (Dành cho cả User và Admin)
 * category: "management", "danger", "maintenance_request", "maintenance_complete", "device_toggle"
 */
window.logNotification = async (homeId, action, details, category = "management", extraData = {}) => {
    try {
        console.info(`%c [SYSTEM] logNotification: ${action} - ${details}`, "color: #27ae60; font-weight: bold;");

        if (!homeId || !auth.currentUser) {
            console.warn("Lỗi: Thiếu homeId hoặc chưa Auth.", { homeId, user: auth.currentUser?.email });
            return;
        }

        const role = localStorage.getItem("userRole") || "user";
        const email = auth.currentUser.email || "Unknown";

        // 1. Tự động lấy tên nhà để nội dung thông báo đầy đủ
        let homeName = "ngôi nhà này";
        try {
            const homeSnap = await getDoc(doc(db, "homes", homeId));
            if (homeSnap.exists()) {
                homeName = homeSnap.data().homeName || "ngôi nhà này";
            }
        } catch (e) { console.warn("Không thể lấy tên nhà:", e); }

        // 2. Xây dựng nội dung
        // 2. Xây dựng nội dung
        // Nếu là cảnh báo nguy hiểm (Danger), chỉ lấy phần chi tiết cho gọn (Bỏ thông tin tài khoản)
        let message = details;
        if (category !== "danger") {
            const roleName = role.toLowerCase() === "admin" ? "Admin" : "User";
            message = `Tài khoản (${roleName}) ${email} đã ${action}: ${details}`;
        }
        
        let title = "Quản lý hệ thống";
        if (category === "danger") title = `Phát hiện ra bất thường trong "${homeName}"`;
        if (category === "maintenance_request") title = `Yêu cầu sửa chữa tại "${homeName}"`;
        if (category === "maintenance_complete") title = `Đã hoàn tất sửa chữa tại "${homeName}"`;

        const notiData = {
            title: title,
            message: message,
            role: role,
            email: email,
            action: action,
            details: details,
            category: category,
            homeId: homeId,
            homeName: homeName,
            timestamp: new Date().toISOString(),
            ...extraData // Lưu thêm deviceId hoặc các thông tin khác nếu có
        };

        // 3. Ghi vào collection của NHÀ (Tất cả thành viên trong nhà thấy)
        try {
            await addDoc(collection(db, "homes", homeId, "notifications"), notiData);
        } catch (e) {
            console.error("Lỗi ghi thông báo vào nhà:", e);
        }

        // 4. Ghi vào collection TỔNG (Admin toàn cục thấy)
        // Admin chỉ nhận các hành động Quản lý và Cảnh báo. KHÔNG nhận thông báo Bật/Tắt.
        if (category !== "device_toggle") {
            try {
                await addDoc(collection(db, "notifications"), notiData);
            } catch (err) {
                console.warn("[Permission] User không có quyền ghi Global, tin nhắn chỉ lưu tại nhà.");
            }
        }

        return true;
    } catch (error) {
        console.error("Lỗi hệ thống logNotification:", error);
        return false;
    }
};

const emailElTop = document.getElementById("userEmail");
const cachedNameTop = localStorage.getItem("cachedUsername");
if (emailElTop && cachedNameTop) emailElTop.innerText = `Chào, ${cachedNameTop}`;

const nameElTop = document.getElementById("displayHomeName");
const cachedHomeName = localStorage.getItem("activeHomeName");
if (nameElTop && cachedHomeName) {
    nameElTop.innerText = cachedHomeName;
}

// 1. Đăng xuất & Điều hướng
document.getElementById("btnSignOut")?.addEventListener("click", () => {
    signOut(auth).then(() => {
        localStorage.clear();
        window.location.href = "login.html";
    });
});

window.goToRepair = (homeId, homeName) => {
    localStorage.setItem("activeHomeId", homeId);
    localStorage.setItem("activeHomeName", homeName);
    alert(`Hệ thống: Chuyển quyền điều khiển tới ${homeName}`);
    window.location.href = "maintenance.html";
};

// 2. Hàm render Navbar
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

    if (window.location.pathname.includes("notifications.html") && navNoti) {
        navNoti.style.color = "";
        navNoti.style.fontWeight = "";
        navNoti.innerText = "Thông báo";
        navNoti.classList.add("active");
    }
}

// 3. LOGIC CHÍNH: Auth & Render Thông báo
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (userSnap.exists()) {
        const userData = userSnap.data();
        const userRole = (userData.role || "user").toLowerCase();
        localStorage.setItem("userRole", userRole);
        renderNavbar(userRole);

        const notiListEl = document.getElementById("notificationsList");
        if (!notiListEl) return;

        // Lưu trữ thông báo từ nhiều nguồn
        let notificationsMap = new Map();
        let deviceStatusMap = {}; // Map lưu trạng thái sức khoẻ hiện tại của thiết bị

        // Lọc theo nhà đang chọn
        const activeHomeId = localStorage.getItem("activeHomeId");

        // Lấy trạng thái hiện tại của toàn bộ thiết bị để áp dụng hồi tố cho tin cũ
        // Chế độ Global: Lấy tất cả thiết bị của các nhà User tham gia (hoặc tất cả nhà nếu là Admin)
        let homeIdsToFetch = activeHomeId ? [activeHomeId] : [...(userData.joinedHomeIds || [])];
        if (userData.ownedHomeId && !homeIdsToFetch.includes(userData.ownedHomeId)) {
            homeIdsToFetch.push(userData.ownedHomeId);
        }

        // Nếu là Admin và đang ở chế độ Global -> Fetch dữ liệu từ TẤT CẢ các nhà để đồng bộ nút bấm
        if (userRole === 'admin' && !activeHomeId) {
            try {
                const allHomesSnap = await getDocs(collection(db, "homes"));
                allHomesSnap.forEach(hDoc => {
                    if (!homeIdsToFetch.includes(hDoc.id)) homeIdsToFetch.push(hDoc.id);
                });
            } catch (e) { console.warn("Lỗi fetch danh sách nhà cho Admin:", e); }
        }

        if (homeIdsToFetch.length > 0) {
            try {
                const fetchPromises = homeIdsToFetch.map(async (hId) => {
                    const devSnap = await getDocs(collection(db, "homes", hId, "devices"));
                    devSnap.forEach(d => {
                        deviceStatusMap[d.id] = d.data().status_health || "good";
                    });
                });
                await Promise.all(fetchPromises);
            } catch (e) { console.warn("Lỗi fetch device status:", e); }
        }

        // Hàm render tập trung
        const renderListFiltered = () => {
            const sortedNotis = Array.from(notificationsMap.values())
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            notiListEl.innerHTML = "";
            if (sortedNotis.length === 0) {
                notiListEl.innerHTML = "<li class='noti-empty' style='text-align:center; padding:20px; color:gray;'>Chưa có thông báo nào.</li>";
                return;
            }

            sortedNotis.forEach(data => {
                const docId = data.id;
                // Phân loại thông báo
                const isAI = data.category === "ai_suggestion";
                const isMaintenance = data.category === "maintenance_request" || data.title === "Yêu cầu sửa chữa";
                const isMaintenanceComplete = data.category === "maintenance_complete" || data.title?.includes("hoàn tất");
                const isDanger = data.category === "danger";
                const isScene = data.category === "scene_update" || data.category === "scene_auto";

                // Lọc nghiêm ngặt: Nếu đã vào nhà, không hiện tin của nhà khác
                const activeHomeId = localStorage.getItem("activeHomeId");
                if (activeHomeId && data.homeId && data.homeId !== activeHomeId) {
                    return;
                }

                const dateObj = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
                const timeStr = isNaN(dateObj) ? "Vừa xong" : dateObj.toLocaleString("vi-VN");

                let avatarChar = isAI ? '✨' : (isDanger ? '🔥' : (isMaintenance ? '🚩' : (isMaintenanceComplete ? '✅' : (isScene ? '🎬' : (data.role?.toLowerCase() === 'admin' ? 'A' : 'U')))));
                let avatarBg = isAI ? '#f1c40f' : (isDanger ? '#e74c3c' : (isMaintenance ? '#e67422' : (isMaintenanceComplete ? '#2ecc71' : (isScene ? '#9b59b6' : (avatarChar === 'A' ? '#d32f2f' : '#3498db')))));

                const li = document.createElement("li");
                li.className = "noti-item";
                li.style = `display: flex; align-items: center; padding: 15px; border-bottom: 1px solid #eee; list-style: none; ${isAI ? 'background-color: #f0f7ff;' : ''}`;

                li.innerHTML = `
                    <div class="noti-icon" style="background-color: ${avatarBg}; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 15px; flex-shrink: 0; font-size: 18px;">
                        ${avatarChar}
                    </div>
                    <div class="noti-content" style="flex: 1;">
                        <p class="noti-message" style="margin: 0; color: #333;">
                            <b style="${isAI ? 'color: #2980b9;' : ''}">${data.title || "Thông báo"}</b>
                            <br><span style="font-size: 14px;">${data.message}</span>
                        </p>
                        <div style="display:flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                            <span class="noti-time" style="font-size: 12px; color: #888;">${timeStr}</span>
                            <div class="noti-actions">
                                ${ (data.isFixed || (data.deviceId && deviceStatusMap[data.deviceId] === 'good')) ? 
                                    `<span style="color: #2ecc71; font-weight: bold; font-size: 13px;">✅ Đã sửa chữa</span>` : 
                                    `
                                    ${(isDanger && userRole === 'user') ? 
                                        `<button onclick="handleQuickReport('${data.homeId}', '${(data.homeName || "").replace(/'/g, "\\'")}', '${data.deviceId}', '${(data.deviceName || "Thiết bị").replace(/'/g, "\\'")}')" 
                                            style="background:#e67e22; color:white; border:none; padding:5px 12px; border-radius:4px; cursor:pointer; font-size: 12px; font-weight:bold;">
                                            Báo hỏng Admin
                                        </button>` : ""}
                                    ${( (isMaintenance || isDanger) && userRole === 'admin') ?
                                        `<button onclick="goToRepair('${data.homeId}', '${(data.homeName || "").replace(/'/g, "\\'")}')" 
                                            style="background:#d32f2f; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size: 12px;">
                                            Đến sửa ngay
                                        </button>` : ""
                                    }
                                    `
                                }
                            </div>
                        </div>
                    </div>
                `;
                notiListEl.appendChild(li);
            });
        };

        // LÀM MỚI LUỒNG NHẬN TIN
        if (userRole === 'admin') {
            // Admin: Nghe từ global notifications
            const q = query(collection(db, "notifications"), orderBy("timestamp", "desc"), limit(50));
            onSnapshot(q, (snapshot) => {
                const activeHomeId = localStorage.getItem("activeHomeId");
                snapshot.forEach(d => {
                    const data = d.data();
                    // Nếu Admin đang ở trong một nhà cụ thể -> Chỉ nhận tin của nhà đó
                    if (activeHomeId && data.homeId && data.homeId !== activeHomeId) {
                        notificationsMap.delete(d.id);
                    } else {
                        notificationsMap.set(d.id, { ...data, id: d.id });
                    }
                });
                renderListFiltered();
            });
        } else {
            // User: Nghe từ TẤT CẢ các nhà (nhưng lọc nội dung)
            let homeIds = [...(userData.joinedHomeIds || [])];
            if (userData.ownedHomeId && !homeIds.includes(userData.ownedHomeId)) homeIds.push(userData.ownedHomeId);
            
            const activeHomeId = localStorage.getItem("activeHomeId");
            // Đảm bảo luôn nghe thông báo từ nhà đang active, kể cả khi profile user chưa kịp cập nhật
            if (activeHomeId && !homeIds.includes(activeHomeId)) {
                homeIds.push(activeHomeId);
            }

            homeIds.forEach(hId => {
                const q = query(collection(db, "homes", hId, "notifications"), orderBy("timestamp", "desc"), limit(20));
                onSnapshot(q, (snapshot) => {
                    snapshot.forEach(docSnap => {
                        const data = docSnap.data();
                        const isDanger = data.category === 'danger';
                        const isMaintenanceComplete = data.category === 'maintenance_complete';
                        const isActiveHome = hId === activeHomeId;

                        if (activeHomeId) {
                            // ĐÃ VÀO NHÀ: Chỉ hiện tin của nhà đang active
                            if (isActiveHome) {
                                notificationsMap.set(docSnap.id, { ...data, id: docSnap.id });
                            } else {
                                // Đảm bảo xoá các tin của nhà khác nếu lỡ có trong Map
                                notificationsMap.delete(docSnap.id);
                            }
                        } else {
                            // CHƯA VÀO NHÀ (Chế độ tổng quát): 
                            // Chỉ hiện tin Danger (Cảnh báo nguy hiểm) và Maintenance Complete (Bảo trì xong) từ tất cả các nhà
                            if (isDanger || isMaintenanceComplete) {
                                notificationsMap.set(docSnap.id, { ...data, id: docSnap.id });
                            } else {
                                notificationsMap.delete(docSnap.id);
                            }
                        }
                    });
                    renderListFiltered();
                });
            });
        }
    }
});

// --- CÁC HÀM XỬ LÝ GLOBAL ---

window.handleQuickReport = async (homeId, homeName, deviceId, deviceName) => {
    const activeHomeId = localStorage.getItem("activeHomeId");

    // Nếu người dùng đang ở trong chính ngôi nhà này rồi -> Bỏ qua bước nhập mật khẩu
    if (homeId === activeHomeId) {
        if (window.reportDeviceIssue) {
            await window.reportDeviceIssue(deviceId, deviceName);
            return;
        }
    }

    const password = prompt(`Phát hiện sự cố tại "${homeName}".\n\nVui lòng nhập mật khẩu nhà để xác thực và gửi báo hỏng tới Admin:`);
    if (password === null) return;
    if (!password.trim()) return alert("Vui lòng nhập mật khẩu!");

    try {
        const homeSnap = await getDoc(doc(db, "homes", homeId));
        if (!homeSnap.exists()) return alert("Không tìm thấy dữ liệu nhà!");
        
        const realPassword = homeSnap.data().homePassword;
        if (String(password).trim() !== String(realPassword).trim()) {
            return alert("❌ Sai mật khẩu nhà! Không thể gửi báo cáo.");
        }

        // Nếu đúng: 1. Đặt làm nhà active
        localStorage.setItem("activeHomeId", homeId);
        localStorage.setItem("activeHomeName", homeName);

        // 2. Gọi hàm báo hỏng (Cần import hoặc dùng từ window nếu đã có deviceManager.js)
        if (window.reportDeviceIssue) {
            await window.reportDeviceIssue(deviceId, deviceName);
            alert(`✅ Đã xác thực và gửi báo hỏng thiết bị "${deviceName}" tới Admin!`);
            // Tuỳ chọn: Chuyển hướng về dashboard để xem
            window.location.href = "dashboard.html";
        } else {
            alert("Hệ thống báo hỏng đang bận, vui lòng thử lại sau.");
        }
    } catch (e) {
        console.error("Lỗi báo hỏng nhanh:", e);
        alert("Lỗi kết nối: " + e.message);
    }
};

window.approveAIScene = async (notiId, sceneData) => {
    const homeId = localStorage.getItem("activeHomeId");
    if (!homeId) return alert("Lỗi: Không tìm thấy ID nhà.");

    try {
        // Thêm vào collection scenes (Dùng 'scnenesName' để khớp với Firebase của Hà)
        await addDoc(collection(db, "homes", homeId, "scenes"), {
            scnenesName: sceneData.scnenesName || sceneData.sceneName,
            runAt: sceneData.runAt,
            deviceId: sceneData.deviceId,
            action: sceneData.action,
            isEnabled: true,
            status: "active",
            createdAt: serverTimestamp()
        });

        // Xóa thông báo sau khi đồng ý
        await deleteDoc(doc(db, "homes", homeId, "notifications", notiId));
        alert("✨ Đã thêm kịch bản AI vào danh sách Scenes!");
    } catch (e) {
        console.error("Lỗi duyệt AI:", e);
        alert("Không thể lưu kịch bản.");
    }
};

window.rejectAISuggestion = async (notiId) => {
    const homeId = localStorage.getItem("activeHomeId");
    if (confirm("Bạn muốn xóa gợi ý này?")) {
        try {
            await deleteDoc(doc(db, "homes", homeId, "notifications", notiId));
        } catch (e) { console.error(e); }
    }
};

// Nếu đang ở trang thông báo, sau 3 giây tự động đánh dấu tất cả là đã đọc
if (window.location.pathname.includes("notifications.html")) {
    localStorage.setItem("lastViewedNotifications", new Date().toISOString());
    setTimeout(async () => {
        const homeId = localStorage.getItem("activeHomeId");
        if (!homeId) return;
        const q = query(collection(db, "homes", homeId, "notifications"), where("read", "==", false));
        try {
            const unreadSnaps = await getDocs(q);
            unreadSnaps.forEach(async (d) => {
                await updateDoc(d.ref, { read: true });
            });
        } catch(e) { console.warn("Lỗi cập nhật trạng thái đã đọc:", e); }
    }, 3000);
}

// --- LOGIC HIỆN CHẤM ĐỎ (BADGE) TRÊN MENU ---
async function startNotificationBadgeListener() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) return;
        
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (!userSnap.exists()) return;
        
        const userData = userSnap.data();
        const userRole = (userData.role || "user").toLowerCase();
        const currentUserEmail = user.email || "";

        const showBadge = () => {
            const navNoti = document.getElementById("nav-notifications");
            if (!navNoti || window.location.pathname.includes("notifications.html")) return;
            navNoti.innerHTML = `Thông báo <span style="display:inline-block; width:9px; height:9px; background:#ff4757; border-radius:50%; margin-left:4px; border:1.5px solid white; box-shadow: 0 0 8px rgba(255,71,87,0.6);"></span>`;
            navNoti.style.fontWeight = "bold";
            navNoti.style.color = "#ff4757";
        };

        const hideBadge = () => {
            const navNoti = document.getElementById("nav-notifications");
            if (!navNoti) return;
            navNoti.innerHTML = `Thông báo`;
            navNoti.style.fontWeight = "";
            navNoti.style.color = "";
        };

        const checkAndUpdateBadge = (notiData) => {
            const latestRaw = notiData.timestamp;
            const latestTime = (latestRaw?.toDate) ? latestRaw.toDate().getTime() : new Date(latestRaw).getTime();
            const lastViewedTime = new Date(localStorage.getItem("lastViewedNotifications") || "0").getTime();

            if (latestTime <= lastViewedTime) return; // Đã xem rồi

            // LOGIC CẢNH BÁO LIÊN NHÀ: Vẫn hiện thanh cảnh báo nếu là lỗi nghiêm trọng từ nhà khác
            const activeHomeId = localStorage.getItem("activeHomeId");
            if (activeHomeId && notiData.homeId && notiData.homeId !== activeHomeId) {
                 const isSerious = notiData.category === "danger" || notiData.category === "maintenance_request";
                 if (isSerious) {
                     showCrossHomeAlert(notiData.homeId, notiData.homeName || "khác");
                 }
                 // Không return nữa để dấu đỏ (Badge) vẫn được hiển thị bên dưới
            }

            // HIỆN CHẤM ĐỎ: Cho mọi loại thông báo mới chưa xem
            showBadge();
        };

        if (userRole === 'admin') {
            // Admin: nghe từ global notifications
            const q = query(collection(db, "notifications"), orderBy("timestamp", "desc"), limit(1));
            onSnapshot(q, (snapshot) => {
                if (snapshot.empty) return hideBadge();
                checkAndUpdateBadge(snapshot.docs[0].data());
            });
        } else {
            // User: nghe từ TẤT CẢ các nhà của mình
            let homeIds = [...(userData.joinedHomeIds || [])];
            if (userData.ownedHomeId && !homeIds.includes(userData.ownedHomeId)) {
                homeIds.push(userData.ownedHomeId);
            }

            const activeHomeId = localStorage.getItem("activeHomeId");
            // Đảm bảo luôn nghe chấm đỏ từ nhà đang active
            if (activeHomeId && !homeIds.includes(activeHomeId)) {
                homeIds.push(activeHomeId);
            }

            if (homeIds.length === 0) return;

            homeIds.forEach(hId => {
                const q = query(collection(db, "homes", hId, "notifications"), orderBy("timestamp", "desc"), limit(1));
                onSnapshot(q, (snapshot) => {
                    if (snapshot.empty) return;
                    checkAndUpdateBadge(snapshot.docs[0].data());
                });
            });
        }
    });
}
startNotificationBadgeListener();
injectCrossHomeAlertUI();

window.goToRepair = async (homeId, homeName) => {
    const activeHomeId = localStorage.getItem("activeHomeId");

    // Nếu Admin đang ở trong chính ngôi nhà này rồi -> Chuyển hướng thẳng luôn, không hỏi mật khẩu
    if (homeId === activeHomeId) {
        window.location.href = "maintenance.html";
        return;
    }

    // 1. Phục hồi tên nhà nếu bị thiếu (Dành cho tin cũ hoặc tin lỗi)
    let displayName = (homeName && homeName !== "undefined" && homeName !== "ngôi nhà này") ? homeName : "";
    
    if (!displayName) {
        try {
            const homeSnap = await getDoc(doc(db, "homes", homeId));
            if (homeSnap.exists()) {
                displayName = homeSnap.data().homeName || "ngôi nhà này";
            } else {
                displayName = "ngôi nhà này";
            }
        } catch(e) { displayName = "ngôi nhà này"; }
    }

    // 2. Lấy mật khẩu từ người dùng nhập vào
    const inputPassword = prompt(`Nhập mật khẩu an ninh của "${displayName}":`);
    
    // Nếu nhấn Cancel (null) hoặc không nhập gì thì dừng
    if (inputPassword === null) return; 

    try {
        // 3. Lấy dữ liệu nhà từ Firebase
        const homeSnap = await getDoc(doc(db, "homes", homeId));
        
        if (homeSnap.exists()) {
            const homeData = homeSnap.data();
            const realPassword = homeData.homePassword; // Mật khẩu chính xác từ Firestore

            // 3. SO SÁNH CỰC CHUẨN: 
            const isMatch = String(inputPassword).trim() === String(realPassword).trim();

            if (isMatch) {
                alert("✅ Xác thực thành công! Đang kết nối vào nhà...");
                
                // Cập nhật thông tin vào nhà cho Admin
                localStorage.setItem("activeHomeId", homeId);
                localStorage.setItem("activeHomeName", homeName || homeData.homeName);
                
                // Chuyển hướng tới trang Bảo trì
                window.location.href = "maintenance.html";
            } else {
                alert("❌ Sai mật khẩu! Vui lòng kiểm tra lại (Lưu ý viết hoa/thường).");
                console.log("Debug - Nhập vào:", inputPassword.trim());
                console.log("Debug - Trên DB:", String(realPassword).trim());
            }
        } else {
            alert("Lỗi: Không tìm thấy dữ liệu nhà này trên hệ thống.");
        }
    } catch (e) {
        console.error("Lỗi xác thực:", e);
        alert("Hệ thống đang bận hoặc gặp lỗi kết nối.");
    }
};