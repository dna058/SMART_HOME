import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { 
    doc, getDoc, collection, getDocs, updateDoc, query, onSnapshot, orderBy, limit, addDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js"; 

// 0. Hiển thị lời chào từ bộ nhớ đệm ngay lập tức (Trước khi Auth load)
const emailElTop = document.getElementById("userEmail");
const cachedNameTop = localStorage.getItem("cachedUsername");
if (emailElTop && cachedNameTop) {
    emailElTop.innerText = `Chào, ${cachedNameTop}`;
}

const nameElTop = document.getElementById("displayHomeName");
const cachedHomeName = localStorage.getItem("activeHomeName");
if (nameElTop && cachedHomeName) {
    nameElTop.innerText = cachedHomeName;
}
// Đăng xuất
document.getElementById("btnSignOut").addEventListener("click", () => {
    signOut(auth).then(() => {
        localStorage.clear();
        window.location.href = "login.html";
    }).catch(error => console.error(error));
});
// --- 1. XỬ LÝ ĐĂNG XUẤT & NAVBAR ---
document.getElementById("btnSignOut")?.addEventListener("click", () => {
    signOut(auth).then(() => {
        localStorage.clear();
        window.location.href = "login.html";
    });
});

function renderNavbar(role) {
    const roleLink = document.getElementById("nav-role-action");
    if (!roleLink) return;

    if (role === "admin") {
        roleLink.href = "maintenance.html";
        roleLink.innerText = "Bảo trì & Sửa chữa";
    } else {
        roleLink.href = "profile.html";
        roleLink.innerText = "Hồ sơ cá nhân";
    }

    // Highlighting active page
    const path = window.location.pathname;
    const allLinks = document.querySelectorAll('.menu a');
    allLinks.forEach(link => link.classList.remove('active'));

    if (path.includes("dashboard.html")) document.getElementById("nav-home")?.classList.add("active");
    if (path.includes("management.html")) document.getElementById("nav-devices")?.classList.add("active");
    if (path.includes("notifications.html")) document.getElementById("nav-notifications")?.classList.add("active");
    if (path.includes("profile.html") || path.includes("maintenance.html")) {
        roleLink.classList.add("active");
    }
}

// Chạy ngay khi trang load (Sử dụng cache)
const cachedRole = localStorage.getItem("userRole") || "user";
renderNavbar(cachedRole);


// --- 2. THEO DÕI AUTH & ĐỒNG BỘ DỮ LIỆU ---
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
        if (homeId) {
            // Lấy tên nhà hiển thị
            getDoc(doc(db, "homes", homeId)).then(homeSnap => {
                if (homeSnap.exists()) {
                    const hName = homeSnap.data().homeName;
                    if (document.getElementById("displayHomeName")) {
                        document.getElementById("displayHomeName").innerText = hName;
                    }
                    localStorage.setItem("activeHomeName", hName);
                }
            });

            // Nếu là trang Bảo trì, tải danh sách thiết bị
            if (window.location.pathname.includes("maintenance.html")) {
                fetchDevicesForMaintenance(homeId);
            }
        }
    }
});

