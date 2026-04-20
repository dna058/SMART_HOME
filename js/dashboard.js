import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
    doc, getDoc, onSnapshot, collection, addDoc, updateDoc, query, getDocs,
    deleteDoc, orderBy, limit, serverTimestamp, setDoc, arrayUnion
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";


// --- LOGIC GIẢ LẬP SỰ CỐ NGẪU NHIÊN ---
async function simulateRandomFailure(forced = false) {
    const user = auth.currentUser;
    const role = localStorage.getItem("userRole") || currentUserRole;
    if (!user || role !== "user") {
        console.warn("[Simulation] Bỏ qua: không phải user.", { user: user?.email, role });
        return;
    }

    try {
        // 1. Lấy danh sách tất cả các nhà của User
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (!userSnap.exists()) return;
        const userData = userSnap.data();
        let homeIds = [...(userData.joinedHomeIds || [])];
        if (userData.ownedHomeId && !homeIds.includes(userData.ownedHomeId)) {
            homeIds.push(userData.ownedHomeId);
        }
        if (homeIds.length === 0) return;

        // 2. Lọc ra danh sách các nhà "Khỏe mạnh" (Không có thiết bị hỏng hóc đang chờ)
        let healthyHomeIds = [];
        if (!forced) {
            for (const hId of homeIds) {
                const devSnap = await getDocs(collection(db, "homes", hId, "devices"));
                const hasPending = devSnap.docs.some(d => {
                    const s = d.data().status_health;
                    return s === 'issue_detected' || s === 'repair' || s === 'under_repair';
                });
                if (!hasPending) healthyHomeIds.push(hId);
            }
        } else {
            // Khi forced = true (ví dụ đăng nhập phát báo luôn), bỏ qua bước check để tăng tốc
            healthyHomeIds = homeIds;
        }

        if (healthyHomeIds.length === 0) {
            console.log(`%c[Simulation] Tất cả các nhà đều đang có thiết bị hỏng chưa sửa. Tạm dừng giả lập mới.`, "color: #e67e22;");
            return;
        }

        // 3. Chọn nhà: Ưu tiên nhà đang active nếu nó khỏe mạnh, nếu không chọn ngẫu nhiên
        const activeHomeIdForSim = localStorage.getItem("activeHomeId");
        let homeId = (activeHomeIdForSim && healthyHomeIds.includes(activeHomeIdForSim)) 
            ? activeHomeIdForSim 
            : healthyHomeIds[Math.floor(Math.random() * healthyHomeIds.length)];
        
        console.log(`[Simulation] Đang tiến hành tạo sự cố tại nhà: ${homeId}`);

        // 4. Lấy tên nhà để gửi thông báo cho chuẩn
        const homeSnap = await getDoc(doc(db, "homes", homeId));
        if (!homeSnap.exists()) return;
        const homeName = homeSnap.data().homeName || "ngôi nhà này";

        // 5. Lấy danh sách thiết bị đang tốt
        const devicesRef = collection(db, "homes", homeId, "devices");
        const snap = await getDocs(devicesRef);
        const healthyDevices = snap.docs.filter(docSnap => {
            const d = docSnap.data();
            return !d.status_health || d.status_health === 'good';
        });

        if (healthyDevices.length === 0) {
            console.log(`[Simulation] Nhà "${homeName}" không có thiết bị nào sẵn sàng gặp sự cố.`);
            return;
        }

        // 6. Chọn ngẫu nhiên 1 thiết bị hỏng
        const randomDoc = healthyDevices[Math.floor(Math.random() * healthyDevices.length)];
        const deviceData = randomDoc.data();

        await updateDoc(doc(db, "homes", homeId, "devices", randomDoc.id), {
            status_health: 'issue_detected',
            lastIssueAt: new Date().toISOString()
        });

        // 7. Ghi thông báo tự động
        if (window.logNotification) {
            await window.logNotification(
                homeId,
                "phát hiện sự cố",
                `Thiết bị ${deviceData.deviceName} có dấu hiệu bất thường, cần kiểm tra gấp!`,
                "danger",
                { deviceId: randomDoc.id, deviceName: deviceData.deviceName }
            );
        }

        // Ghi lịch sử riêng của thiết bị
        await addDoc(collection(db, "homes", homeId, "devices", randomDoc.id, "history"), {
            action: `⚠️ Hệ thống phát hiện ${deviceData.deviceName} có dấu hiệu bất thường`,
            timestamp: serverTimestamp()
        });

        console.log(`%c[SIMULATION] Nhà "${homeName}": Thiết bị ${deviceData.deviceName} đã gặp sự cố ngẫu nhiên!`, "color: #e74c3c; font-weight: bold;");

    } catch (e) {
        console.error("Lỗi trong quá trình giả lập:", e);
    }
}

// 0. Hiển thị lời chào từ bộ nhớ đệm ngay lập tức (Trước khi Auth load)
const emailElTop = document.getElementById("userEmail");
const cachedNameTop = localStorage.getItem("cachedUsername");
if (emailElTop && cachedNameTop) {
    emailElTop.innerText = `Chào, ${cachedNameTop}`;
}

const nameElTop = document.getElementById("displayHomeName");
// Chỉ hiển thị cached home name nếu đang có activeHomeId hợp lệ
if (nameElTop && localStorage.getItem("activeHomeId") && localStorage.getItem("activeHomeName")) {
    nameElTop.innerText = localStorage.getItem("activeHomeName");
}

// 1. Hàm render Navbar đồng nhất (Sử dụng ID mới)
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
    const navNoti = document.getElementById("nav-notifications");

    if (path.includes("dashboard.html")) document.getElementById("nav-home")?.classList.add("active");
    if (path.includes("notifications.html")) navNoti?.classList.add("active");
    if (path.includes("profile.html") || path.includes("maintenance.html")) roleLink.classList.add("active");
}



let homeDocUnsubscribe = null;
let currentUserRole = localStorage.getItem("userRole") || "user"; 

