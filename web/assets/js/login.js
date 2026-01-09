/**
 * Lokenath Computer - Login Logic
 */

(function () {
  const token = localStorage.getItem("authToken");
  if (token) {
    // If token exists, skip login and go straight to dashboard
    window.location.replace("/views/dashboard.html");
  }
})();

const API_BASE_URL = "http://localhost:8080/api/v1";
const LOGIN_ENDPOINT = `${API_BASE_URL}/auth/login`;

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");

// 1. Success Message from Registration (stays the same)
window.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const regAlert = document.getElementById("regSuccessAlert");
  if (
    urlParams.get("registered") === "true" ||
    localStorage.getItem("justRegistered")
  ) {
    regAlert.classList.remove("hidden");
    localStorage.removeItem("justRegistered");
  }
});

// 2. Toggle Visibility (stays the same)
document
  .getElementById("togglePassword")
  .addEventListener("click", function () {
    const icon = this.querySelector("i");
    const isPass = passwordInput.type === "password";
    passwordInput.type = isPass ? "text" : "password";
    icon.className = isPass ? "ph-eye-slash text-lg" : "ph-eye text-lg";
  });

// 3. Login Submission - IMPROVED ERROR HANDLING
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const errorBox = document.getElementById("errorMessage");
  const errorText = document.getElementById("errorText");

  errorBox.classList.add("hidden");
  loginBtn.innerHTML =
    '<i class="ph-circle-notch ph-spin mr-2"></i> Signing in...';
  loginBtn.disabled = true;

  try {
    const response = await fetch(LOGIN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: emailInput.value.trim(),
        password: passwordInput.value,
      }),
    });

    // Check if the response is actually JSON
    const contentType = response.headers.get("content-type");
    let data;

    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      // If Go used http.Error, it's plain text
      data = { message: await response.text() };
    }

    if (response.ok) {
      // Success: 200 OK
      localStorage.setItem("authToken", data.token);
      // Accessing data.user.name based on your Go struct
      localStorage.setItem("userName", data.user.name);
      localStorage.setItem("userId", data.user.id);
      window.location.replace("/views/dashboard.html");
    } else {
      // Failure: 401, 400, etc.
      // This now correctly captures "Invalid email or password"
      errorText.textContent =
        data.message || "Login failed. Please check your credentials.";
      errorBox.classList.remove("hidden");
      resetButton();
    }
  } catch (err) {
    // Only hits here if the network is down or CORS failed
    console.error("Connection Error:", err);
    errorText.textContent =
      "Server is unreachable. Please ensure the backend is running.";
    errorBox.classList.remove("hidden");
    resetButton();
  }
});

function resetButton() {
  loginBtn.innerHTML = "Sign In";
  loginBtn.disabled = false;
}
