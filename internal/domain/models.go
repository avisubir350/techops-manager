package domain

import (
	"fmt"
	"time"
)

// --- User Domain Models (Updated JSON Tags) ---

// User represents a user account in the system (Staff/Engineer)
type User struct {
	ID        string    `json:"id" db:"id"`
	FullName  string    `json:"fullName" db:"full_name"`
	Email     string    `json:"email" db:"email"`
	Phone     string    `json:"phone" db:"phone"`
	Password  string    `json:"password" db:"password"`
	Role      string    `json:"role" db:"role"`
	CreatedAt time.Time `json:"createdAt" db:"created_at"`
	UpdatedAt time.Time `json:"updatedAt" db:"updated_at"`
}

// --- Ticket/Order Domain Models (Updated JSON Tags) ---

// Customer represents the structure of Client Information
type Customer struct {
	ID      string `json:"customerId" db:"customer_id"`
	Name    string `json:"name" db:"name"`
	Email   string `json:"email" db:"email"`
	Phone   string `json:"phone" db:"phone"`
	Address string `json:"address" db:"address"`
	City    string `json:"city" db:"city"`
	State   string `json:"state" db:"state"`
	Zip     string `json:"zip" db:"zip"`
}

// DeviceDetail represents the structure of Equipment Information
type DeviceDetail struct {
	ID              string    `json:"deviceId" db:"device_id"`
	Type            string    `json:"deviceType" db:"type"`
	Brand           string    `json:"deviceBrand" db:"brand"`
	Model           string    `json:"deviceModel" db:"model"`
	SerialNo        string    `json:"deviceSerialNo" db:"serial_no"`
	Password        string    `json:"devicePassword" db:"password"`
	Accessories     string    `json:"accessoriesReceived" db:"accessories_received"`
	UnderWarranty   bool      `json:"underWarranty" db:"under_warranty"`
	WarrantyNo      string    `json:"warrantyNo" db:"warranty_no"`
	WarrantyExpDate time.Time `json:"warrantyExpDate" db:"warranty_exp_date"`
	CustomerID      string    `json:"customerId" db:"customer_id"`
}

// LineItem represents a single service or part charged on a ticket
type LineItem struct {
	ID              string  `json:"itemId" db:"item_id"`
	TicketID        string  `json:"ticketId" db:"ticket_id"`
	ServiceName     string  `json:"serviceName" db:"service_name"`
	Rate            float64 `json:"rate" db:"rate"`
	DiscountPercent float64 `json:"discountPercent" db:"discount_percent"`
	FinalPrice      float64 `json:"finalPrice" db:"final_price"`
}

// TicketInput is the aggregate structure for receiving a new ticket via API
// (This struct was already consistent in camelCase)
type TicketInput struct {
	CustomerName         string     `json:"customerName"`
	CustomerEmail        string     `json:"customerEmail"`
	CustomerPhone        string     `json:"customerPhone"`
	CustomerAddress      string     `json:"customerAddress"`
	CustomerCity         string     `json:"customerCity"`
	CustomerState        string     `json:"customerState"`
	CustomerZip          string     `json:"customerZip"`
	DeviceType           string     `json:"deviceType"`
	DeviceBrand          string     `json:"deviceBrand"`
	DeviceModelNo        string     `json:"deviceModelNo"`
	DeviceSerialNo       string     `json:"deviceSerialNo"`
	DevicePassword       string     `json:"devicePassword"`
	AccessoriesReceived  string     `json:"accessoriesReceived"`
	TicketType           string     `json:"ticketType"`
	AssignedEngineerID   string     `json:"engineerId"`
	IssueDescription     string     `json:"issueDescription"`
	DataBackup           string     `json:"dataBackup"`
	UnderWarranty        bool       `json:"underWarranty"`
	WarrantyNo           string     `json:"warrantyNo"`
	WarrantyExpDate      string     `json:"warrantyExpDate"`
	ExpectedDeliveryDate string     `json:"expectedDeliveryDate"`
	ServiceLineItems     []LineItem `json:"serviceLineItems"`
	TotalCost            float64    `json:"totalCost"`
	CreatedBy            string     `json:"createdBy"`
	LastUpdatedBy       string     	`json:"lastUpdatedBy"`
	Status               string     `json:"status"`
	// Outsourcing Info (Optional during creation)
    VendorName           string     `json:"vendorName"`
    VendorReason         string     `json:"vendorReason"`
}