// 2. Chạy ngay khi trang load (Sử dụng cache)
const cachedRole = localStorage.getItem("userRole") || "user";
renderNavbar(cachedRole);

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    // 1. Cập nhật lại tên và Role từ Firestore
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        const userData = userSnap.data();
        const userRole = (userData.role || "user").toLowerCase();
        let homeId = localStorage.getItem("activeHomeId");

        // Gọi tải danh sách nhà vào sidebar (luôn chạy)
        loadUserHomes(user.uid, userRole, userData);

        localStorage.setItem("cachedUsername", userData.username);
        localStorage.setItem("userRole", userRole);
        const emailElTop = document.getElementById("userEmailTop");
        if (emailElTop) emailElTop.innerText = `Chào, ${userData.username || user.email}`;

        currentUserRole = userRole; 
        renderNavbar(userRole);

        // 3. Hiển thị Role ở Left Box
        const roleBox = document.querySelector(".left-box p");
        if (roleBox) {
            roleBox.innerHTML = `<b>Quyền:</b> ${userRole.toUpperCase()}`;
        }

        const nameEl = document.getElementById("displayHomeName");
        const msgEl = document.getElementById("no-home-msg");
        const adminUserContainer = document.getElementById("adminUserListContainer");
        const addMenu = document.getElementById("addMenu");

        // 4. LUÔN LUÔN Cập nhật Menu nút "+"
        if (addMenu) {
            let menuContent = "";
            if (homeId) {
                menuContent += `
                    <div onclick="openAddDevice()">Thêm thiết bị</div>
                    <div onclick="openRoomManagement()">Quản lý cấu trúc nhà</div>`;
            }
            menuContent += `
                <div onclick="openAddHome()" style="border-top: 1px solid #eee; color: #007bff; font-weight: bold;">+ Thêm nhà mới</div>
                <div onclick="window.location.href='select-home.html'" style="color: #28a745; font-weight: bold;">➜ Đổi nhà / Vào nhà khác</div>`;
            addMenu.innerHTML = menuContent;
        }

        // --- KÍCH HOẠT GIẢ LẬP LỖI (CHỈ CHẠY 1 LẦN KHI ĐĂNG NHẬP) ---
        const shouldSimulate = localStorage.getItem("triggerSimulation") === "true";
        if (shouldSimulate && userRole === 'user') {
            localStorage.removeItem("triggerSimulation");
            console.log("%c[Simulation] Đăng nhập thành công - Tạo sự cố khẩn cấp ngay lập tức!", "color: orange; font-weight: bold;");
            // Rút ngắn xuống 0ms để báo ngay lập tức theo yêu cầu
            setTimeout(() => simulateRandomFailure(true), 0);
        }

        // 5. Xử lý hiển thị Nhà
        if (homeId) {
            if (msgEl) msgEl.style.display = "none";

            getDoc(doc(db, "homes", homeId)).then(homeSnap => {
                if (homeSnap.exists()) {
                    const hName = homeSnap.data().homeName;
                    if (nameEl) nameEl.innerText = hName;
                    localStorage.setItem("activeHomeName", hName);
                } else {
                    if (nameEl) nameEl.innerText = "Bạn chưa đăng nhập vào nhà";
                }
            });


            fetchHomeDetails(homeId);

            // Cập nhật member
            const memberRef = doc(db, "homes", homeId, "members", user.uid);
            setDoc(memberRef, {
                uid: user.uid,
                username: userData.username || "Chưa cập nhật",
                email: user.email,
                role: userRole,
                lastJoined: new Date().toISOString()
            }, { merge: true });

            if (adminUserContainer) {
                adminUserContainer.style.display = "block";
                fetchUsersInHome(homeId);
            }
        } else {
            if (msgEl) msgEl.style.display = "block";
            if (adminUserContainer) adminUserContainer.style.display = "none";
        }
    }
});

// Fetch danh sách thành viên trong nhà (Dùng Real-time onSnapshot)
async function fetchUsersInHome(homeId) {
    const listEl = document.getElementById("adminUserList");
    if (!listEl) return;

    listEl.innerHTML = "<li>Đang tải...</li>";

    // Lắng nghe Real-time danh mục 'members' của ngôi nhà này
    const q = collection(db, "homes", homeId, "members");

    onSnapshot(q, (snapshot) => {
        const members = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            // CHỈ hiện thành viên là 'user'
            if (data.role === 'user') {
                members.push(data);
            }
        });

        if (members.length === 0) {
            listEl.innerHTML = "<li style='color: gray'>Chưa có thành viên nào</li>";
            return;
        }

        listEl.innerHTML = members.map(u =>
            `<li style="margin-bottom: 8px; border-bottom: 1px solid #f0f0f0; padding-bottom: 5px;">
                <b>${u.username || 'Chưa cập nhật tên'}</b> 
                <br><small style="color: gray;">${u.email}</small>
            </li>`
        ).join("");
    });
}

// Hàm đóng/mở menu khi ấn nút +
async function fetchHomeDetails(homeId) {
    const container = document.getElementById("roomsContainer");
    if (!container) return;

    try {
        const homeRef = doc(db, "homes", homeId);

        // Nghe realtime thay đổi cấu trúc nhà (phòng) và cập nhật UI ngay lập tức
        if (homeDocUnsubscribe) homeDocUnsubscribe();
        homeDocUnsubscribe = onSnapshot(homeRef, (homeSnap) => {
            if (!homeSnap.exists()) return;
            const homeData = homeSnap.data();
            const rooms = homeData.rooms || [];
            renderRooms(rooms);
            renderManagedRoomList();
        });

        // Cài listener realtime cho thiết bị trong nhà
        const devicesRef = collection(db, "homes", homeId, "devices");
        onSnapshot(devicesRef, (snapshot) => {
            clearDeviceLists();
            snapshot.forEach((docSnap) => {
                renderDevice(docSnap.id, docSnap.data());
            });
        });
    } catch (e) {
        console.error("Lỗi tải thông tin nhà:", e);
    }
}

window.toggleAddMenu = () => {
    const menu = document.getElementById("addMenu");
    if (menu.style.display === "block") {
        menu.style.display = "none";
    } else {
        menu.style.display = "block";
    }
};

