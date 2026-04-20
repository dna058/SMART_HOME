import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut, updatePassword } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { doc, getDoc, updateDoc, query, collection, onSnapshot, orderBy, limit, addDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
document.getElementById("btnSignOut").addEventListener("click", () => {
    signOut(auth).then(() => {
        localStorage.clear();
        window.location.href = "login.html";
    });
});

// Hàm log thông báo (Đồng bộ với dashboard.js)
const logNotification = async (homeId, action, details, category = "management") => {
    try {
        if (!homeId || !auth.currentUser) {
            console.warn("Thiếu dữ liệu để log notification:", { homeId });
            return;
        }

        // Ưu tiên lấy role từ localStorage để xử lý nhanh hơn (tránh đợi query)
        const role = localStorage.getItem("userRole") || "user";
        const email = auth.currentUser.email || "Unknown";

        // Xây dựng message
        const roleName = role.toLowerCase() === "admin" ? "Admin" : "User";
        const message = `Tài khoản (${roleName}) ${email} đã ${action}: ${details}`;

        // Lưu vào Firestore
        await addDoc(collection(db, "homes", homeId, "notifications"), {
            message: message,
            role: role,
            email: email,
            action: action,
            details: details,
            category: category,
            timestamp: new Date().toISOString()
        });

        console.log(`%c [Logged] ${action}: ${details}`, "color: #4CAF50; font-weight: bold;");
    } catch (e) {
        console.error("Lỗi log notification:", e);
    }
};


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

// 1.5. Hàm cập nhật Badge Thông báo (+N)
function updateNotificationBadge(homeId, role) {
    const lastView = localStorage.getItem("lastViewedNotifications") || "";
    const navNoti = document.getElementById("nav-notifications");
    if (!navNoti) return;

    const q = query(
        collection(db, "homes", homeId, "notifications"),
        orderBy("timestamp", "desc"),
        limit(50)
    );

    onSnapshot(q, (snapshot) => {
        let count = 0;
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const actionByAdmin = data.role && data.role.toLowerCase() === 'admin';

            // Admin: thấy thông báo của admin + management của user, BỎ QUA device_toggle của user
            if (role === 'admin') {
                if (data.category === 'device_toggle') return;
            }

            if (data.timestamp > lastView) {
                count++;
            }
        });

        if (count > 0 && !window.location.pathname.includes("notifications.html")) {
            navNoti.innerText = `Thông báo (+${count})`;
            navNoti.style.color = "#ff4d4d";
            navNoti.style.fontWeight = "bold";
        } else {
            navNoti.innerText = "Thông báo";
            navNoti.style.color = "";
            navNoti.style.fontWeight = "";
        }
    });
}