// --- 3. LOGIC BẢO TRÌ ĐỒNG BỘ (TRANG MAINTENANCE) ---
// --- 3. LOGIC BẢO TRÌ ĐỒNG BỘ (TRANG MAINTENANCE) ---
async function fetchDevicesForMaintenance(homeId) {
    const listEl = document.getElementById("maintenanceList");
    if (!listEl) return;
    
    // Sử dụng onSnapshot để ĐỒNG BỘ REAL-TIME
    onSnapshot(collection(db, "homes", homeId, "devices"), (snapshot) => {
        if (snapshot.empty) {
            listEl.innerHTML = "<tr><td colspan='5' style='text-align: center;'>Không có thiết bị.</td></tr>";
            return;
        }

        listEl.innerHTML = "";
        snapshot.forEach((docSnap) => {
            const device = docSnap.data();
            const id = docSnap.id;
            const name = device.deviceName || "Thiết bị";
            // Lấy status, nếu không phải 'repair' thì mặc định là 'good'
            const status = device.status_health || 'good'; 

            let statusHtml = "";
            let btnHtml = "";

            // LOGIC ĐƠN GIẢN: Hỏng thì hiện nút vàng, Tốt thì hiện nút xám
            if (status === "repair") {
                statusHtml = `<span style="color: #e74c3c; font-weight:bold;">● Cần bảo trì</span>`;
                btnHtml = `<button onclick="window.completeMaintenance('${id}', '${name}')" 
                            style="background:#f1c40f; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Lên lịch sửa</button>`;
            } else {
                // Khi bấm nút xong, status thành 'good', nó sẽ nhảy vào đây ngay lập tức
                statusHtml = `<span style="color: #2ecc71;">● Hoạt động tốt</span>`;
                btnHtml = `<button disabled style="background:#f5f5f5; color:#ccc; border:none; padding:5px 10px; border-radius:4px;">Ổn định</button>`;
            }

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><small style="color: gray;">...${id.slice(-5)}</small></td>
                <td><strong>${name}</strong></td>
                <td>${device.location || 'N/A'}</td>
                <td>${statusHtml}</td>
                <td>${btnHtml}</td>
            `;
            listEl.appendChild(tr);
        });
    });
}

// --- 4. HÀM QUẢN LÝ TRUY CẬP ADMIN (NẾU CẦN) ---
window.handleAdminAccess = async (homeId, deviceId, notificationId) => {
    // 1. Hỏi mật khẩu nhà
    const inputPass = prompt("Vui lòng nhập mật khẩu an ninh của nhà này để truy cập hệ thống bảo trì:");
    if (inputPass === null) return;

    try {
        // 2. Kiểm tra mật khẩu trong Firestore
        const homeSnap = await getDoc(doc(db, "homes", homeId));
        if (homeSnap.exists()) {
            const realPass = homeSnap.data().password; // Hà nhớ thêm field password vào homes nhé
            
            if (inputPass === realPass) {
                alert("Xác thực thành công!");
                // 3. Thực hiện sửa chữa ngay lập tức
                await window.completeRepair(homeId, deviceId, notificationId);
            } else {
                alert("Sai mật khẩu! Bạn không có quyền can thiệp vào thiết bị nhà này.");
            }
        }
    } catch (e) { console.error(e); }
};
window.completeRepair = async (homeId, deviceId, notificationId) => {
    try {
        // 1. Đưa thiết bị về trạng thái Tốt (Xanh lại bên User)
        await updateDoc(doc(db, "homes", homeId, "devices", deviceId), {
            status_health: 'good',
            lastMaintenance: serverTimestamp()
        });

        // 2. Đánh dấu thông báo là đã xử lý (Resolved)
        // Nếu Hà lưu thông báo trong collection notifications chung
        if (notificationId) {
             await updateDoc(doc(db, "notifications", notificationId), {
                status: 'resolved'
            });
        }

        // 3. Ghi vào history thiết bị
        await addDoc(collection(db, "homes", homeId, "devices", deviceId, "history"), {
            action: "Kỹ thuật viên đã bảo trì và khắc phục sự cố",
            timestamp: serverTimestamp()
        });

        alert("Đã bảo trì thành công! Thiết bị đã hoạt động bình thường.");
    } catch (e) { console.error("Lỗi bảo trì:", e); }
};
// Chỉ lấy những thông báo có status KHÁC 'resolved'
const qNotifications = query(
    collection(db, "notifications"), 
    where("status", "!=", "resolved"),
    orderBy("status"), // Phải orderBy theo status trước nếu dùng !=
    orderBy("timestamp", "desc")
);

onSnapshot(qNotifications, (snapshot) => {
    // Render danh sách thông báo đỏ ở đây
    // Những cái đã resolved sẽ tự động biến mất khỏi giao diện Admin nhờ onSnapshot
});