// Đóng menu/modal khi click ra ngoài
window.addEventListener("click", (event) => {
    const addMenu = document.getElementById("addMenu");
    const addBtn = document.querySelector(".add-btn");
    const sceneModal = document.getElementById("addSceneModal");

    // Click ra ngoài menu "+"
    if (addMenu && !addBtn.contains(event.target) && !addMenu.contains(event.target)) {
        addMenu.style.display = "none";
    }

    // Click vào vùng tối của Modal để đóng
    if (event.target === sceneModal) {
        sceneModal.style.display = "none";
    }
});
window.deleteDevice = async (deviceId, deviceName, deviceLocation) => {
    // 1. Hỏi xác nhận
    if (!confirm("Bạn có chắc chắn muốn xóa thiết bị này không?")) return;

    const homeId = localStorage.getItem("activeHomeId");
    try {
        console.info(`%c [DEBUG] Bắt đầu xoá thiết bị: ${deviceName}`, "color: #e67e22;");

        // [PRE-LOG] Gửi thông báo TRƯỚC KHI thực hiện xoá
        if (typeof window.logNotification === 'function') {
            await window.logNotification(homeId, "xoá thiết bị", `${deviceName} ở phòng ${deviceLocation || 'Không rõ'}`, "management");
        }

        const deviceRef = doc(db, "homes", homeId, "devices", deviceId);
        await deleteDoc(deviceRef);

        // 3. Hiển thị log ra Console theo yêu cầu
        console.log(`%c [Xóa] Đã xóa thành công thiết bị ID: ${deviceId}`, "color: #ff4d4d; font-weight: bold;");

        // 4. Thông báo cho người dùng
        alert("Xóa thiết bị thành công!");

        // LƯU Ý: Không cần dùng location.reload(). 
        // Vì bạn đang dùng onSnapshot trong fetchHomeDetails, giao diện sẽ tự động biến mất dòng đó.
    } catch (error) {
        console.error("Lỗi khi xóa:", error);
        alert("Không thể xóa thiết bị: " + error.message);
    }
};
// 1. Hàm mở Modal và đổ danh sách phòng
// Mở form thêm thiết bị
window.openAddDevice = async () => {
    const homeId = localStorage.getItem("activeHomeId");
    if (!homeId) return alert("Vui lòng chọn nhà trước!");

    const modal = document.getElementById("addDeviceModal");
    const roomSelect = document.getElementById("deviceRoomSelect");

    try {
        const homeDoc = await getDoc(doc(db, "homes", homeId));
        if (homeDoc.exists()) {
            const rooms = homeDoc.data().rooms || [];
            // Đổ danh sách phòng vào dropdown (hỗ trợ cả dạng string và object kèm count)
            roomSelect.innerHTML = rooms.map(room => {
                const rName = typeof room === 'object' ? room.name : room;
                return `<option value="${rName}">${rName}</option>`;
            }).join('');

            modal.style.display = "block";
        }
    } catch (error) {
        console.error("Lỗi khi tải danh sách phòng:", error);
    }
};

// 2. Hàm đóng Modal (Khắc phục lỗi closeAddDevice is not defined)
window.closeAddDevice = () => {
    const modal = document.getElementById("addDeviceModal");
    if (modal) modal.style.display = "none";
};

// 2.5 Hàm đóng Modal thêm thiết bị chung
window.closeDeviceModal = () => {
    const modal = document.getElementById("deviceModal");
    if (modal) modal.style.display = "none";
};

// 3. Hàm lưu thiết bị (Khắc phục lỗi saveDevice is not defined)
window.saveDevice = async () => {
    const homeId = localStorage.getItem("activeHomeId");
    const deviceName = document.getElementById("deviceNameInput").value;
    const roomName = document.getElementById("deviceRoomSelect").value;
    const userEmail = auth.currentUser ? auth.currentUser.email : "Unknown";

    if (!deviceName) return alert("Vui lòng nhập tên thiết bị!");

    try {
        const devicesRef = collection(db, "homes", homeId, "devices");
        await addDoc(devicesRef, {
            deviceName: deviceName,
            location: roomName,
            status: "off",
            addedBy: userEmail,
            createdAt: new Date()
        });

        await window.logNotification(homeId, "thêm thiết bị", `${deviceName} vào ${roomName}`);

        alert("Thêm thiết bị thành công!");
        window.closeAddDevice();
        // Reset input cho lần sau
        document.getElementById("deviceNameInput").value = "";
    } catch (error) {
        console.error("Lỗi khi lưu thiết bị:", error);
        alert("Lỗi: " + error.message);
    }
};

