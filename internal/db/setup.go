package db

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	"techops-manager/internal/config"

	_ "github.com/go-sql-driver/mysql"
)

// InitDatabase establishes the connection pool and verifies the connection.
func InitDatabase(cfg config.DBConfig) *sql.DB {
	// Create DSN (Data Source Name)
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		cfg.User, cfg.Password, cfg.Host, cfg.Port, cfg.Database)

	var db *sql.DB
	var err error
	db, err = sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Test the connection
	if err = db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	// Set connection pool settings
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(25)
	db.SetConnMaxLifetime(5 * time.Minute)

	log.Println("Database connection pool initialized successfully.")

	// Create tables if they don't exist
	createTables(db)
	return db
}

// createTables ensures all necessary database tables exist.
func createTables(db *sql.DB) {
	// 1. Users table (Staff/Engineer)
	usersTable := `
	CREATE TABLE IF NOT EXISTS users (
		id VARCHAR(50) PRIMARY KEY,
		full_name VARCHAR(255) NOT NULL,
		email VARCHAR(255) UNIQUE NOT NULL,
		phone VARCHAR(20) NOT NULL,
		password VARCHAR(255) NOT NULL,
		role VARCHAR(50) DEFAULT 'User',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
		INDEX idx_email (email),
		INDEX idx_phone (phone)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`

	// 2. Customers table (Client Information)
	customersTable := `
	CREATE TABLE IF NOT EXISTS customers (
		customer_id VARCHAR(50) PRIMARY KEY,
		name VARCHAR(255) NOT NULL,
		email VARCHAR(255),
		phone VARCHAR(20) NOT NULL UNIQUE,
		address VARCHAR(255),
		city VARCHAR(100),
		state VARCHAR(100),
		zip VARCHAR(10),
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
		INDEX idx_customer_phone (phone)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`

	// 3. Device Details table (Equipment Information)
	deviceDetailsTable := `
	CREATE TABLE IF NOT EXISTS device_details (
		device_id VARCHAR(50) PRIMARY KEY,
		customer_id VARCHAR(50) NOT NULL,
		type VARCHAR(255),
		brand VARCHAR(255),
		model VARCHAR(255),
		serial_no VARCHAR(255),
		password VARCHAR(255),
		accessories_received TEXT,
		under_warranty BOOLEAN NOT NULL DEFAULT FALSE,
		warranty_no VARCHAR(255),
		warranty_exp_date DATE,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`

	// 4. Tickets table (Core Job and Status - Replaces old 'orders' table)
	ticketsTable := `
	CREATE TABLE IF NOT EXISTS tickets (
		ticket_id VARCHAR(50) PRIMARY KEY,
		customer_id VARCHAR(50) NOT NULL,
		device_id VARCHAR(50) NOT NULL,
		assigned_engineer_id VARCHAR(50),
		ticket_type ENUM('Diagnostics Call', 'Service Call') NOT NULL,
		issue_description TEXT NOT NULL,
		data_backup_consent ENUM('backed_up', 'no_backup_no_service', 'request_backup') NOT NULL,
		expected_delivery_date DATE,
		status ENUM('New Order', 'In Progress', 'Ready for Delivery', 'Delivered') DEFAULT 'New Order',
		total_cost DECIMAL(10,2) NOT NULL,
		created_by VARCHAR(50),
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
		last_updated_by VARCHAR(50),
		
		INDEX idx_ticket_status (status),
		FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE,
		FOREIGN KEY (device_id) REFERENCES device_details(device_id) ON DELETE CASCADE,
		FOREIGN KEY (assigned_engineer_id) REFERENCES users(id) ON DELETE SET NULL,
		FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
		FOREIGN KEY (last_updated_by) REFERENCES users(id) ON DELETE SET NULL
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`

	// 5. Order Line Items table (Billing Items)
	orderLineItemsTable := `
	CREATE TABLE IF NOT EXISTS order_line_items (
		item_id VARCHAR(50) PRIMARY KEY,
		ticket_id VARCHAR(50) NOT NULL,
		service_name VARCHAR(255) NOT NULL,
		rate DECIMAL(10,2) NOT NULL,
		discount_percent DECIMAL(5,2) DEFAULT 0.00,
		final_price DECIMAL(10,2) NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`

	// 6. Ticket History table (NEW Audit Log)
	ticketHistoryTable := `
	CREATE TABLE IF NOT EXISTS ticket_history (
		history_id VARCHAR(50) PRIMARY KEY,
		ticket_id VARCHAR(50) NOT NULL,
		field_name VARCHAR(100) NOT NULL,
		old_value VARCHAR(255),
		new_value VARCHAR(255),
		updated_by VARCHAR(50) NOT NULL, 
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		
		FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE,
		FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT,
		INDEX idx_ticket_id (ticket_id)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`

	// 7. Password Reset OTP table
	passwordResetOTPsTable := `
    CREATE TABLE IF NOT EXISTS password_reset_otps (
        email VARCHAR(255) PRIMARY KEY,
        otp_code VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        INDEX idx_otp_expiry (expires_at)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`

	// 8. Ticket Vendors table (Handling Outsourcing)
    ticketVendorsTable := `
    CREATE TABLE IF NOT EXISTS ticket_vendors (
        id VARCHAR(50) PRIMARY KEY,
        ticket_id VARCHAR(50) NOT NULL,
        vendor_name VARCHAR(255) NOT NULL,
        reason TEXT,
        outsourced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        received_at TIMESTAMP NULL,
        
        -- Future-proofing fields
        contact_person VARCHAR(255),
        phone VARCHAR(20),
        address TEXT,
        
        created_by VARCHAR(50),
        FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_vendor_ticket_id (ticket_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`

	// Execute table creation in order
	if _, err := db.Exec(usersTable); err != nil {
		log.Fatalf("Failed to create users table: %v", err)
	}
	if _, err := db.Exec(customersTable); err != nil {
		log.Fatalf("Failed to create customers table: %v", err)
	}
	if _, err := db.Exec(deviceDetailsTable); err != nil {
		log.Fatalf("Failed to create device_details table: %v", err)
	}
	if _, err := db.Exec(ticketsTable); err != nil {
		log.Fatalf("Failed to create tickets table: %v", err)
	}
	if _, err := db.Exec(orderLineItemsTable); err != nil {
		log.Fatalf("Failed to create order_line_items table: %v", err)
	}
	if _, err := db.Exec(ticketHistoryTable); err != nil {
		log.Fatalf("Failed to create ticket_history table: %v", err)
	}
	if _, err := db.Exec(passwordResetOTPsTable); err != nil {
		log.Fatalf("Failed to create password_reset_otps table: %v", err)
	}
	if _, err := db.Exec(ticketVendorsTable); err != nil {
        log.Fatalf("Failed to create ticket_vendors table: %v", err)
    }

	log.Println("Database tables created/verified successfully.")
}