// Ticket is a simplified structure for retrieving joined data (replaces old Order struct)
type Ticket struct {
	ID                   string    `json:"id" db:"id"`
	CustomerName         string    `json:"customerName"`
	CustomerPhone        string    `json:"customerPhone"`
	CustomerEmail        string    `json:"customerEmail"`
	CustomerAddress      string    `json:"customerAddress"`
	CustomerCity         string    `json:"customerCity"`
	CustomerState        string    `json:"customerState"`
	CustomerZip          string    `json:"customerZip"`
	DeviceType           string    `json:"deviceType"`
	DeviceBrand          string    `json:"deviceBrand"`
	DeviceModel          string    `json:"deviceModel"`
	DeviceSerialNo      string    `json:"deviceSerialNo"`
	AccessoriesReceived  string    `json:"accessoriesReceived"`
	UnderWarranty       bool      `json:"underWarranty"`
	WarrantyNo          string    `json:"warrantyNo"`
	WarrantyExpDate     *time.Time `json:"warrantyExpDate"`
	Status               string    `json:"status"`
	TotalCost            float64   `json:"totalCost"`
	CreatedBy            string    `json:"createdBy"`
	CreatedAt            time.Time `json:"createdAt"`
	UpdatedAt            time.Time `json:"updatedAt"`
	AssignedEngineerID   string    `json:"assignedEngineerID" db:"assigned_engineer_id"`
	AssignedEngineerName string    `json:"assignedEngineerName"`
	TicketType          string    `json:"ticketType"`
	DataBackupConsent   string    `json:"dataBackupConsent"`
	LastUpdatedBy       string    `json:"lastUpdatedBy"`
	ExpectedDeliveryDate string    `json:"expectedDeliveryDate"`
	IssueDescription     string    `json:"issueDescription"`
	ServiceLineItems     []LineItem      `json:"serviceLineItems"`
    History              []TicketHistory `json:"history"`
    VendorHistory        []TicketVendor  `json:"vendorHistory"`
    CurrentVendorName    string          `json:"currentVendorName"`
}

// DashboardMetrics holds the aggregated data for the operational dashboard.
type DashboardMetrics struct {
	TotalOpenOrders  int     `json:"totalOpenOrders"`
	ReadyForDelivery int     `json:"readyForDelivery"`
	TotalRevenueYTD  float64 `json:"totalRevenueYTD"`
}

// Helper function to generate IDs
func GenerateID(prefix string) string {
	return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano())
}

// PaginationInput holds parameters for Pagination, Sorting, Searching, and Filtering.
type PaginationInput struct {
	Page      int
	Limit     int
	SortBy    string // e.g., "created_at"
	SortOrder string // e.g., "DESC"
	Search    string // Global search term

	// Generic Filtering: Key is the column name, Value is the filter value.
	// Example: {"status": "New Order"}, {"customer_name": "John"}
	Filters map[string]string
}

// PaginatedTickets holds the results and metadata for a paginated response.
type PaginatedTickets struct {
	Tickets      []Ticket `json:"tickets"`
	TotalRecords int      `json:"totalRecords"` // Total number of records across all pages
	TotalPages   int      `json:"totalPages"`
	CurrentPage  int      `json:"currentPage"`
	Limit        int      `json:"limit"`
}

// TicketHistory represents an audit log entry for changes made to a ticket
type TicketHistory struct {
    ID            string    `json:"id" db:"history_id"`
    TicketID      string    `json:"ticketId" db:"ticket_id"`
    FieldName     string    `json:"fieldName" db:"field_name"`
    OldValue      string    `json:"oldValue" db:"old_value"`
    NewValue      string    `json:"newValue" db:"new_value"`
    UpdatedByName string    `json:"updatedByName"` // From Join
    UpdatedAt     time.Time `json:"updatedAt" db:"updated_at"`
}

type OrderMetrics struct {
    OverdueCount    int `json:"overdueCount"`
    InProgressCount int `json:"inProgressCount"`
    ReadyCount      int `json:"readyCount"`
}

// ForgotPasswordReq is used for the initial Step 1: Requesting an OTP via Email
type ForgotPasswordReq struct {
	Email string `json:"email" binding:"required,email"`
}

// ResetPasswordOTPReq is used for Step 2: Submitting the OTP and the New Password
type ResetPasswordOTPReq struct {
	Email       string `json:"email" binding:"required"`
	OTP         string `json:"otp" binding:"required,len=6"`
	NewPassword string `json:"newPassword" binding:"required,min=6"`
}

// OTPRecord represents the internal database structure for the password_reset_otps table
type OTPRecord struct {
	Email     string    `db:"email"`
	OTPCode   string    `db:"otp_code"`
	ExpiresAt time.Time `db:"expires_at"`
}

// TicketVendor represents the tracking record for a device sent to an external vendor
type TicketVendor struct {
    ID            string     `json:"id" db:"id"`
    TicketID      string     `json:"ticketId" db:"ticket_id"`
    VendorName    string     `json:"vendorName" db:"vendor_name"`
    Reason        string     `json:"reason" db:"reason"`
    OutsourcedAt  time.Time  `json:"outsourcedAt" db:"outsourced_at"`
    ReceivedAt    *time.Time `json:"receivedAt" db:"received_at"` // Pointer handles NULL in DB
    CreatedBy     string     `json:"createdBy" db:"created_by"`
    
    // Future-proofing fields (hidden from main JSON responses for now)
    ContactPerson string     `json:"-" db:"contact_person"`
    Phone         string     `json:"-" db:"phone"`
    Address       string     `json:"-" db:"address"`
}