function renderDevice(deviceId, device) {
    const safeLocation = String(device.location).replace(/\s/g, '');
    const listTable = document.getElementById(`list-${safeLocation}`);

    if (!listTable) {
        console.warn(`Không tìm thấy bảng cho phòng: ${device.location}`);
        return;
    }

    // Chống trùng lặp: Nếu thiết bị này đã tồn tại trong bảng rồi thì xoá cái cũ đi để vẽ lại cái mới nhất
    const existingRow = document.getElementById(`device-${deviceId}`);
    if (existingRow) {
        existingRow.remove();
    }

    // Sử dụng biến currentUserRole đã được cache từ trước
    const userRole = currentUserRole;

    const statusClass = (device.status === 'on' || device.status === 'open') ? 'status-on' : 'status-off';
    const isFaulty = device.status_health === 'repair' || device.status_health === 'issue_detected';
    const needsReporting = device.status_health === 'issue_detected';

    // 1. TẠO NÚT XOÁ
    const deleteBtn = `
        <button class="action-btn delete-btn" onclick="deleteDevice('${deviceId}', '${device.deviceName}', '${device.location}')" title="Xóa thiết bị">
            Xoá
        </button>`;

    // 2. TẠO NÚT SỬA (MỚI)
    const editBtn = `
        <button class="action-btn edit-btn" onclick="openEditDevice('${deviceId}', '${device.deviceName}', '${device.location}')" title="Sửa thiết bị">
            Sửa
        </button>`;

    let actionHTML = "";
    if (userRole === "admin") {
        // Admin: Chế độ xem + Sửa + Xoá
        actionHTML = `<div class="action-buttons"><span style="color: #888; font-size: 13px;">Chế độ xem</span> ${editBtn} ${deleteBtn}</div>`;
    } else {
        // User: Điều khiển + Sửa + Xoá
        const s = String(device.status).toLowerCase();
        const isOff = (s === 'off' || s === 'closed' || s === 'undefined' || !s);
        const btnText = isOff ? 'Bật/Mở' : 'Tắt/Đóng';
        const toggleClass = isOff ? 'btn-turn-on' : 'btn-turn-off';
        
        // Nút báo hỏng (Chỉ hiện khi phát hiện sự cố nhưng chưa báo Admin)
        const reportBtn = needsReporting ? `
            <button class="action-btn report-btn" onclick="reportDeviceIssue('${deviceId}', '${device.deviceName}')" style="background: #e67e22; border: none; color: white; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 11px;">
                Báo hỏng Admin
            </button>` : "";

        actionHTML = `
            <div class="action-buttons">
                <button class="action-btn toggle-btn ${toggleClass}" onclick="toggleDevice('${deviceId}', '${device.status}', '${device.deviceName}')" ${isFaulty ? 'disabled' : ''}>
                    ${btnText}
                </button> 
                ${reportBtn}
                ${editBtn} 
                ${deleteBtn}
            </div>`;
    }

    const row = `
        <tr id="device-${deviceId}" ${isFaulty ? 'style="background: #fff5f5;"' : ''}>
            <td>
                <strong>${device.deviceName}</strong> ${isFaulty ? '<span style="color: #d93025; font-size: 11px; margin-left: 5px; font-weight: 700;">⚠️ Sự cố!</span>' : ''}<br>
                <small style="color: #aaa; font-size: 10px;">Được thêm bởi: ${device.addedBy || 'N/A'}</small>
            </td>
            <td><span class="status-badge ${statusClass}">${device.status.toUpperCase()}</span></td>
            <td>${actionHTML}</td>
        </tr>`;

    listTable.insertAdjacentHTML('beforeend', row);
}
// 3. Xử lý lưu thiết bị lên Firebase
// --- CHỈ GIỮ LẠI MỘT ĐOẠN XỬ LÝ SUBMIT NÀY ---
const addDeviceForm = document.getElementById("addDeviceForm");

if (addDeviceForm) {
    // Sử dụng onsubmit để đảm bảo chỉ có 1 logic duy nhất được thực thi
    addDeviceForm.onsubmit = async (e) => {
        e.preventDefault();

        const submitBtn = e.target.querySelector('button[type="submit"]');

        // 1. Kiểm tra nếu đang xử lý thì thoát luôn (Chặn lặp)
        if (submitBtn.disabled) return;
        submitBtn.disabled = true;
        submitBtn.innerText = "Đang lưu...";

        const homeId = localStorage.getItem("activeHomeId");
        const name = document.getElementById("deviceName").value;
        const room = document.getElementById("deviceRoom").value;
        const userEmail = auth.currentUser ? auth.currentUser.email : "Unknown";

        try {
            if (!homeId) throw new Error("Vui lòng chọn nhà trước!");

            console.log(" Thêm thiết bị thành công");

            // 2. Lưu vào Firebase với đầy đủ thông tin
            const deviceRef = await addDoc(collection(db, "homes", homeId, "devices"), {
                deviceName: name,
                location: room,
                status: "off",
                addedBy: userEmail, // Lưu email người thực hiện
                createdAt: new Date()
            });

            // 2b. Ghi lịch sử khởi tạo thiết bị
            try {
                await addDoc(collection(db, "homes", homeId, "devices", deviceRef.id, "history"), {
                    action: "Thiết bị được khởi tạo",
                    user: userEmail,
                    timestamp: serverTimestamp()
                });
            } catch (errLog) { console.warn("Không thể ghi log khởi tạo:", errLog); }

            await window.logNotification(homeId, "thêm thiết bị", `${name} vào ${room}`);

            alert("Thêm thiết bị thành công!");

            // 3. Đóng Modal và Reset Form
            if (typeof closeDeviceModal === "function") {
                closeDeviceModal();
            } else {
                document.getElementById("deviceModal").style.display = "none";
            }
            e.target.reset();

        } catch (err) {
            console.error("Lỗi lưu thiết bị:", err);
            alert("Lỗi: " + err.message);
        } finally {
            // 4. Chỉ mở lại nút sau 2 giây để tránh spam click
            setTimeout(() => {
                submitBtn.disabled = false;
                submitBtn.innerText = "Lưu thiết bị";
            }, 2000);
        }
    };
}

// Đóng menu nếu click ra ngoài vùng nút +
window.onclick = (event) => {
    if (!event.target.matches('.add-btn')) {
        const addMenu = document.getElementById("addMenu");
        if (addMenu && addMenu.style.display === "block") {
            addMenu.style.display = "none";
        }
    }
};



// --- LOGIC LỊCH SỬ NHÀ (NEW) ---
async function renderHomeHistory(homeIds, currentHomeId) {
    const container = document.getElementById("homeHistoryContainer");
    const select = document.getElementById("homeHistorySelect");
    if (!container || !select) return;

    // Hiện container
    container.style.display = "block";
    select.innerHTML = `<option value="">-- Chọn nhà chuyển đổi --</option>`;

    try {
        // Tải thông tin từng nhà (Song song)
        const homePromises = homeIds.map(hId => getDoc(doc(db, "homes", hId)));
        const homeSnaps = await Promise.all(homePromises);

        homeSnaps.forEach(snap => {
            if (snap.exists()) {
                const data = snap.data();
                const option = document.createElement("option");
                option.value = snap.id;
                option.innerText = data.homeName;
                if (snap.id === currentHomeId) option.selected = true;
                select.appendChild(option);
            }
        });

        // Event đổi nhà
        select.onchange = (e) => {
            const selectedId = e.target.value;
            if (selectedId && selectedId !== currentHomeId) {
                localStorage.setItem("activeHomeId", selectedId);
                location.reload();
            }
        };
    } catch (e) {
        console.error("Lỗi tải lịch sử nhà", e);
    }
}

