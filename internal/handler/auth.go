package handler

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"techops-manager/internal/domain"
	"techops-manager/internal/service"
)

// AuthHandler holds the dependency on the UserService.
type AuthHandler struct {
	userService *service.UserService
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(us *service.UserService) *AuthHandler {
	return &AuthHandler{userService: us}
}

// RegisterHandler handles user registration
func (h *AuthHandler) RegisterHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != "POST" {
		http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
		return
	}

	var newUser domain.User
	err := json.NewDecoder(r.Body).Decode(&newUser)
	if err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	// Basic validation
	if newUser.FullName == "" || newUser.Email == "" || newUser.Phone == "" || newUser.Password == "" {
		http.Error(w, "All fields are required", http.StatusBadRequest)
		return
	}

	// Check if email already exists
	exists, err := h.userService.EmailExists(newUser.Email)
	if err != nil {
		log.Printf("Error checking email existence: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if exists {
		http.Error(w, "Email already registered", http.StatusConflict)
		return
	}

	// Set required fields for the new user
	newUser.ID = fmt.Sprintf("USER-%d", time.Now().UnixNano())
	newUser.Role = "User"

	// TODO: Hash the password before storing (use bcrypt)
	// hashedPassword, err := bcrypt.GenerateFromPassword([]byte(newUser.Password), bcrypt.DefaultCost)
	// newUser.Password = string(hashedPassword)

	// Create user in database
	err = h.userService.CreateUser(&newUser)
	if err != nil {
		log.Printf("Error creating user: %v", err)
		http.Error(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	log.Printf("User %s registered with email %s.", newUser.ID, newUser.Email)
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "User registered successfully",
		"user_id": newUser.ID,
		"email":   newUser.Email,
	})
}

// LoginHandler handles user authentication
func (h *AuthHandler) LoginHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != "POST" {
		http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
		return
	}

	var loginRequest struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	err := json.NewDecoder(r.Body).Decode(&loginRequest)
	if err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	user, err := h.userService.GetUserByEmail(loginRequest.Email)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Invalid email or password", http.StatusUnauthorized)
			return
		}
		log.Printf("Error retrieving user: %v", err)
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}

	// TODO: Use bcrypt to compare hashed password
	if user.Password != loginRequest.Password {
		time.Sleep(100 * time.Millisecond)
		http.Error(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}

	log.Printf("User %s logged in successfully.", user.Email)
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "Login successful",
		"user": map[string]interface{}{
			"id":    user.ID,
			"email": user.Email,
			"name":  user.FullName,
			"phone": user.Phone,
			"role":  user.Role,
		},
		"token": "demo-jwt-token",
	})
}

// ForgotPasswordHandler - Handles STEP 1: Sending the OTP
func (h *AuthHandler) ForgotPasswordHandler(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    if r.Method != http.MethodPost {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }

    var req struct {
        Email string `json:"email"`
    }

    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "Invalid request", http.StatusBadRequest)
        return
    }

    err := h.userService.RequestOTP(req.Email)
    if err != nil {
      	w.WriteHeader(http.StatusNotFound)
        json.NewEncoder(w).Encode(map[string]string{
            "message": "Email not found in our records",
        })
        return
    }

    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]string{"message": "OTP sent successfully"})
}

// ResetPasswordWithOTPHandler - Handles STEP 2: Verifying OTP and Updating Password
func (h *AuthHandler) ResetPasswordWithOTPHandler(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    if r.Method != http.MethodPost {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }

    var req struct {
        Email       string `json:"email"`
        OTP         string `json:"otp"`
        NewPassword string `json:"newPassword"`
    }

    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "Invalid request", http.StatusBadRequest)
        return
    }

    err := h.userService.VerifyAndResetPassword(req.Email, req.OTP, req.NewPassword)
    if err != nil {
       	w.WriteHeader(http.StatusUnauthorized) // 401
        json.NewEncoder(w).Encode(map[string]string{
            "message": err.Error(), 
        })
        return
    }

    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]string{"message": "Password updated successfully"})
}

// GetUsersHandler handles GET /api/users
func (h *AuthHandler) GetUsersHandler(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    
    if r.Method != http.MethodGet {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }

    // Call service to get data
    users, err := h.userService.GetAllUsers()
    if err != nil {
        log.Printf("Error fetching users: %v", err)
        http.Error(w, "Internal server error", http.StatusInternalServerError)
        return
    }

    // Return the list of users
    w.WriteHeader(http.StatusOK)
    if err := json.NewEncoder(w).Encode(users); err != nil {
        log.Printf("Error encoding users: %v", err)
    }
}