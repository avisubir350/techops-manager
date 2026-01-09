package repository

import (
	"database/sql"
	"fmt"
	"techops-manager/internal/domain"
	"time"
)

// UserRepository handles database operations for the User domain.
type UserRepository struct {
	db *sql.DB
}

// NewUserRepository creates a new UserRepository.
func NewUserRepository(database *sql.DB) *UserRepository {
	return &UserRepository{db: database}
}

// CreateUser inserts a new user record.
func (r *UserRepository) CreateUser(user *domain.User) error {
	query := `
		INSERT INTO users (id, full_name, email, phone, password, role, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
	`
	_, err := r.db.Exec(query, user.ID, user.FullName, user.Email, user.Phone, user.Password, user.Role)
	return err
}

// EmailExists checks if a user with the given email already exists.
func (r *UserRepository) EmailExists(email string) (bool, error) {
	var count int
	query := `SELECT COUNT(*) FROM users WHERE email = ?`
	err := r.db.QueryRow(query, email).Scan(&count)
	return count > 0, err
}

// GetUserByEmail finds a user by email.
func (r *UserRepository) GetUserByEmail(email string) (*domain.User, error) {
	user := &domain.User{}
	query := `
        SELECT id, full_name, email, phone, password, role, created_at, updated_at
        FROM users WHERE email = ?
    `

	err := r.db.QueryRow(query, email).Scan(
		&user.ID, &user.FullName, &user.Email, &user.Phone,
		&user.Password, &user.Role, &user.CreatedAt, &user.UpdatedAt,
	)

	if err != nil {
		return nil, err
	}

	return user, nil
}

// GetUserByEmailAndPhone finds a user by email and phone.
func (r *UserRepository) GetUserByEmailAndPhone(email, phone string) (*domain.User, error) {
	user := &domain.User{}
	query := `
        SELECT id, full_name, email, phone, password, role, created_at, updated_at
        FROM users WHERE email = ? AND phone = ?
    `

	err := r.db.QueryRow(query, email, phone).Scan(
		&user.ID, &user.FullName, &user.Email, &user.Phone,
		&user.Password, &user.Role, &user.CreatedAt, &user.UpdatedAt,
	)

	if err != nil {
		return nil, err
	}

	return user, nil
}

// UpdateUserPassword updates the user's password.
func (r *UserRepository) UpdateUserPassword(userID, newPassword string) error {
	query := `UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?`
	_, err := r.db.Exec(query, newPassword, userID)
	return err
}

// GetUsers fetches all users from the database, ordered by name.
func (r *UserRepository) GetUsers() ([]domain.User, error) {
    query := `
        SELECT id, full_name, email, phone, role, created_at, updated_at 
        FROM users 
        ORDER BY full_name ASC
    `
    
    rows, err := r.db.Query(query)
    if err != nil {
        return nil, fmt.Errorf("failed to query users: %w", err)
    }
    defer rows.Close()

    var users []domain.User
    for rows.Next() {
        var u domain.User
        err := rows.Scan(
            &u.ID, 
            &u.FullName, 
            &u.Email, 
            &u.Phone, 
            &u.Role, 
            &u.CreatedAt, 
            &u.UpdatedAt,
        )
        if err != nil {
            return nil, fmt.Errorf("failed to scan user: %w", err)
        }
        users = append(users, u)
    }

    return users, nil
}

// --- Password Reset & OTP Methods ---

// SaveOTP stores a 6-digit code for a user, handling updates if one already exists.
func (r *UserRepository) SaveOTP(email, otp string, expiry time.Time) error {
    query := `
        INSERT INTO password_reset_otps (email, otp_code, expires_at) 
        VALUES (?, ?, ?) 
        ON DUPLICATE KEY UPDATE otp_code = VALUES(otp_code), expires_at = VALUES(expires_at)
    `
    _, err := r.db.Exec(query, email, otp, expiry)
    return err
}

// GetOTPRecord retrieves the code and expiry to verify against user input.
func (r *UserRepository) GetOTPRecord(email string) (string, time.Time, error) {
    var otp string
    var expiry time.Time
    query := "SELECT otp_code, expires_at FROM password_reset_otps WHERE email = ?"
    err := r.db.QueryRow(query, email).Scan(&otp, &expiry)
    return otp, expiry, err
}

// ResetPasswordTransaction updates the plain text password and deletes the used OTP.
func (r *UserRepository) ResetPasswordTransaction(email, password string) error {
    tx, err := r.db.Begin()
    if err != nil {
        return err
    }

    // 1. Update the password (as plain text)
    updateQuery := `UPDATE users SET password = ?, updated_at = NOW() WHERE email = ?`
    if _, err := tx.Exec(updateQuery, password, email); err != nil {
        tx.Rollback()
        return err
    }

    // 2. Delete the OTP so it cannot be reused
    deleteQuery := `DELETE FROM password_reset_otps WHERE email = ?`
    if _, err := tx.Exec(deleteQuery, email); err != nil {
        tx.Rollback()
        return err
    }

    return tx.Commit()
}