// THÊM HÀM NÀY ĐỂ NÚT VÀO NHÀ HOẠT ĐỘNG
window.goToSelectHome = () => {
    window.location.href = "select-home.html";
};

// [NEW] Logic tìm kiếm thiết bị và kịch bản
document.addEventListener("DOMContentLoaded", () => {
    const sBox = document.getElementById("searchBox_v2");
    if (sBox) {
        sBox.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase().trim();
            const deviceRows = document.querySelectorAll("tr[id^='device-']");

            deviceRows.forEach(row => {
                const deviceName = row.querySelector("strong")?.innerText.toLowerCase() || "";
                if (deviceName.includes(query)) {
                    row.style.display = "";
                } else {
                    row.style.display = "none";
                }
            });
        });
    }
});

function renderRooms(rooms) {
    const container = document.getElementById("roomsContainer");
    if (!container) return;
    container.innerHTML = "";

    if (!Array.isArray(rooms) || rooms.length === 0) {
        container.innerHTML = `
            <div style="padding: 40px 20px; color: #666; text-align: center; border: 1px dashed #ccc; border-radius: 12px;">
                Chưa có phòng nào. Hãy thêm phòng trong phần "Quản lý cấu trúc nhà".
            </div>`;
        return;
    }

    rooms.forEach(room => {
        // Kiểm tra: Nếu là Object thì lấy thuộc tính .name, nếu là chuỗi thì lấy luôn
        let rName = typeof room === 'object' ? room.name : room;

        // Tạo ID an toàn (loại bỏ khoảng trắng để không bị lỗi selector)
        const safeId = String(rName).replace(/\s/g, '');

        const roomHtml = `
            <div class="room-card" id="room-${safeId}">
                <h3 class="room-title">${rName}</h3>
                <table class="device-table">
                    <thead>
                        <tr>
                            <th>Thiết bị</th>
                            <th>Trạng thái</th>
                            <th>Hành động</th>
                        </tr>
                    </thead>
                    <tbody id="list-${safeId}"></tbody>
                </table>
            </div>`;
        container.insertAdjacentHTML('beforeend', roomHtml);
    });
}
function clearDeviceLists() {
    const tables = document.querySelectorAll(".device-table tbody");
    tables.forEach(t => t.innerHTML = "");
}
// Logic xóa thiết bị (Sử dụng shared logic từ deviceManager.js)
// window.openEditDevice, window.deleteDevice... giờ đã nằm trong deviceManager.js
// Gán hàm vào window để gọi được từ onclick trong chuỗi HTML
window.toggleDevice = async (deviceId, currentStatus, deviceName) => {
    const homeId = localStorage.getItem("activeHomeId");
    if (!homeId) {
        alert("Vui lòng chọn nhà trước!");
        return;
    }

    const deviceRef = doc(db, "homes", homeId, "devices", deviceId);

    // 1. Xác định trạng thái mới (Chuẩn hóa về chữ thường để so sánh)
    const statusLower = String(currentStatus).toLowerCase();
    let newStatus = "off";

    if (statusLower === "off") newStatus = "on";
    else if (statusLower === "on") newStatus = "off";
    else if (statusLower === "closed") newStatus = "open";
    else if (statusLower === "open") newStatus = "closed";

    try {
        // 2. Cập nhật trạng thái chính
        await updateDoc(deviceRef, {
            status: newStatus,
            lastActionBy: auth.currentUser?.email || "Unknown" // Thêm người điều khiển để sau này dễ xem
        });
        console.log(`[Toggle] ${deviceName} -> ${newStatus}`);

        // 3. Ghi lịch sử vào sub-collection
        try {
            const actionText = (newStatus === "on" || newStatus === "open")
                ? `Đã bật/mở ${deviceName}`
                : `Đã tắt/đóng ${deviceName}`;

            await addDoc(collection(db, "homes", homeId, "devices", deviceId, "history"), {
                action: actionText,
                user: auth.currentUser?.email || "Unknown",
                timestamp: serverTimestamp()
            });
        } catch (logError) {
            // Lỗi này thường do Rules chưa cho phép ghi vào sub-collection sâu
            console.warn("Lỗi ghi history (Nhưng thiết bị vẫn điều khiển được):", logError.message);
        }

        // 4. Ghi thông báo hệ thống (Cho tab Thông báo)
        if (window.logNotification) {
            await window.logNotification(
                homeId,
                "Điều khiển thiết bị",
                `${deviceName} chuyển sang ${newStatus.toUpperCase()}`,
                "device_toggle"
            );
        }

    } catch (error) {
        console.error("Lỗi nghiêm trọng:", error);
        if (error.code === 'permission-denied') {
            alert("Bạn không có quyền điều khiển thiết bị này!");
        } else {
            alert("Lỗi kết nối Firebase!");
        }
    }
};
function applyRoleUI(role, hasHome) {
    const roleBox = document.querySelector(".left-box p");
    if (roleBox) {
        roleBox.innerHTML = `<b>Quyền:</b> ${role.toUpperCase()}`;
    }

    // Lấy các nút trong menu "+"
    const addHomeOption = document.querySelector("div[onclick='openAddHome()']");

    if (role === "user" && hasHome) {
        // Nếu là User và đã có nhà rồi thì ẩn chức năng tạo thêm nhà
        if (addHomeOption) addHomeOption.style.display = "none";
    } else {
        // Nếu là Admin hoặc User chưa có nhà thì vẫn hiện
        if (addHomeOption) addHomeOption.style.display = "block";
    }
}
// --- LOGIC THÊM NHÀ MỚI (DÀNH CHO ADMIN) ---

// 1. Hàm mở Modal
window.openAddHome = () => {
    const modal = document.getElementById("addHomeModal");
    if (modal) {
        modal.style.display = "block";
    } else {
        console.error("Không tìm thấy Modal addHomeModal trong HTML");
    }
};

// 2. Hàm đóng Modal (Khớp với nút Hủy trong HTML của bạn)
window.toggleHomeManager = () => {
    const modal = document.getElementById("addHomeModal");
    if (modal) modal.style.display = "none";
};

