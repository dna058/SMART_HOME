import { auth, db } from "./firebase-config.js";
import { createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

async function handleRegister() {
    let username = document.getElementById("username").value.trim();
    let email = document.getElementById("email").value.trim();
    let password = document.getElementById("password").value;
    let confirmPassword = document.getElementById("confirmPassword").value;

    if (!username || !email || !password || !confirmPassword) {
        alert("Bạn cần nhập đầy đủ thông tin");
        return;
    }

    // 1. Kiểm tra đuôi email @gmail.com
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
    if (!gmailRegex.test(email)) {
        alert("Email phải có định dạng @gmail.com (Ví dụ: abc@gmail.com)");
        return;
    }

    // 2. Kiểm tra độ dài mật khẩu (Tối thiểu 8 ký tự)
    if (password.length < 8) {
        alert("Mật khẩu phải có tối thiểu 8 ký tự!");
        return;
    }

    // 3. Kiểm tra xác nhận mật khẩu trùng khớp
    if (password !== confirmPassword) {
        alert("Xác nhận mật khẩu không khớp!");
        return;
    }

    // Kiểm tra tên người dùng không được để trống
    if (!username) {
        alert("Vui lòng nhập tên người dùng!");
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Lưu thông tin vào Firestore
        await setDoc(doc(db, "users", user.uid), {
            username: username,
            email: email,
            role: "user",
            createdAt: new Date().toISOString()
        });

        alert("Đăng ký thành công!");
        await signOut(auth);
        window.location.href = "login.html";
    } catch (error) {
        // Việt hóa một số lỗi phổ biến từ Firebase
        if (error.code === 'auth/email-already-in-use') {
            alert("Email này đã được đăng ký bởi tài khoản khác!");
        } else {
            alert("Lỗi: " + error.message);
        }
    }
}

window.handleRegister = handleRegister;