import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
    doc, getDoc, onSnapshot, collection, query, orderBy, limit, addDoc, deleteDoc, serverTimestamp,
    where, updateDoc
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

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
window.logNotification = async (homeId, action, details, category = "management") => {
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
        const roleName = role.toLowerCase() === "admin" ? "Admin" : "User";
        const message = `Tài khoản (${roleName}) ${email} đã ${action}: ${details}`;
        
        let title = "Quản lý hệ thống";
        if (category === "danger") title = "Cảnh báo khẩn cấp";
        if (category === "maintenance_request") title = "Yêu cầu sửa chữa";
        if (category === "maintenance_complete") title = "Đã hoàn tất bảo trì";

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
            timestamp: new Date().toISOString()
        };

        // 3. Ghi vào collection của NHÀ (Tất cả thành viên trong nhà thấy)
        try {
            await addDoc(collection(db, "homes", homeId, "notifications"), notiData);
        } catch (e) {
            console.error("Lỗi ghi thông báo vào nhà:", e);
        }

        // 4. Ghi vào collection TỔNG (Admin toàn cục thấy)
        // Lưu ý: User bình thường có thể bị chặn bởi Firestore Rules, dùng try-catch để không làm treo ứng dụng
        if (category !== "device_toggle") {
            try {
                await addDoc(collection(db, "notifications"), notiData);
            } catch (err) {
                console.warn("[Permission] User không có quyền ghi vào thông báo tổng (Global), tin nhắn chỉ lưu tại nhà.");
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

        let homeId = localStorage.getItem("activeHomeId") || userData.ownedHomeId;
        const notiListEl = document.getElementById("notificationsList");

        // Xác định đường dẫn thông báo: Admin xem toàn cục, User xem theo nhà
        let notiPath;
        if (userRole === 'admin') {
            notiPath = collection(db, "notifications");
        } else {
            if (!homeId) {
                if (notiListEl) notiListEl.innerHTML = "<li class='noti-empty' style='text-align:center; padding:20px; color:gray;'>Vui lòng chọn hoặc vào một nhà để xem thông báo.</li>";
                return;
            }
            notiPath = collection(db, "homes", homeId, "notifications");
        }

        const q = query(notiPath, orderBy("timestamp", "desc"), limit(50));

        onSnapshot(q, (snapshot) => {
            console.log(`[Notification DEBUG] Snapshot received. Size: ${snapshot.size}`);
            if (!notiListEl) return;
            notiListEl.innerHTML = "";

            if (snapshot.empty) {
                console.log("[Notification DEBUG] Snapshot is empty.");
                notiListEl.innerHTML = "<li class='noti-empty' style='text-align:center; padding:20px; color:gray;'>Chưa có thông báo nào.</li>";
                return;
            }

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const docId = docSnap.id;
                console.log("[Notification DEBUG] Nhận tin:", data);

                // Phân loại thông báo dựa trên category và title mới
                const isAI = data.category === "ai_suggestion";
                const isMaintenance = data.category === "maintenance_request" || data.title === "Yêu cầu sửa chữa" || data.title === "Yêu cầu bảo trì";
                const isMaintenanceComplete = data.category === "maintenance_complete" || data.title === "Đã hoàn tất bảo trì";
                const isDanger = data.category === "danger" || data.title?.includes("Sự cố") || data.title?.includes("Cảnh báo");
                const isScene = data.category === "scene_update" || data.category === "scene_auto";

                // Admin: Ưu tiên thấy toàn bộ tin nhắn quan trọng (Báo hỏng, Hoàn tất, Quản trị)
                // User: Hiện hết của nhà họ (notiPath đã trỏ đúng nhà)
                // Admin: Chỉ hiện tin nhắn Quản trị (Thêm/Sửa/Xóa) khi đã "vào" nhà đó.
                // Các tin quan trọng (Báo hỏng, Sự cố) thì luôn hiện toàn cục.
                if (userRole === 'admin') {
                    const activeHomeId = localStorage.getItem("activeHomeId");
                    if (data.category === "management") {
                        if (data.homeId !== activeHomeId) return;
                    }
                }

                const dateObj = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
                const timeStr = isNaN(dateObj) ? "Vừa xong" : dateObj.toLocaleString("vi-VN");

                // Thiết lập Style Icon
                let avatarChar = isAI ? '✨' : 
                                 (isDanger ? '🔥' : 
                                 (isMaintenance ? '🚩' : 
                                 (isMaintenanceComplete ? '✅' :
                                 (isScene ? '🎬' : 
                                 (data.role?.toLowerCase() === 'admin' ? 'A' : 'U')))));

                let avatarBg = isAI ? '#f1c40f' : 
                               (isDanger ? '#e74c3c' : 
                               (isMaintenance ? '#e67422' : 
                               (isMaintenanceComplete ? '#2ecc71' :
                               (isScene ? '#9b59b6' : 
                               (avatarChar === 'A' ? '#d32f2f' : '#3498db')))));

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
                                ${isAI ? `
                                    <button onclick="approveAIScene('${docId}', ${JSON.stringify(data.suggestedData).replace(/"/g, '&quot;')})" 
                                        style="background:#2ecc71; color:white; border:none; padding:5px 12px; border-radius:4px; cursor:pointer; font-size: 12px; font-weight:bold; margin-right:5px;">
                                        Đồng ý
                                    </button>
                                    <button onclick="rejectAISuggestion('${docId}')" 
                                        style="background:#bdc3c7; color:white; border:none; padding:5px 12px; border-radius:4px; cursor:pointer; font-size: 12px;">
                                        Bỏ qua
                                    </button>
                                ` : ""}
                                ${(isMaintenance && userRole === 'admin') ?
                        `<button onclick="goToRepair('${data.homeId}', '${(data.homeName || "").replace(/'/g, "\\'")}')" 
                                        style="background:#d32f2f; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size: 12px;">
                                        Đến sửa ngay
                                    </button>` : ""
                    }
                            </div>
                        </div>
                    </div>
                `;
                notiListEl.appendChild(li);
            });
        }, (error) => {
            console.error("[Notification ERROR] onSnapshot failed:", error);
            if (notiListEl) notiListEl.innerHTML = `<li class='noti-empty' style='color:red;'>Lỗi tải dữ liệu: ${error.message}</li>`;
        });
    }
});

// --- CÁC HÀM XỬ LÝ GLOBAL ---

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
        let homeId = localStorage.getItem("activeHomeId") || userData.ownedHomeId;
        
        let badgePath;
        if (userRole === 'admin') {
            badgePath = collection(db, "notifications");
        } else {
            if (!homeId) return;
            badgePath = collection(db, "homes", homeId, "notifications");
        }

        const q = query(badgePath, orderBy("timestamp", "desc"), limit(1));
        onSnapshot(q, (snapshot) => {
            const navNoti = document.getElementById("nav-notifications");
            if (!navNoti || window.location.pathname.includes("notifications.html")) return;

            if (!snapshot.empty) {
                const latestNoti = snapshot.docs[0].data();
                const latestRaw = latestNoti.timestamp;
                const latestTime = (latestRaw?.toDate) ? latestRaw.toDate().getTime() : new Date(latestRaw).getTime();
                
                const lastViewedRaw = localStorage.getItem("lastViewedNotifications") || "0";
                const lastViewedTime = new Date(lastViewedRaw).getTime();

                if (latestTime > lastViewedTime) {
                    // Hiện chấm đỏ (Dùng CSS Class cho ổn định)
                    navNoti.innerHTML = `Thông báo <span style="display:inline-block; width:8px; height:8px; background:red; border-radius:50%; margin-left:3px; border:1px solid white;"></span>`;
                    navNoti.style.fontWeight = "bold";
                } else {
                    navNoti.innerHTML = `Thông báo`;
                    navNoti.style.fontWeight = "";
                }
            }
        });
    });
}
startNotificationBadgeListener();
window.goToRepair = async (homeId, homeName) => {
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