// 3. Hàm lưu nhà mới vào Firebase
window.saveHome = async () => {
    const user = auth.currentUser;
    const name = document.getElementById("homeName").value.trim();
    const address = document.getElementById("homeAddress").value.trim();
    const password = document.getElementById("homePassword").value.trim();

    const roomItems = document.querySelectorAll('.room-item');
    const detailedRooms = []; // Mảng chứa tên phòng đã tách: ["Nhà ăn 1", "Nhà ăn 2"]
    let isValid = true;

    if (!name || !address || !password) {
        alert("Vui lòng nhập đầy đủ thông tin nhà!");
        return;
    }

    roomItems.forEach(item => {
        const checkbox = item.querySelector('input[name="rooms"]');
        const countInput = item.querySelector('.room-count');

        if (checkbox.checked) {
            const count = parseInt(countInput.value);
            if (isNaN(count) || count < 1) {
                alert(`Vui lòng nhập số lượng hợp lệ cho ${checkbox.value}!`);
                isValid = false;
                return;
            }

            // LOGIC TÁCH PHÒNG: Tạo tên riêng biệt dựa trên số lượng
            if (count === 1) {
                detailedRooms.push(checkbox.value);
            } else {
                for (let i = 1; i <= count; i++) {
                    detailedRooms.push(`${checkbox.value} ${i}`);
                }
            }
        }
    });

    if (!isValid) return;
    if (detailedRooms.length === 0) return alert("Vui lòng chọn ít nhất một phòng!");

    try {
        // Tạo mã nhà dễ nhớ: HOME_ + 5 chữ số ngẫu nhiên
        const customHomeId = "HOME_" + Math.floor(10000 + Math.random() * 90000);

        await setDoc(doc(db, "homes", customHomeId), {
            homeName: name,
            address: address,
            homePassword: password,
            ownerUid: user.uid,
            rooms: detailedRooms,
            createdAt: new Date().toISOString()
        });

        // Bỏ qua trường ownedHomeId đơn lẻ, cứ lưu vào localStorage để vào nhà
        localStorage.setItem("activeHomeId", customHomeId);
        
        // CẬP NHẬT: Lưu ID nhà mới vào hồ sơ User để hệ thống nhận diện và lắng nghe thông báo
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            const userData = userSnap.data();
            const updates = {
                joinedHomeIds: arrayUnion(customHomeId)
            };
            // Nếu chưa có nhà sở hữu, đặt nhà này làm ownedHomeId
            if (!userData.ownedHomeId) {
                updates.ownedHomeId = customHomeId;
            }
            await updateDoc(userRef, updates);
        }

        if (window.logNotification) {
            await window.logNotification(customHomeId, "thiết lập nhà mới", `Tạo nhà: ${name}`, "management");
        }

        alert("Thêm nhà mới thành công!");
        location.reload();
    } catch (error) {
        console.error("Lỗi:", error);
    }
};
// Thêm vào file dashboard.js
window.toggleInput = (checkbox) => {
    // Tìm ô input số lượng nằm trong cùng một hàng với checkbox
    const countInput = checkbox.closest('.room-item').querySelector('.room-count');

    if (checkbox.checked) {
        countInput.disabled = false; // Mở khóa
        countInput.value = 1;        // Mặc định điền 1 khi vừa chọn
    } else {
        countInput.disabled = true;  // Khóa lại khi bỏ tích
        countInput.value = "";       // Xóa trắng giá trị
    }
};
// Xuất các hàm ra window để HTML có thể gọi
// --- QUẢN LÝ CẤU TRÚC PHÒNG ---
window.openRoomManagement = async () => {
    const homeId = localStorage.getItem("activeHomeId");
    if (!homeId) return alert("Vui lòng đăng nhập vào một nhà trước!");

    document.getElementById("roomManagementModal").style.display = "block";
    renderManagedRoomList();
};

window.closeRoomManagement = () => {
    document.getElementById("roomManagementModal").style.display = "none";
};

async function renderManagedRoomList() {
    const homeId = localStorage.getItem("activeHomeId");
    const container = document.getElementById("roomListManaged");
    if (!container) return;

    const homeSnap = await getDoc(doc(db, "homes", homeId));
    if (homeSnap.exists()) {
        const rooms = homeSnap.data().rooms || [];
        if (rooms.length === 0) {
            container.innerHTML = "<p style='color: gray;'>Chưa có phòng nào được tạo.</p>";
            return;
        }

        container.innerHTML = rooms.map(roomName => {
            const rName = typeof roomName === 'object' ? roomName.name : roomName;
            return `
                <div class="room-manage-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #f1f1f1;">
                    <span><b>${rName}</b></span>
                    <div>
                        <button onclick="openEditRoom('${rName.replace(/'/g, "\\'")}')" style="margin-right: 5px; color: #007bff; border: none; background: none; cursor: pointer;">Sửa</button> |
                        <button onclick="deleteRoom('${rName.replace(/'/g, "\\'")}')" style="margin-left: 5px; color: #dc3545; border: none; background: none; cursor: pointer;">Xoá</button>
                    </div>
                </div>
            `;
        }).join('');
    }
}

