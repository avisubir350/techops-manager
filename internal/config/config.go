package config

import (
	"os"
)

// DBConfig holds the database connection settings.
type DBConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	Database string
}

// GetDBConfig loads DB configurations from environment variables or uses defaults.
func GetDBConfig() DBConfig {
	return DBConfig{
		Host:     GetEnv("DB_HOST", "localhost"),
		Port:     GetEnv("DB_PORT", "3306"),
		User:     GetEnv("DB_USER", "root"),
		Password: GetEnv("DB_PASSWORD", "1234"),
		Database: GetEnv("DB_NAME", "techops_manager"),
	}
}

// GetEnv retrieves an environment variable or returns a default value.
func GetEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
