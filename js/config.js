// Tự động lấy IP của máy đang mở trình duyệt
const currentIP = window.location.hostname; 

export const CONFIG = {
    // Nếu chạy local, nó sẽ tự thành http://192.168.x.x:1880 hoặc http://localhost:1880
    BASE_URL: 'http://${currentIP}:1880',
    RTDB_URL: 'https://mysmarthome-13774-default-rtdb.asia-southeast1.firebasedatabase.app',
    POLL_INTERVAL: 3000 // Cập nhật mỗi 3 giây (thay vì 1ms để tránh lag)
};

export function getAuthData() {
    return JSON.parse(localStorage.getItem("auth"));
}