window.addRoom = async () => {
    const nameInput = document.getElementById("newRoomName");
    const newName = nameInput.value.trim();
    const homeId = localStorage.getItem("activeHomeId");

    if (!newName) return alert("Vui lòng nhập tên phòng!");

    try {
        const homeRef = doc(db, "homes", homeId);
        const homeSnap = await getDoc(homeRef);
        let rooms = homeSnap.data().rooms || [];

        const existingRoom = rooms.find(r => (typeof r === 'object' ? r.name : r).toLowerCase() === newName.toLowerCase());
        if (existingRoom) {
            const actualName = typeof existingRoom === 'object' ? existingRoom.name : existingRoom;
            const confirmAdd = confirm(`Phòng "${actualName}" đã tồn tại! Bạn có chắc chắn muốn thêm không? (Nếu đồng ý, phòng cũ sẽ chuyển thành "${actualName} 1" và phòng mới là "${newName} 2")`);
            if (!confirmAdd) return;

            // 1. Đổi tên phòng cũ trong danh sách
            rooms = rooms.map(r => {
                const rName = typeof r === 'object' ? r.name : r;
                return rName.toLowerCase() === newName.toLowerCase() ? `${actualName} 1` : r;
            });
            // 2. Thêm phòng mới
            rooms.push(`${newName} 2`);

            // 3. Cập nhật thiết bị từ "Phòng" sang "Phòng 1"
            const q = query(collection(db, "homes", homeId, "devices"));
            const deviceSnap = await getDocs(q);
            const updates = [];
            deviceSnap.forEach(d => {
                if (d.data().location.toLowerCase() === newName.toLowerCase()) {
                    updates.push(updateDoc(doc(db, "homes", homeId, "devices", d.id), { location: `${actualName} 1` }));
                }
            });
            await Promise.all(updates);

            await updateDoc(homeRef, { rooms: rooms });
            await window.logNotification(homeId, "tạo thêm phòng trùng tên", `${actualName} thành ${actualName} 1 và ${newName} 2`);
        } else {
            rooms.push(newName);
            await updateDoc(homeRef, { rooms: rooms });
            await window.logNotification(homeId, "thêm phòng mới", newName);
        }

        nameInput.value = "";
        renderManagedRoomList();
    } catch (e) {
        alert("Lỗi thêm phòng: " + e.message);
    }
};

window.openEditRoom = (roomName) => {
    document.getElementById("oldRoomName").value = roomName;
    document.getElementById("editRoomNameInput").value = roomName;
    document.getElementById("editRoomModal").style.display = "block";
};

window.closeEditRoomModal = () => {
    document.getElementById("editRoomModal").style.display = "none";
};

window.saveEditRoom = async () => {
    const oldName = document.getElementById("oldRoomName").value.trim();
    const newName = document.getElementById("editRoomNameInput").value.trim();
    const homeId = localStorage.getItem("activeHomeId");

    if (!newName) return alert("Vui lòng nhập tên phòng!");

    // Nếu tên không đổi (không phân biệt hoa thường), thì đóng modal
    if (oldName.toLowerCase() === newName.toLowerCase()) return closeEditRoomModal();

    try {
        const homeRef = doc(db, "homes", homeId);
        const homeSnap = await getDoc(homeRef);
        let rooms = homeSnap.data().rooms || [];

        // Kiểm tra xem tên mới đã tồn tại chưa (không phân biệt hoa thường)
        const isDuplicate = rooms.some(r => {
            const rName = typeof r === 'object' ? r.name : r;
            return rName.toLowerCase() === newName.toLowerCase() && rName !== oldName;
        });

        if (isDuplicate) return alert(`Phòng "${newName}" đã tồn tại!`);

        // 1. Cập nhật mảng rooms trong nhà
        rooms = rooms.map(r => {
            const rName = typeof r === 'object' ? r.name : r;
            return rName === oldName ? newName : r;
        });
        await updateDoc(homeRef, { rooms: rooms });

        // 2. Cập nhật vị trí tất cả thiết bị trong phòng đó
        const q = query(collection(db, "homes", homeId, "devices"));
        const snapshot = await getDocs(q);
        const updates = [];
        snapshot.forEach(d => {
            if (d.data().location === oldName) {
                updates.push(updateDoc(doc(db, "homes", homeId, "devices", d.id), { location: newName }));
            }
        });
        await Promise.all(updates);

        await window.logNotification(homeId, "đổi tên phòng", `${oldName} thành ${newName}`);
        alert("Đã đổi tên phòng và cập nhật các thiết bị!");
        closeEditRoomModal();
        renderManagedRoomList();
    } catch (e) {
        alert("Lỗi: " + e.message);
    }
};

window.deleteRoom = async (roomName) => {
    if (!confirm(`Bạn có chắc chắn muốn xoá phòng "${roomName}"? Điều này sẽ XOÁ TẤT CẢ thiết bị trong phòng này!`)) return;

    const homeId = localStorage.getItem("activeHomeId");
    try {
        // [PRE-LOG] Gửi thông báo TRƯỚC KHI thực hiện xoá/cập nhật mảng rooms
        if (typeof window.logNotification === 'function') {
            await window.logNotification(homeId, "xoá phòng", roomName, "management");
        }

        const homeRef = doc(db, "homes", homeId);
        const homeSnap = await getDoc(homeRef);
        let rooms = homeSnap.data().rooms || [];

        // 1. Xoá phòng khỏi danh sách
        rooms = rooms.filter(r => {
            const rName = typeof r === 'object' ? r.name : r;
            return rName !== roomName;
        });
        await updateDoc(homeRef, { rooms: rooms });

        // 2. Xoá tất cả thiết bị trong phòng đó
        const q = query(collection(db, "homes", homeId, "devices"));
        const snapshot = await getDocs(q);
        const deletes = [];
        snapshot.forEach(d => {
            if (d.data().location === roomName) {
                deletes.push(deleteDoc(doc(db, "homes", homeId, "devices", d.id)));
            }
        });
        await Promise.all(deletes);
        alert(`Đã xoá phòng "${roomName}" và tất cả thiết bị liên quan!`);
        renderManagedRoomList();
    } catch (e) {
        alert("Lỗi xoá phòng: " + e.message);
    }
};

window.handleSignOut = () => {
    signOut(auth).then(() => {
        console.log("Đang đăng xuất...");
        localStorage.clear();
        window.location.href = "login.html";
    }).catch((error) => {
        console.error("Lỗi đăng xuất:", error);
    });
};

