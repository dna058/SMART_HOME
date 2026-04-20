import { db, auth } from "./firebase-config.js";
import { 
    collection, getDocs, getDoc, doc, updateDoc, addDoc, query, where, orderBy, limit, serverTimestamp, onSnapshot 
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

// --- 1. KIỂM TRA TRẠNG THÁI ĐĂNG NHẬP & PHÂN QUYỀN ---
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    // Hiện email chào mừng
    const emailElTop = document.getElementById("userEmail");
    if (emailElTop) emailElTop.innerText = `Chào, ${user.email}`;

    try {
        // Lấy thông tin User để biết Role
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (userSnap.exists()) {
            const userData = userSnap.data();
            const userRole = (userData.role || "user").toLowerCase();
            localStorage.setItem("userRole", userRole);
            
            // Cài đặt Navbar dựa trên Role
            renderNavbar(userRole);

            // Xử lý Nhà (Home)
            let homeId = localStorage.getItem("activeHomeId") || userData.ownedHomeId;
            if (homeId) {
                localStorage.setItem("activeHomeId", homeId);
                
                // Lấy tên nhà từ Firebase đổ vào Banner
                const homeSnap = await getDoc(doc(db, "homes", homeId));
                if (homeSnap.exists()) {
                    const hName = homeSnap.data().homeName;
                    localStorage.setItem("activeHomeName", hName);
                    
                    const banner = document.getElementById("displayHomeName") || document.getElementById("loginStatusBanner");
                    if (banner) {
                        banner.innerText = hName;
                        banner.style.background = "transparent";
                        banner.style.color = "var(--text-main)";
                        banner.style.display = "inline-block";
                    }
                }
                
                // Sau khi có homeId thì mới vẽ bảng thiết bị
                renderManagementTab(homeId, userRole);
            }
        }
    } catch (error) {
        console.error("Lỗi khởi tạo:", error);
    }
});

// --- 2. XỬ LÝ NAVBAR ĐỒNG BỘ ---
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

    // Highlighting active page (Blue color + Underline)
    const path = window.location.pathname;
    
    // Clear old active classes
    const allLinks = document.querySelectorAll('.menu a');
    allLinks.forEach(link => link.classList.remove('active'));

    if (path.includes("dashboard.html")) document.getElementById("nav-home")?.classList.add("active");
    if (path.includes("management.html")) document.getElementById("nav-devices")?.classList.add("active");
    if (path.includes("notifications.html")) document.getElementById("nav-notifications")?.classList.add("active");
    if (path.includes("profile.html") || path.includes("maintenance.html")) {
        roleLink.classList.add("active");
    }
}

// Chạy ngay khi trang load (Sử dụng cache để không bị giật)
const cachedRole = localStorage.getItem("userRole") || "user";
renderNavbar(cachedRole);


