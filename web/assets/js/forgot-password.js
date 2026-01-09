const API_BASE_URL = "http://localhost:8080/api/v1";

// DOM Elements - Containers
const requestContainer = document.getElementById("requestFormContainer");
const otpContainer = document.getElementById("otpFormContainer");

// DOM Elements - Forms
const forgotForm = document.getElementById("forgotPasswordForm");
const resetForm = document.getElementById("resetPasswordForm");

// DOM Elements - Inputs & Display
const emailInput = document.getElementById("email");
const displayEmail = document.getElementById("displayEmail");
const otpInput = document.getElementById("otp");
const newPassInput = document.getElementById("newPassword");
const confirmPassInput = document.getElementById("confirmPassword");

// DOM Elements - Buttons
const submitBtn = document.getElementById("submitBtn");
const resetBtn = document.getElementById("resetBtn");

let userEmail = ""; // To store email between steps

// --- STEP 1: Request OTP ---
forgotForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  userEmail = emailInput.value.trim();

  // UI Loading State
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="ph-circle-notch animate-spin mr-2"></i> Sending OTP...`;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userEmail }),
    });

    const data = await response.json();

    if (response.ok) {
      // Success: Switch to OTP view
      displayEmail.textContent = userEmail;
      requestContainer.classList.add("hidden");
      otpContainer.classList.remove("hidden");
    } else {
      alert(data.message || "Email not found in our records.");
    }
  } catch (err) {
    console.error("Fetch error:", err);
    alert("Server is unreachable. Please try again later.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = "Get OTP Code";
  }
});

// --- STEP 2: Verify OTP & Reset Password ---
resetForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const otp = otpInput.value.trim();
  const newPass = newPassInput.value;
  const confirmPass = confirmPassInput.value;

  // Client-side validation
  if (otp.length !== 6) {
    alert("Please enter a valid 6-digit OTP.");
    return;
  }

  if (newPass !== confirmPass) {
    alert("Passwords do not match!");
    return;
  }

  if (newPass.length < 8) {
    alert("Password must be at least 8 characters long.");
    return;
  }

  // UI Loading State
  resetBtn.disabled = true;
  resetBtn.innerHTML = `<i class="ph-circle-notch animate-spin mr-2"></i> Updating...`;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/reset-password-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: userEmail,
        otp: otp,
        newPassword: newPass,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      alert(
        "Password updated successfully! Please login with your new password."
      );
      window.location.href = "login.html?reset=success";
    } else {
      alert(data.message || "Invalid or expired OTP.");
    }
  } catch (err) {
    console.error("Fetch error:", err);
    alert("An error occurred. Please try again.");
  } finally {
    resetBtn.disabled = false;
    resetBtn.innerHTML = "Reset Password";
  }
});

// Helper: Auto-focus next field (Optional UX)
otpInput.addEventListener("input", () => {
  if (otpInput.value.length === 6) {
    newPassInput.focus();
  }
});
