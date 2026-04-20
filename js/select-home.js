import { auth, db } from "./firebase-config.js"; // Thêm auth
import { doc, getDoc, updateDoc, setDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js"; 
async function accessHome() {
    const user = auth.currentUser;
    if (!user) {
        alert("Vui lòng đăng nhập tài khoản trước!");
        return;
    }

    const hId = document.getElementById("homeIdInput").value.trim(); 
    const hPass = document.getElementById("homePasswordInput").value.trim();

    if (!hId || !hPass) {
        alert("Vui lòng nhập đầy đủ mã nhà và mật khẩu!");
        return;
    }

    try {
        // --- BƯỚC 1: LẤY THÔNG TIN ROLE VÀ NHÀ HIỆN TẠI CỦA NGƯỜI DÙNG ---
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
            alert("Không tìm thấy dữ liệu người dùng!");
            return;
        }

        const userData = userSnap.data();
        const userRole = (userData.role || "user").toLowerCase(); //

        // --- BƯỚC 3: KIỂM TRA THÔNG TIN NHÀ TRÊN FIREBASE ---
        const homeRef = doc(db, "homes", hId);
        const homeSnap = await getDoc(homeRef);

        if (homeSnap.exists()) {
            const homeData = homeSnap.data();
            const dbPassword = homeData.homePassword;

            if (dbPassword && String(dbPassword) === String(hPass)) {
                
                // --- BƯỚC 4: CẬP NHẬT DỮ LIỆU ---
                // Lưu vào Local Storage để Dashboard biết đang xem nhà nào
                localStorage.setItem("activeHomeId", hId); 
                localStorage.setItem("triggerSimulation", "true"); 

                // Ghi nhận thành viên vào Firebase để Admin thấy (QUAN TRỌNG)
                try {
                    const memberRef = doc(db, "homes", hId, "members", user.uid);
                    await setDoc(memberRef, {
                        uid: user.uid,
                        username: userData.username || "Chưa cập nhật",
                        email: user.email,
                        role: userRole,
                        lastJoined: new Date().toISOString()
                    }, { merge: true });

                    // LƯU LỊCH SỬ VÀO TÀI KHOẢN (Cho cả Admin và User)
                    await updateDoc(userRef, {
                        joinedHomeIds: arrayUnion(hId)
                    });
                } catch (pe) {
                    console.warn("Lỗi lưu lịch sử hoặc thành viên:", pe.message);
                }
                
                alert(`Chào mừng ${userRole.toUpperCase()}! Vào nhà thành công.`);
                window.location.replace("dashboard.html"); 
            } else {
                alert("Sai mật khẩu nhà!");
            }
        } else {
            alert("Mã nhà không tồn tại!");
        }
    } catch (error) {
        console.error("Lỗi hệ thống:", error);
        alert("Có lỗi xảy ra: " + error.message);
    }
}
window.accessHome = accessHome;