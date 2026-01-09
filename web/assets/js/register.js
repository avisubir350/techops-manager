/**
 * Lokenath Computer - Registration Logic
 */

(function () {
  const token = localStorage.getItem("authToken");
  if (token) {
    // If token exists, skip login and go straight to dashboard
    window.location.replace("/views/dashboard.html");
  }
})();

const API_BASE_URL = "http://localhost:8080/api/v1";
const REGISTER_ENDPOINT = `${API_BASE_URL}/auth/register`;

const form = document.getElementById("registerForm");
const fullNameInput = document.getElementById("fullName");
const emailInput = document.getElementById("email");
const phoneInput = document.getElementById("phone");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const registerBtn = document.getElementById("registerBtn");

// 1. Password Visibility Toggle
document
  .getElementById("togglePassword")
  .addEventListener("click", function () {
    const icon = this.querySelector("i");
    const isPassword = passwordInput.type === "password";
    passwordInput.type = isPassword ? "text" : "password";
    icon.className = isPassword ? "ph-eye-slash text-lg" : "ph-eye text-lg";
  });

// 2. Phone Formatting (98765 43210)
phoneInput.addEventListener("input", function () {
  let value = this.value.replace(/\D/g, ""); // Keep only digits
  if (value.length > 10) value = value.slice(0, 10);

  if (value.length > 5) {
    this.value = value.slice(0, 5) + " " + value.slice(5);
  } else {
    this.value = value;
  }

  const cleanPhone = value;
  const isValid = /^[6-9]\d{9}$/.test(cleanPhone);
  document
    .getElementById("phoneError")
    .classList.toggle("hidden", isValid || value === "");
  validateForm();
});

// 3. Password Strength & Matching
passwordInput.addEventListener("input", function () {
  const pass = this.value;
  const bar = document.getElementById("passwordStrength");
  let strength = 0;

  if (pass.length >= 8) strength += 25;
  if (/[A-Z]/.test(pass)) strength += 25;
  if (/\d/.test(pass)) strength += 25;
  if (/[^A-Za-z0-9]/.test(pass)) strength += 25;

  bar.style.width = strength + "%";
  bar.className = `password-strength ${
    strength < 50
      ? "bg-red-500"
      : strength < 100
      ? "bg-amber-500"
      : "bg-green-500"
  }`;

  validatePasswordMatch();
  validateForm();
});

confirmPasswordInput.addEventListener("input", () => {
  validatePasswordMatch();
  validateForm();
});

function validatePasswordMatch() {
  const match = passwordInput.value === confirmPasswordInput.value;
  document
    .getElementById("passwordMatchError")
    .classList.toggle("hidden", match || confirmPasswordInput.value === "");
  return match;
}

// 4. Global Form Validator
function validateForm() {
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value);
  const isPhone = /^[6-9]\d{9}$/.test(phoneInput.value.replace(/\s/g, ""));

  const isValid =
    fullNameInput.value.trim().length >= 2 &&
    isEmail &&
    isPhone &&
    passwordInput.value.length >= 8 &&
    passwordInput.value === confirmPasswordInput.value;

  registerBtn.disabled = !isValid;
  return isValid;
}

// 5. Submit to Go Backend
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const errorBox = document.getElementById("errorMessage");
  const successBox = document.getElementById("successMessage");
  const errorText = document.getElementById("errorText");

  errorBox.classList.add("hidden");
  successBox.classList.add("hidden");

  registerBtn.innerHTML =
    '<i class="ph-circle-notch ph-spin mr-2 text-lg"></i> Processing...';
  registerBtn.disabled = true;

  const payload = {
    fullName: fullNameInput.value.trim(),
    email: emailInput.value.trim(),
    phone: phoneInput.value.replace(/\s/g, ""),
    password: passwordInput.value,
    role: "user",
  };

  try {
    const response = await fetch(REGISTER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (response.ok) {
      successBox.classList.remove("hidden", "flex");
      successBox.classList.add("flex");
      setTimeout(() => {
        window.location.href = "login.html";
      }, 2000);
    } else {
      errorText.textContent = data.message || "Registration failed.";
      errorBox.classList.remove("hidden");
      errorBox.classList.add("flex");
      resetButton();
    }
  } catch (err) {
    errorText.textContent = "Cannot connect to server.";
    errorBox.classList.remove("hidden");
    errorBox.classList.add("flex");
    resetButton();
  }
});

function resetButton() {
  registerBtn.innerHTML = "Create Account";
  registerBtn.disabled = false;
}