// --- 3. HÀM VẼ BẢNG THIẾT BỊ ---
// --- 3. HÀM VẼ BẢNG THIẾT BỊ (BẢN REAL-TIME CHUẨN) ---
async function renderManagementTab(homeId, userRole) {
    const container = document.getElementById('managementTableContainer');
    if (!container) return;

    // SỬ DỤNG onSnapshot để khi Admin sửa xong là User thấy Tốt ngay lập tức
    onSnapshot(collection(db, "homes", homeId, "devices"), (snapshot) => {
        if (snapshot.empty) {
            container.innerHTML = "<h3>Chưa có thiết bị nào trong nhà này.</h3>";
            return;
        }

        let html = `<table class="management-table">
            <thead>
                <tr>
                    <th>Tên Thiết Bị</th>
                    <th>Kiểm tra hệ thống</th>
                    <th>Trạng Thái</th>
                    <th style="text-align:center;">Hành Động</th>
                </tr>
            </thead><tbody>`;

        snapshot.forEach((docSnap) => {
            const d = docSnap.data();
            const id = docSnap.id;
            const name = d.deviceName || "Thiết bị";
            
            // LẤY TRẠNG THÁI THẬT TỪ DATABASE
            let status = d.status_health || 'good';

            // --- BỎ ĐOẠN RANDOM LỖI Ở ĐÂY ĐỂ TRÁNH BỊ SAI LỆCH ---

            let actionHtml = "";
            if (status !== 'good') {
                if (userRole === "admin") {
                    // Admin: Thấy bộ 3 nút Sửa, Xoá và Lên lịch khi hỏng
                    const editBtn = `<button onclick="openEditDevice('${id}', '${name}', '${d.location || ''}')" style="background:#3498db; color:white; border:none; padding:5px 8px; border-radius:4px; cursor:pointer; margin-right:5px;">Sửa</button>`;
                    const deleteBtn = `<button onclick="deleteDevice('${id}', '${name}', '${d.location || ''}')" style="background:#e74c3c; color:white; border:none; padding:5px 8px; border-radius:4px; cursor:pointer; margin-right:5px;">Xoá</button>`;
                    
                    let repairBtn = "";
                    if (status === 'repair') {
                        repairBtn = `<button onclick="completeMaintenance('${id}', '${name}')" style="background:#f39c12; color:white; border:none; padding:5px 8px; border-radius:4px; cursor:pointer;">Lên lịch sửa</button>`;
                    }
                    actionHtml = `<div style="display:flex; justify-content:center; gap:2px;">${editBtn} ${deleteBtn} ${repairBtn}</div>`;
                } else {
                    // User: Chỉ hiện nút Báo hỏng khi cần
                    if (status === 'repair') {
                        actionHtml = `<span style="color:#888;">Đã báo Admin</span>`;
                    } else {
                        actionHtml = `<button onclick="reportDeviceIssue('${id}', '${name}')" style="background:#e74c3c; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Bấm Báo Hỏng</button>`;
                    }
                }
            } else {
                // Trạng thái BÌNH THƯỜNG (good): Để trống cột Hành động theo yêu cầu
                actionHtml = "";
            }

            html += `
                <tr>
                    <td>
                        <a href="#" onclick="showDeviceHistory('${id}', '${name}')" style="color:#007bff; font-weight:bold; text-decoration:none;">🔍 ${name}</a>
                    </td>
                    <td><small style="color:#888;">Cập nhật: ${new Date().toLocaleTimeString()}</small></td>
                    <td>
                        ${status === 'good' ? '<span style="color:green; font-weight:bold;">● Hoạt động tốt</span>' : 
                          status === 'repair' ? '<span style="color:red; font-weight:bold;">● Đang chờ sửa chữa</span>' :
                          '<span style="color:#f39c12; font-weight:bold;">● Sự cố chưa báo cáo</span>'}
                    </td>
                    <td style="text-align:center;">${actionHtml}</td>
                </tr>`;
        });
        container.innerHTML = html + "</tbody></table>";
    });
}

// --- 4. CÁC HÀM TƯƠNG TÁC (WINDOW) ---
// window.reportDeviceIssue được lấy từ deviceManager.js để đồng bộ logic thông báo toàn hệ thống.


window.showDeviceHistory = async (deviceId, deviceName) => {
    const homeId = localStorage.getItem("activeHomeId");
    const modal = document.getElementById('historyModal');
    const content = document.getElementById('historyModalContent');
    if (modal) modal.style.display = 'flex';
    
    const logRef = collection(db, "homes", homeId, "devices", deviceId, "history");
    const q = query(logRef, orderBy("timestamp", "desc"), limit(10));

    onSnapshot(q, (snap) => {
        let html = `<h3>📋 Nhật ký: ${deviceName}</h3><hr>`;
        if (snap.empty) html += `<p>Chưa có lịch sử.</p>`;
        else {
            html += `<ul style="list-style:none; padding:0;">`;
            snap.forEach(docSnap => {
                const data = docSnap.data();
                const time = data.timestamp?.toDate() ? data.timestamp.toDate().toLocaleString('vi-VN') : "Vừa xong";
                html += `<li style="padding:10px 0; border-bottom:1px solid #eee;">
                    <b>${data.action}</b><br><small>${time}</small>
                </li>`;
            });
            html += `</ul>`;
        }
        content.innerHTML = html;
    });
};

window.closeHistoryModal = () => document.getElementById('historyModal').style.display = 'none';

document.getElementById("btnSignOut")?.addEventListener("click", () => {
    signOut(auth).then(() => { localStorage.clear(); window.location.href = "login.html"; });
});