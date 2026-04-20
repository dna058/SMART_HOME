import { db, auth } from "./firebase-config.js";
import { doc, updateDoc, getDoc, deleteDoc, collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs, where } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { CONFIG } from "./config.js";

// ==========================================
// 1. ĐIỀU KHIỂN THIẾT BỊ (TOGGLE) + GHI LỊCH SỬ
// ==========================================
window.toggleDeviceStatus = async (deviceId, currentStatus, deviceName) => {
    const homeId = localStorage.getItem("activeHomeId");
    if (!homeId) return alert("Chưa chọn nhà!");

    const newStatus = (currentStatus === "off" || currentStatus === "closed") ? 
                      (currentStatus === "off" ? "on" : "open") : 
                      (currentStatus === "on" ? "off" : "closed");

    try {
        const deviceRef = doc(db, "homes", homeId, "devices", deviceId);
        const snap = await getDoc(deviceRef);
        const room = snap.data()?.location || "general"; 

        await updateDoc(deviceRef, { status: newStatus }); 

        const logRef = collection(db, "homes", homeId, "devices", deviceId, "logs");
        await addDoc(logRef, {
            action: `Đã ${newStatus === "on" || newStatus === "open" ? "BẬT" : "TẮT"} thiết bị`,
            time: new Date().toLocaleString('vi-VN'),
            timestamp: serverTimestamp()
        });

        // Gửi thông báo tới hệ thống (Để hiện chấm đỏ cho người khác)
        if (window.logNotification) {
            const displayAction = newStatus === "on" || newStatus === "open" ? "BẬT" : "TẮT";
            await window.logNotification(
                homeId, 
                `điều khiển (${displayAction})`, 
                deviceName, 
                "device_toggle",
                { deviceId: deviceId }
            );
        }

        await fetch(`${CONFIG.BASE_URL}/api/${room}/${deviceId}`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
    } catch (e) { 
        console.error("Lỗi điều khiển:", e);
        alert("Không thể kết nối với thiết bị!");
    }
};

// ==========================================
// 2. TÍNH NĂNG BÁO HỎNG (Gửi thông báo tới Admin)
// ==========================================
window.reportDeviceIssue = async (deviceId, deviceName) => {
    const homeId = localStorage.getItem("activeHomeId");
    if (!homeId) return alert("Vui lòng chọn nhà trước!");

    if (!confirm(`Xác nhận gửi báo cáo sự cố cho thiết bị: ${deviceName}?`)) return;

    try {
        const deviceRef = doc(db, "homes", homeId, "devices", deviceId);
        
        // Kiểm tra trạng thái thực tế trước khi gửi
        const devSnap = await getDoc(deviceRef);
        if (devSnap.exists()) {
            const currentHealth = devSnap.data().status_health;
            // Chỉ cho phép báo hỏng khi trạng thái là 'issue_detected'
            if (currentHealth === "repair" || currentHealth === "under_repair") {
                alert("Thiết bị này đã được báo hỏng hoặc đang trong quá trình sửa chữa.");
                return;
            }
        }

        // Cập nhật trạng thái sang 'repair'
        await updateDoc(deviceRef, { status_health: "repair" });

        // Gửi thông báo chính thức qua logNotification
        if (window.logNotification) {
            await window.logNotification(
                homeId, 
                "báo hỏng thiết bị", 
                `${deviceName}`, 
                "maintenance_request",
                { deviceId, deviceName }
            );
        }

        // Ghi lịch sử thiết bị
        const historyRef = collection(db, "homes", homeId, "devices", deviceId, "history");
        await addDoc(historyRef, {
            action: `Người dùng (${auth.currentUser?.email || "N/A"}) đã yêu cầu bảo trì tới Admin`,
            timestamp: serverTimestamp()
        });

        alert("Đã gửi yêu cầu sửa chữa tới hệ thống!");
        console.log(`[DeviceManager] Đã gửi báo cáo thành công cho thiết bị ${deviceName}`);
    } catch (e) {
        console.error("Lỗi báo hỏng:", e);
        alert("Lỗi khi gửi báo hỏng: " + e.message);
    }
};

// ==========================================
// 3. XEM LỊCH SỬ
// ==========================================
window.showDeviceHistory = async (deviceId, deviceName) => {
    const homeId = localStorage.getItem("activeHomeId");
    const content = document.getElementById('historyModalContent');
    if (!content) return;

    content.innerHTML = "<p>Đang tải lịch sử...</p>";
    document.getElementById('historyModal').style.display = 'block';

    try {
        const historyRef = collection(db, "homes", homeId, "devices", deviceId, "history");
        const q = query(historyRef, orderBy("timestamp", "desc"), limit(20));
        const querySnapshot = await getDocs(q);
        
        let html = `<h3>Lịch sử: ${deviceName}</h3><ul class="log-list" style="padding-left: 20px;">`;
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const dateObj = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
            const timeStr = isNaN(dateObj) ? "Vừa xong" : dateObj.toLocaleString("vi-VN");
            
            html += `<li style="margin-bottom: 8px;">
                <span style="color: #888; font-size: 12px;">[${timeStr}]</span> 
                <span style="margin-left: 5px;">${data.action}</span>
            </li>`;
        });
        
        if (querySnapshot.empty) html += "<li style='color: gray; font-style: italic;'>Chưa có lịch sử hoạt động.</li>";
        html += "</ul>";
        content.innerHTML = html;
    } catch (e) { 
        console.error(e);
        content.innerHTML = "<p>Không tải được lịch sử.</p>"; 
    }
};

