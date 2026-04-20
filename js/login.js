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
        console.error(error);
        alert("Sai tài khoản hoặc mật khẩu!");
    }
}



window.handleLogin = handleLogin;