// --- HIỂN THỊ DANH SÁCH NHÀ VÀ KIỂM TRA MẬT KHẨU ---
async function loadUserHomes(uid, role, userData) {
    const listContainer = document.getElementById("userHomesList");
    if (!listContainer) return;

    listContainer.innerHTML = "<p style='text-align:center; color:gray; font-size:12px; margin:8px 0;'>Đang tải...</p>";
    let homes = [];

    try {
        // Bước 1: Thử dùng collectionGroup để lấy TẤT CẢ nhà mà user là member
        // (Cần Firebase index: collection group "members", field "uid" ASC)
        let usedCollectionGroup = false;
        try {
            const { collectionGroup: cg, query: fq, where: fw, getDocs: fget } =
                await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js");
            const memberQuery = fq(cg(db, "members"), fw("uid", "==", uid));
            const memberSnap = await fget(memberQuery);
            const homeIds = memberSnap.docs.map(d => d.ref.parent.parent.id);
            if (homeIds.length > 0) {
                const hSnaps = await Promise.all(homeIds.map(hId => getDoc(doc(db, "homes", hId))));
                hSnaps.forEach(hSnap => { if (hSnap.exists()) { const d = hSnap.data(); homes.push({ ...d, id: hSnap.id }); } });
                usedCollectionGroup = true;
            }
        } catch (cgErr) {
            console.warn("collectionGroup query thất bại (có thể thiếu index):", cgErr.message);
            // Nếu lỗi có URL tạo index, hiển thị cho user
            const indexUrl = (cgErr.message || "").match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
            if (indexUrl) {
                listContainer.innerHTML = `<p style='font-size:11px; color:#e53935;'>Cần tạo Firebase Index để hiện đủ danh sách nhà.<br>
                    <a href="${indexUrl[0]}" target="_blank" style="color:#007bff;">👉 Bấm vào đây để tạo index (1 lần duy nhất)</a></p>`;
            }
        }

        // Bước 2: Fallback - nếu collectionGroup không dùng được, dùng joinedHomeIds + ownedHomeId
        if (!usedCollectionGroup) {
            const joinedIds = [...(userData.joinedHomeIds || [])];
            if (userData.ownedHomeId && !joinedIds.includes(userData.ownedHomeId)) {
                joinedIds.push(userData.ownedHomeId);
            }
            if (joinedIds.length > 0) {
                const hSnaps = await Promise.all(joinedIds.map(hId => getDoc(doc(db, "homes", hId))));
                hSnaps.forEach(hSnap => { if (hSnap.exists()) { const d = hSnap.data(); homes.push({ ...d, id: hSnap.id }); } });
            }
        }

        listContainer.innerHTML = "";

        if (homes.length === 0) {
            listContainer.innerHTML = "<p style='color:gray; font-size:12px; text-align:center; margin:8px 0;'>Chưa có nhà nào.</p>";
            return;
        }

        const activeId = localStorage.getItem("activeHomeId");
        homes.forEach(home => {
            const div = document.createElement("div");
            const isActive = home.id === activeId;
            div.style.cssText = `padding:10px 12px; margin-bottom:4px; border:1px solid ${isActive ? '#007bff' : '#eee'};
                border-radius:6px; cursor:pointer; background:${isActive ? '#e8f0fe' : '#fff'};
                transition:background 0.2s;`;
            div.innerHTML = `<strong style="color:${isActive ? '#0056b3' : '#007bff'};">${home.homeName}</strong>` +
                (isActive ? ` <span style="font-size:11px; color:#28a745;">✓ Đang dùng</span>` : '') +
                `<br><small style="color:gray;">${home.address || "Chưa có địa chỉ"}</small>`;
            div.onmouseover = () => { if (!isActive) div.style.background = "#f0f8ff"; };
            div.onmouseleave = () => { if (!isActive) div.style.background = "#fff"; };
            div.onclick = () => window.promptHomePassword(home.id, home.homeName);
            listContainer.appendChild(div);
        });
    } catch (e) {
        console.error("Lỗi tải danh sách nhà:", e);
        listContainer.innerHTML = "<p style='color:red; font-size:12px; text-align:center;'>Lỗi tải danh sách.</p>";
    }
}

window.promptHomePassword = (homeId, homeName) => {
    document.getElementById("targetHomeId").value = homeId;
    document.getElementById("targetHomeName").innerText = homeName;
    document.getElementById("targetHomePassword").value = "";
    const modal = document.getElementById("homePasswordModal");
    modal.style.display = "flex";
    setTimeout(() => document.getElementById("targetHomePassword").focus(), 100);
};

window.closeHomePasswordModal = () => {
    document.getElementById("homePasswordModal").style.display = "none";
};

window.verifyHomePassword = async () => {
    const homeId = document.getElementById("targetHomeId").value;
    const password = document.getElementById("targetHomePassword").value;

    if (!password) {
        alert("Vui lòng nhập mật khẩu nhà!");
        return;
    }

    try {
        const homeSnap = await getDoc(doc(db, "homes", homeId));
        if (!homeSnap.exists()) {
            alert("Nhà không tồn tại!");
            return;
        }
        const homeData = homeSnap.data();
        const dbPass = homeData.homePassword || "";

        // Debug log để kiểm tra giá trị so sánh
        console.log(`[verifyHomePassword] homeId: ${homeId}, dbPass: "${dbPass}", inputPass: "${password}", match: ${String(dbPass) === String(password)}`);

        if (String(dbPass) === String(password)) {
            localStorage.setItem("activeHomeId", homeId);
            localStorage.setItem("activeHomeName", homeData.homeName);
            localStorage.setItem("triggerSimulation", "true"); // Đặt cờ giả lập sự cố

            // Lưu homeId vào mảng joinedHomeIds trong Firestore của user (cho lần sau)
            if (auth.currentUser) {
                const userRef = doc(db, "users", auth.currentUser.uid);
                await updateDoc(userRef, {
                    joinedHomeIds: arrayUnion(homeId)
                }).catch(() => { }); // bỏ qua nếu lỗi
            }

            window.closeHomePasswordModal();
            location.reload();
        } else {
            alert("Sai mật khẩu nhà! Vui lòng thử lại.");
        }
    } catch (e) {
        console.error("Lỗi xác minh mật khẩu:", e);
        alert("Lỗi: " + e.message);
    }

};

// --- TỰ ĐỘNG GIẢ LẬP ĐỊNH KỲ (30 giây quét một lần, xác suất hỏng 30%) ---
setInterval(() => {
    // Chỉ giả lập nếu là User và đã đăng nhập
    if (typeof currentUserRole !== 'undefined' && currentUserRole === 'user') {
        // Đã tăng lên 100% để test
        console.log("%c[Simulation] Chu kỳ 30s: Đang tạo sự cố mới...", "color: #3498db;");
        simulateRandomFailure();
    }
}, 30000); 