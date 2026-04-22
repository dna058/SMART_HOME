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

            // --- KÍCH HOẠT GIẢ LẬP LỖI ---
            if (userData.role === "user") {
                localStorage.setItem("triggerSimulation", "true");
            }
        }

        alert("Đăng nhập thành công!");
        localStorage.removeItem("activeHomeId");
        localStorage.removeItem("activeHomeName");
        window.location.href = "dashboard.html";

    } catch (error) {
        console.error("Login error:", error.code, error.message);
        
        if (error.code === "auth/unauthorized-domain") {
            alert("❌ Lỗi domain chưa được xác thực!\n\nVào Firebase Console → Authentication → Settings → Authorized domains → thêm '127.0.0.1' và 'localhost'.");
        } else if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
            alert("Sai tài khoản hoặc mật khẩu!");
        } else if (error.code === "auth/network-request-failed") {
            alert("❌ Lỗi mạng! Vui lòng kiểm tra kết nối internet.");
        } else {
            alert("❌ Lỗi đăng nhập: " + error.message);
        }
    }
}



window.handleLogin = handleLogin;