// 2. Chạy ngay khi trang load (Cache)
const cachedRole = localStorage.getItem("userRole") || "user";
renderNavbar(cachedRole);

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        const userData = userSnap.data();
        const userRole = (userData.role || "user").toLowerCase();
        localStorage.setItem("cachedUsername", userData.username);
        localStorage.setItem("userRole", userRole);
        if (emailElTop) emailElTop.innerText = `Chào, ${userData.username || user.email}`;
        
        // Cập nhật lại Navbar sau khi lấy role thật từ Firestore
        renderNavbar(userRole);
        
        let homeId = localStorage.getItem("activeHomeId") || userData.ownedHomeId;
        if (homeId) {
            const homeSnap = await getDoc(doc(db, "homes", homeId));
            if (homeSnap.exists()) {
                const hName = homeSnap.data().homeName;
                document.getElementById("displayHomeName").innerText = hName;
                localStorage.setItem("activeHomeName", hName);
            }
        } else {
            document.getElementById("displayHomeName").innerText = "Chưa kết nối vào nhà";
        }

        // Gọi badge update
        if (homeId) {
            updateNotificationBadge(homeId, userRole);
        }

        // Event listener đổi mật khẩu nhà
        document.getElementById("homePasswordForm").addEventListener("submit", async (e) => {
            e.preventDefault();
            const btn = document.getElementById("btnUpdateHomePassword");
            const oldPassInput = document.getElementById("oldHomePassword");
            const newPassInput = document.getElementById("newHomePassword");

            const oldPass = oldPassInput.value;
            const newPass = newPassInput.value;

            if (!homeId) return alert("Bạn chưa đăng nhập vào nhà nào! Vui lòng vào Dashboard và chọn nhà trước.");
            if (!oldPass || !newPass) return alert("Vui lòng điền đầy đủ thông tin!");

            try {
                btn.disabled = true;
                btn.innerText = "Đang kiểm tra...";

                // Lấy mật khẩu hiện tại của nhà
                const homeSnap = await getDoc(doc(db, "homes", homeId));
                if (!homeSnap.exists()) throw new Error("Không tìm thấy dữ liệu nhà.");

                // Đọc cả 2 field để tương thích với mọi cấu trúc dữ liệu
                const homeData = homeSnap.data();
                const currentHomePass = homeData.homePassword || "";

                if (String(currentHomePass) !== String(oldPass)) {
                    alert("Mật khẩu nhà cũ không chính xác!");
                    return;
                }

                if (String(currentHomePass) === String(newPass)) {
                    alert("Mật khẩu mới không được giống mật khẩu hiện tại!");
                    return;
                }

                // Cập nhật mật khẩu mới
                await updateDoc(doc(db, "homes", homeId), { homePassword: newPass });
                
                // Gửi thông báo thay đổi mật khẩu
                await logNotification(homeId, "thay đổi mật khẩu nhà", `thành: ${newPass}`);

                alert("Đã cập nhật mật khẩu nhà thành công!");
                document.getElementById("homePasswordForm").reset();

            } catch (err) {
                console.error("Lỗi đổi pass nhà:", err);
                alert("Lỗi: " + err.message);
            } finally {
                btn.disabled = false;
                btn.innerText = "Cập Nhật Mật Khẩu Nhà";
            }
        });

        // Đổ dữ liệu vào Form
        document.getElementById("usernameInput").value = userData.username || "";
        document.getElementById("phoneInput").value = userData.phone || "";

        // Event listener đổi thông tin
        document.getElementById("profileForm").addEventListener("submit", async (e) => {
            e.preventDefault();
            const btn = document.getElementById("btnUpdateProfile");
            btn.disabled = true;
            btn.innerText = "Đang xử lý...";

            const newName = document.getElementById("usernameInput").value.trim();
            const newPhone = document.getElementById("phoneInput").value.trim();

            try {
                await updateDoc(userRef, {
                    username: newName,
                    phone: newPhone
                });
                alert("Cập nhật thông tin thành công!");
            } catch (err) {
                console.error("Lỗi cập nhật Profile:", err);
                alert("Có lỗi xảy ra: " + err.message);
            } finally {
                btn.disabled = false;
                btn.innerText = "Cập Nhật Thông Tin";
            }
        });

        // Event listener đổi mật khẩu
        document.getElementById("passwordForm").addEventListener("submit", async (e) => {
            e.preventDefault();
            const btn = document.getElementById("btnUpdatePassword");
            btn.disabled = true;

            const newPass = document.getElementById("newPassword").value;
            const confirmPass = document.getElementById("confirmNewPassword").value;

            if (newPass.length < 8) {
                alert("Mật khẩu phải có tối thiểu 8 ký tự!");
                btn.disabled = false;
                return;
            }

            if (newPass !== confirmPass) {
                alert("Xác nhận mật khẩu không khớp!");
                btn.disabled = false;
                return;
            }

            try {
                btn.innerText = "Đang xử lý...";
                await updatePassword(auth.currentUser, newPass);
                alert("Đổi mật khẩu thành công! Vui lòng lưu lại mật khẩu mới.");
                document.getElementById("passwordForm").reset();
            } catch (err) {
                console.error("Lỗi đổi pass:", err);
                if (err.code === "auth/requires-recent-login") {
                    alert("Cần xác thực lại để thực hiện hành động này. Vui lòng đăng xuất và đăng nhập lại!");
                } else {
                    alert("Có lỗi xảy ra: " + err.message);
                }
            } finally {
                btn.disabled = false;
                btn.innerText = "Đổi Mật Khẩu";
            }
        });

    }
});