// ==========================================
// 4. XÓA THIẾT BỊ (ĐÃ CẬP NHẬT LOGGING)
// ==========================================
window.deleteDevice = async (deviceId, deviceName, deviceLocation) => {
    const homeId = localStorage.getItem("activeHomeId");
    if (!homeId) return;

    if (!confirm(`Bạn có chắc chắn muốn xóa thiết bị '${deviceName}' khỏi hệ thống?`)) return;

    try {
        if (typeof window.logNotification === 'function') {
            await window.logNotification(homeId, "xoá thiết bị", `${deviceName} ở phòng ${deviceLocation || 'Không rõ'}`, "management");
        }
        await deleteDoc(doc(db, "homes", homeId, "devices", deviceId));
        alert("Xóa thiết bị thành công!");
    } catch (error) {
        console.error("Lỗi khi xóa:", error);
        alert("Không thể xóa!");
    }
};

// ==========================================
// 5. HOÀN TẤT BẢO TRÌ (GỌI TỪ ADMIN)
// ==========================================
window.completeMaintenance = async (deviceId, deviceName) => {
    const homeId = localStorage.getItem("activeHomeId");
    if (!homeId) return alert("Chưa chọn nhà!");

    if (!confirm(`Xác nhận hoàn tất bảo trì cho: ${deviceName}?`)) return;

    try {
        const deviceRef = doc(db, "homes", homeId, "devices", deviceId);
        await updateDoc(deviceRef, {
            status_health: "good",
            lastMaintenance: serverTimestamp()
        });

        const historyRef = collection(db, "homes", homeId, "devices", deviceId, "history");
        await addDoc(historyRef, {
            action: "Quản trị viên đã bảo trì thành công",
            timestamp: serverTimestamp()
        });

        // Đồng nhất việc gửi thông báo bằng logNotification
        if (window.logNotification) {
            await window.logNotification(
                homeId, 
                "hoàn tất sửa chữa", 
                `${deviceName}`, 
                "maintenance_complete",
                { deviceId, deviceName }
            );
        }

        alert(`✅ Đã hoàn tất sửa chữa và đưa thiết bị "${deviceName}" vào hoạt động!`);

        // 4. ĐỒNG BỘ THÔNG BÁO CŨ: Đánh dấu các tin liên quan là 'Đã sửa chữa'
        try {
            // A. Cập nhật trong Collection của nhà (Dành cho User)
            const notiQuery = query(
                collection(db, "homes", homeId, "notifications"), 
                where("deviceId", "==", deviceId)
            );
            const notiSnaps = await getDocs(notiQuery);
            const updatePromises = notiSnaps.docs.map(d => updateDoc(d.ref, { isFixed: true }));
            
            // B. Cập nhật trong Collection Global (Dành cho Admin)
            const globalQuery = query(
                collection(db, "notifications"),
                where("deviceId", "==", deviceId),
                where("homeId", "==", homeId)
            );
            const globalSnaps = await getDocs(globalQuery);
            const globalUpdatePromises = globalSnaps.docs.map(d => updateDoc(d.ref, { isFixed: true }));

            await Promise.all([...updatePromises, ...globalUpdatePromises]);
            console.log(`[Maintenance] Đã đồng bộ ${updatePromises.length + globalUpdatePromises.length} thông báo cũ (Nhà & Hệ thống).`);
        } catch (errSync) { console.warn("Lỗi đồng bộ thông báo cũ:", errSync); }

        if (window.location.pathname.includes("maintenance.html")) {
            setTimeout(() => location.reload(), 1500);
        }
    } catch (e) {
        console.error("Lỗi hoàn tất bảo trì:", e);
        alert("Lỗi: " + e.message);
    }
};

