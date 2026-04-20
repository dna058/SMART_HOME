import { auth, db } from "./firebase-config.js";
import { 
    signInWithEmailAndPassword, 
    signOut, 
    setPersistence, 
    browserSessionPersistence 
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { doc, getDoc, updateDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

async function handleLogin() {
    const emailInput = document.getElementById("email").value.trim();
    const passwordInput = document.getElementById("password").value;

    try {
        // Cài đặt chỉ ghi nhớ đăng nhập trong phiên làm việc (Tắt Auto-login vĩnh viễn)
        await setPersistence(auth, browserSessionPersistence);
        
        const userCredential = await signInWithEmailAndPassword(auth, emailInput, passwordInput);
        const user = userCredential.user;

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const userData = userSnap.data();
            const storedEmail = userData.email;

            if (storedEmail !== emailInput) {
                await signOut(auth);
                alert("Email không chính xác!");
                return;
            }

            // --- ĐOẠN RANDOM LỖI KHI ĐĂNG NHẬP ---
            // Chỉ random lỗi cho tài khoản User, Admin không cần tự làm hỏng nhà mình
            if (userData.role === "user" && userData.ownedHomeId) {
                await triggerRandomError(userData.ownedHomeId);
            }
        }

        alert("Đăng nhập thành công!");
        localStorage.removeItem("activeHomeId");
        localStorage.removeItem("activeHomeName");
        window.location.href = "dashboard.html";

    } catch (error) {
        console.error(error);
        alert("Sai tài khoản hoặc mật khẩu!");
    }
}

// Hàm bổ trợ để tạo lỗi ngẫu nhiên
async function triggerRandomError(homeId) {
    try {
        const devicesRef = collection(db, "homes", homeId, "devices");
        const snap = await getDocs(devicesRef);
        
        // Xác suất 40% có lỗi để không lần nào cũng bị hỏng (tùy Hà chỉnh)
        if (Math.random() < 0.4 && !snap.empty) {
            const goodDevices = [];
            snap.forEach(d => {
                if (d.data().status_health === 'good' || !d.data().status_health) {
                    goodDevices.push({ id: d.id, name: d.data().deviceName });
                }
            });

            if (goodDevices.length > 0) {
                const randomItem = goodDevices[Math.floor(Math.random() * goodDevices.length)];
                // Cập nhật trạng thái thành 'issue_detected' (Phát hiện sự cố)
                await updateDoc(doc(db, "homes", homeId, "devices", randomItem.id), {
                    status_health: 'issue_detected'
                });
                console.log("Đã giả lập lỗi cho: " + randomItem.name);
            }
        }
    } catch (e) {
        console.error("Lỗi random:", e);
    }
}

window.handleLogin = handleLogin;