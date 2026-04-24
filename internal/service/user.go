package service

import (
	"crypto/rand"
	"fmt"
	"net/smtp"
	"techops-manager/internal/domain"
	"techops-manager/internal/repository"
	"time"
)

// UserService handles business logic for user management.
type UserService struct {
	repo *repository.UserRepository // Dependency on the repository
}

// NewUserService creates a new UserService.
func NewUserService(repo *repository.UserRepository) *UserService {
	return &UserService{repo: repo}
}

// CreateUser handles registration business logic (e.g., validation, hashing).
func (s *UserService) CreateUser(user *domain.User) error {
	// In a real app, hash password here, run validation checks.
	return s.repo.CreateUser(user)
}

// GetUserByEmail retrieves a user.
func (s *UserService) GetUserByEmail(email string) (*domain.User, error) {
	return s.repo.GetUserByEmail(email)
}

// GetUserByEmailAndPhone retrieves a user.
func (s *UserService) GetUserByEmailAndPhone(email, phone string) (*domain.User, error) {
	return s.repo.GetUserByEmailAndPhone(email, phone)
}

// UpdateUserPassword updates the password.
func (s *UserService) UpdateUserPassword(userID, newPassword string) error {
	// In a real app, hash the new password here.
	return s.repo.UpdateUserPassword(userID, newPassword)
}

// EmailExists checks for email duplication.
func (s *UserService) EmailExists(email string) (bool, error) {
	return s.repo.EmailExists(email)
}

func (s *UserService) GetAllUsers() ([]domain.User, error) {
    users, err := s.repo.GetUsers()
    if err != nil {
        return nil, err
    }
    
    // Logic check: Ensure we don't return an empty slice as null in JSON
    if users == nil {
        return []domain.User{}, nil
    }
    
    return users, nil
}

// --- Updated service methods to support OTP Flow ---

func (s *UserService) RequestOTP(email string) error {
    exists, err := s.repo.EmailExists(email)
    if err != nil || !exists {
        return fmt.Errorf("email not registered")
    }

    // Generate 6-digit OTP
    otp := s.generateNumericOTP(6)
    expiry := time.Now().Add(10 * time.Minute)

    // Save to database (the password_reset_otps table)
    if err := s.repo.SaveOTP(email, otp, expiry); err != nil {
        return err
    }

    // Send the actual email
    go s.sendOTPEmail(email, otp)
    return nil
}

func (s *UserService) VerifyAndResetPassword(email, otp, newPassword string) error {
    storedOTP, expiry, err := s.repo.GetOTPRecord(email)
    if err != nil {
        return fmt.Errorf("no reset request found")
    }

    if storedOTP != otp {
        return fmt.Errorf("Invalid OTP")
    }
    if time.Now().After(expiry) {
        return fmt.Errorf("OTP has expired")
    }

    // Update password (plain text as requested)
    return s.repo.ResetPasswordTransaction(email, newPassword)
}

// Private helper to generate OTP
func (s *UserService) generateNumericOTP(length int) string {
    table := [...]byte{'1', '2', '3', '4', '5', '6', '7', '8', '9', '0'}
    b := make([]byte, length)
    _, _ = rand.Read(b) // Use crypto/rand
    for i := 0; i < len(b); i++ {
        b[i] = table[int(b[i])%len(table)]
    }
    return string(b)
}

// Private helper for SMTP
// Private helper for SMTP
func (s *UserService) sendOTPEmail(email, otp string) {
    from := "lokenathcomputer.sodepur@gmail.com"
    // REPLACE THIS: Use the 16-character code from Google App Passwords
    pass := "jtpf kntd wnvk vkke" 
    
    // Improved message format
    subject := "Subject: Lokenath Computer - Reset Code\n"
    mime := "MIME-version: 1.0;\nContent-Type: text/html; charset=\"UTF-8\";\n\n"
    body := fmt.Sprintf("Your OTP for password reset is: <b>%s</b><br>Valid for 10 minutes.", otp)
    msg := []byte(subject + mime + body)

    auth := smtp.PlainAuth("", from, pass, "smtp.gmail.com")
    err := smtp.SendMail("smtp.gmail.com:587", auth, from, []string{email}, msg)
    if err != nil {
        fmt.Printf("SMTP Error: %v\n", err)
    }
}