// ==========================================
// 6. CHỈNH SỬA THIẾT BỊ (OPEN MODAL & SAVE)
// ==========================================
window.openEditDevice = async (deviceId, currentName, currentLocation) => {
    const homeId = localStorage.getItem("activeHomeId");
    const modal = document.getElementById("editDeviceModal");
    if (!modal) return console.error("Không tìm thấy editDeviceModal");

    document.getElementById("editDeviceId").value = deviceId;
    document.getElementById("editDeviceName").value = currentName;
    if (document.getElementById("editOldDeviceName")) document.getElementById("editOldDeviceName").value = currentName;
    if (document.getElementById("editOldDeviceLocation")) document.getElementById("editOldDeviceLocation").value = currentLocation;

    try {
        const homeDoc = await getDoc(doc(db, "homes", homeId));
        if (homeDoc.exists()) {
            const rooms = homeDoc.data().rooms || [];
            const roomSelect = document.getElementById("editDeviceRoom");
            roomSelect.innerHTML = rooms.map(room => {
                const rName = typeof room === 'object' ? room.name : room;
                return `<option value="${rName}" ${rName === currentLocation ? 'selected' : ''}>${rName}</option>`;
            }).join('');
        }
        modal.style.display = "block";
    } catch (error) {
        console.error("Lỗi mở form sửa:", error);
    }
};

window.closeEditModal = () => {
    const modal = document.getElementById("editDeviceModal");
    if (modal) modal.style.display = "none";
};

window.handleSaveEditDevice = async (event) => {
    event.preventDefault();
    const homeId = localStorage.getItem("activeHomeId");
    const deviceId = document.getElementById("editDeviceId").value;
    const newName = document.getElementById("editDeviceName").value;
    const newLocation = document.getElementById("editDeviceRoom").value;

    try {
        const deviceRef = doc(db, "homes", homeId, "devices", deviceId);
        await updateDoc(deviceRef, {
            deviceName: newName,
            location: newLocation
        });

        // Ghi lịch sử sửa đổi thiết bị
        try {
            const historyRef = collection(db, "homes", homeId, "devices", deviceId, "history");
            await addDoc(historyRef, {
                action: `Cập nhật thông tin: ${newName} (${newLocation})`,
                user: localStorage.getItem("cachedUsername") || "Admin",
                timestamp: serverTimestamp()
            });
        } catch (logErr) { console.warn("Lỗi ghi history khi sửa:", logErr); }

        if (window.logNotification) {
            await window.logNotification(homeId, "sửa đổi thiết bị", `Cập nhật thông tin ${newName}`, "management");
        }

        alert("Cập nhật thành công!");
        window.closeEditModal();
    } catch (error) {
        console.error("Lỗi sửa:", error);
        alert("Thất bại!");
    }
};

// Listener
document.addEventListener("DOMContentLoaded", () => {
    const editForm = document.getElementById("editDeviceForm");
    if (editForm) editForm.onsubmit = window.handleSaveEditDevice;
});