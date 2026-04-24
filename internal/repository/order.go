package repository

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"math"
	"strings"
	"time"

	"techops-manager/internal/domain"
)

// Global map for secure column filtering/sorting mapping
var filterableColumns = map[string]string{
	// API Key (query param) -> DB Column Name/Expression
	"ticket_id":              "t.ticket_id",
	"customer_name":          "c.name",
	"customer_phone":         "c.phone",
	"assigned_engineer_id":   "t.assigned_engineer_id",
	"assigned_engineer_name": "u.full_name",
	"device_type":            "d.type",
	"device_model":           "d.model",
	"status":                 "t.status",
	"total_cost":             "t.total_cost",
	"created_by":             "t.created_by",
	"created_at":             "t.created_at",
	"updated_at":             "t.updated_at",
	"expected_delivery_date": "t.expected_delivery_date",
}

var sortableColumns = map[string]string{
	"created_at":    "t.created_at",
	"updated_at":    "t.updated_at",
	"total_cost":    "t.total_cost",
	"status":        "t.status",
	"customer_name": "c.name",
	"assigned_engineer_name":     "u.full_name",
	"expected_delivery_date": "t.expected_delivery_date",
	"id":    "t.ticket_id",
}

// OrderRepository handles database operations for the Ticket/Order domain.
type OrderRepository struct {
	db *sql.DB
}

// NewOrderRepository creates a new OrderRepository.
func NewOrderRepository(database *sql.DB) *OrderRepository {
	return &OrderRepository{db: database}
}

// GetAllOrders retrieves all tickets with SFS and pagination.
func (r *OrderRepository) GetAllOrders(p domain.PaginationInput) (*domain.PaginatedTickets, error) {
	// 1. Pagination Defaults
	if p.Page <= 0 {
		p.Page = 1
	}
	if p.Limit <= 0 {
		p.Limit = 20
	}
	offset := (p.Page - 1) * p.Limit

	// Base query structure
	baseQuery := `
        FROM tickets t
        JOIN customers c ON t.customer_id = c.customer_id
        JOIN device_details d ON t.device_id = d.device_id
        JOIN users u ON t.assigned_engineer_id = u.id
    `

	var conditions []string
	var args []interface{}

	// --- 2. Build WHERE Clause Components ---

	// Handle the Outsourced filter specifically first (or inside the loop)
	if val, ok := p.Filters["isOutsourced"]; ok {
		if val == "true" {
			// Condition: There exists an entry in ticket_vendors that hasn't been received yet
			conditions = append(conditions, "EXISTS (SELECT 1 FROM ticket_vendors WHERE ticket_id = t.ticket_id AND received_at IS NULL)")
		} else if val == "false" {
			// Condition: No active (unreceived) vendor records exist
			conditions = append(conditions, "NOT EXISTS (SELECT 1 FROM ticket_vendors WHERE ticket_id = t.ticket_id AND received_at IS NULL)")
		}
    	// Delete it from the map so the generic loop below doesn't try to process it
    	delete(p.Filters, "isOutsourced")
	}

	// 2a. Generic Filters Construction (The simple key-value approach)
	for filterKey, filterValue := range p.Filters {
		// 1. Date Range Filtering (Using _start and _end suffixes)
		if strings.HasSuffix(filterKey, "_start") {
			dbCol := strings.TrimSuffix(filterKey, "_start")
			if mappedCol, ok := filterableColumns[dbCol]; ok {
				conditions = append(conditions, mappedCol+" >= ?")
				args = append(args, filterValue)
			}
		} else if strings.HasSuffix(filterKey, "_end") {
			dbCol := strings.TrimSuffix(filterKey, "_end")
			if mappedCol, ok := filterableColumns[dbCol]; ok {
        	finalVal := filterValue
        	if (dbCol == "created_at" || dbCol == "updated_at") && len(filterValue) == 10 {
            	finalVal = filterValue + " 23:59:59"
        	}

        	conditions = append(conditions, mappedCol+" <= ?")
        	args = append(args, finalVal)
    	}

			// 2. Standard Column Filtering
		} else if mappedCol, ok := filterableColumns[filterKey]; ok {
			if strings.Contains(filterKey, "name") || strings.Contains(filterKey, "model") || strings.Contains(filterKey, "type") {
				// Apply LIKE for string columns (fuzzy search)
				conditions = append(conditions, mappedCol+" LIKE ?")
				args = append(args, "%"+filterValue+"%")
			} else {
				// Apply strict equality for IDs, status, exact cost
				conditions = append(conditions, mappedCol+" = ?")
				args = append(args, filterValue)
			}
		}
	}

	// 2b. Global Search
	if p.Search != "" {
		searchTerm := "%" + p.Search + "%"
		searchCondition := `(c.name LIKE ?  OR c.phone LIKE ?)`
		conditions = append(conditions, searchCondition)
		args = append(args, searchTerm, searchTerm)
	}

	// 3. Assemble Final WHERE Clause
	whereClause := ""
	if len(conditions) > 0 {
		// Join all conditions (filters + search) with AND
		whereClause = " WHERE (" + strings.Join(conditions, " AND ") + ")"
	}

	// --- 4. Get Total Count ---
	var totalRecords int
	countQuery := "SELECT COUNT(t.ticket_id)" + baseQuery + whereClause
	if err := r.db.QueryRow(countQuery, args...).Scan(&totalRecords); err != nil {
		return nil, fmt.Errorf("failed to get filtered ticket count: %w", err)
	}

	// --- 5. Build SELECT Query with Sorting and Pagination ---
	selectFields := `
        t.ticket_id, c.name, c.phone, t.assigned_engineer_id, u.full_name, d.type, d.model,
        t.status, t.total_cost, t.created_by, t.created_at, t.updated_at, t.expected_delivery_date,
        (SELECT vendor_name FROM ticket_vendors WHERE ticket_id = t.ticket_id AND received_at IS NULL LIMIT 1) as current_vendor
    `
	dataQuery := "SELECT " + selectFields + baseQuery + whereClause

	// Sorting
	orderByClause := " ORDER BY t.updated_at DESC" // Default sort
	if dbCol, ok := sortableColumns[p.SortBy]; ok {
		order := "DESC"
		if strings.ToUpper(p.SortOrder) == "ASC" {
			order = "ASC"
		}
		orderByClause = fmt.Sprintf(" ORDER BY %s %s", dbCol, order)
	}

	// Final Query Assembly (Add LIMIT and OFFSET)
	dataQuery += orderByClause
	dataQuery += " LIMIT ? OFFSET ?"

	// Append LIMIT and OFFSET to the arguments list
	queryArgs := append(args, p.Limit, offset)
	
	// 6. Execute the final data query
	rows, err := r.db.Query(dataQuery, queryArgs...)
	if err != nil {
		return nil, fmt.Errorf("failed to execute data query: %w", err)
	}
	defer rows.Close()

	tickets := []domain.Ticket{}
	for rows.Next() {
		var t domain.Ticket
		var createdBySQL sql.NullString
		var currentVendorSQL sql.NullString

		// Scan logic (using the existing fields)
		err := rows.Scan(
            &t.ID, &t.CustomerName, &t.CustomerPhone, &t.AssignedEngineerID, &t.AssignedEngineerName, &t.DeviceType, &t.DeviceModel,
            &t.Status, &t.TotalCost, &createdBySQL, &t.CreatedAt, &t.UpdatedAt, &t.ExpectedDeliveryDate,
            &currentVendorSQL)

		if err != nil {
			log.Printf("Error scanning ticket row: %v", err)
			continue
		}
		t.CreatedBy = createdBySQL.String
		t.CurrentVendorName = currentVendorSQL.String
		tickets = append(tickets, t)
	}

	// 7. Calculate Metadata and Return
	totalPages := int(math.Ceil(float64(totalRecords) / float64(p.Limit)))

	return &domain.PaginatedTickets{
		Tickets:      tickets,
		TotalRecords: totalRecords,
		TotalPages:   totalPages,
		CurrentPage:  p.Page,
		Limit:        p.Limit,
	}, nil
}

// CreateTicket performs the multi-table transaction to insert a new ticket.
func (r *OrderRepository) CreateTicket(input *domain.TicketInput) (string, error) {
	tx, err := r.db.Begin()
	if err != nil {
		return "", err
	}
	// ... (defer function remains the same) ...
	defer func() {
        if r := recover(); r != nil {
                _ = tx.Rollback()
                log.Printf("Transaction panicked and rolled back: %v", r)
        } else if err != nil {
                _ = tx.Rollback()
                log.Printf("Transaction failed and rolled back: %v", err)
        } else {
                err = tx.Commit()
                if err != nil {
                        log.Printf("Transaction commit failed: %v", err)
                }
        }
      }()
	var existingCustomerID string

	// Select the customer_id based on the phone number
	checkQuery := "SELECT customer_id FROM customers WHERE phone = ?"

	row := tx.QueryRow(checkQuery, input.CustomerPhone)

	scanErr := row.Scan(&existingCustomerID)

	var finalCustomerID string

	if scanErr == sql.ErrNoRows {
		// Customer DOES NOT exist, so we insert a new record.

		customerID := domain.GenerateID("CUST")

		// 2. Insert into CUSTOMERS
		customerQuery := `
            INSERT INTO customers (customer_id, name, email, phone, address, city, state, zip)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
		_, err = tx.Exec(customerQuery, customerID, input.CustomerName, input.CustomerEmail,
			input.CustomerPhone, input.CustomerAddress, input.CustomerCity,
			input.CustomerState, input.CustomerZip)
		if err != nil {
			return "", fmt.Errorf("failed to insert new customer: %w", err)
		}

		finalCustomerID = customerID

	} else if scanErr != nil {
		return "", fmt.Errorf("failed to check for existing customer: %w", scanErr)

	} else {
		// Customer DOES exist, so we REUSE the existingCustomerID.
		updateCustomerQuery := `
            UPDATE customers 
            SET name = ?, email = ?, address = ?, city = ?, state = ?, zip = ?, updated_at = NOW()
            WHERE customer_id = ?
        `
        _, err = tx.Exec(updateCustomerQuery, 
            input.CustomerName, input.CustomerEmail, input.CustomerAddress, 
            input.CustomerCity, input.CustomerState, input.CustomerZip, 
            existingCustomerID)
        
        if err != nil {
            return "", fmt.Errorf("failed to update existing customer details: %w", err)
        }
        finalCustomerID = existingCustomerID
	}

	// Generate other necessary IDs
	deviceID := domain.GenerateID("DEV")
	ticketID := domain.GenerateID("TICKET")

	// Handle date parsing
	// Handle date parsing with NULL support
	var warrantyExpDate sql.NullTime
	if input.WarrantyExpDate != "" {
		parsedDate, err := time.Parse("2006-01-02", input.WarrantyExpDate)
		if err == nil {
			warrantyExpDate = sql.NullTime{Time: parsedDate, Valid: true}
		} else {
			// If the date is invalid, we keep it as Null
			warrantyExpDate = sql.NullTime{Valid: false}
		}
	} else {
		// If string is empty, set to NULL
		warrantyExpDate = sql.NullTime{Valid: false}
	}

	// Do the same for Expected Delivery Date if it's optional
	var expectedDeliveryDate sql.NullTime
	if input.ExpectedDeliveryDate != "" {
		parsed, _ := time.Parse("2006-01-02", input.ExpectedDeliveryDate)
		expectedDeliveryDate = sql.NullTime{Time: parsed, Valid: true}
	}

	deviceQuery := `
        INSERT INTO device_details (device_id, customer_id, type, brand, model, serial_no, password, accessories_received, under_warranty, warranty_no, warranty_exp_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
	_, err = tx.Exec(deviceQuery, deviceID, finalCustomerID, input.DeviceType, input.DeviceBrand,
		input.DeviceModelNo, input.DeviceSerialNo, input.DevicePassword,
		input.AccessoriesReceived, input.UnderWarranty, input.WarrantyNo, warrantyExpDate)
	if err != nil {
		return "", fmt.Errorf("failed to insert device details: %w", err)
	}

	var calculatedTotalCost float64
	for _, item := range input.ServiceLineItems {
		calculatedTotalCost += item.FinalPrice
	}
	ticketQuery := `
        INSERT INTO tickets (ticket_id, customer_id, device_id, assigned_engineer_id, ticket_type,
                             issue_description, data_backup_consent, expected_delivery_date, status,
                             total_cost, created_by, created_at, updated_at, last_updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?)
    `
	_, err = tx.Exec(ticketQuery, ticketID, finalCustomerID, deviceID, input.AssignedEngineerID, input.TicketType,
		input.IssueDescription, input.DataBackup, expectedDeliveryDate, "New Order",
		calculatedTotalCost, input.CreatedBy, input.CreatedBy)
	if err != nil {
		return "", fmt.Errorf("failed to insert ticket: %w", err)
	}

	lineItemQuery := `
        INSERT INTO order_line_items (item_id, ticket_id, service_name, rate, discount_percent, final_price)
        VALUES (?, ?, ?, ?, ?, ?)
    `
	for i, item := range input.ServiceLineItems {
		itemID := fmt.Sprintf("%s-ITEM-%d", ticketID, i+1)
		_, err = tx.Exec(lineItemQuery, itemID, ticketID, item.ServiceName, item.Rate, item.DiscountPercent, item.FinalPrice)
		if err != nil {
			return "", fmt.Errorf("failed to insert line item %d: %w", i+1, err)
		}
	}

	// Handle initial Vendor Outsourcing if provided
    if input.VendorName != "" {
        vendorID := domain.GenerateID("VND")
        vendorQuery := `
            INSERT INTO ticket_vendors (id, ticket_id, vendor_name, reason, created_by)
            VALUES (?, ?, ?, ?, ?)
        `
        _, err = tx.Exec(vendorQuery, vendorID, ticketID, input.VendorName, input.VendorReason, input.CreatedBy)
        if err != nil {
            return "", fmt.Errorf("failed to insert initial vendor info: %w", err)
        }

        // Log to unified history
        if err := logHistory(tx, ticketID, "Outsourced", "Internal", input.VendorName + " (Reason: "+input.VendorReason+")", input.CreatedBy); err != nil {
            return "", fmt.Errorf("failed to log vendor history: %w", err)
        }
    }

	return ticketID, nil
}

// OutsourceTicket assigns a ticket to an external vendor
func (r *OrderRepository) OutsourceTicket(ticketID string, vendorName string, reason string, userID string) error {
    tx, err := r.db.Begin()
    if err != nil {
        return err
    }
   defer func() { _ = tx.Rollback() }()
    // 1. Just "touch" the ticket to update its timestamp and last editor
    ticketTouch := `UPDATE tickets SET updated_at = NOW(), last_updated_by = ? WHERE ticket_id = ?`
    if _, err := tx.Exec(ticketTouch, userID, ticketID); err != nil {
        return err
    }

    // 2. Create the Vendor record
    vendorID := domain.GenerateID("VND")
    vendorQuery := `INSERT INTO ticket_vendors (id, ticket_id, vendor_name, reason, created_by) VALUES (?, ?, ?, ?, ?)`
    if _, err := tx.Exec(vendorQuery, vendorID, ticketID, vendorName, reason, userID); err != nil {
        return err
    }

    // 3. Log strictly to the History table
    // Old value: Internal, New value: Vendor Name + Reason
    if err := logHistory(tx, ticketID, "Outsourced", "Internal", fmt.Sprintf("%s (%s)", vendorName, reason), userID); err != nil {
        return err
    }

    return tx.Commit()
}

// ReceiveFromVendor marks the device as returned from the vendor
func (r *OrderRepository) ReceiveFromVendor(ticketID string, userID string) error {
    tx, err := r.db.Begin()
    if err != nil {
        return err
    }
    defer tx.Rollback()

    // 1. Get current vendor name for the log before closing
    var vendorName string
    err = tx.QueryRow(`SELECT vendor_name FROM ticket_vendors WHERE ticket_id = ? AND received_at IS NULL LIMIT 1`, ticketID).Scan(&vendorName)
    if err != nil {
        return fmt.Errorf("no active vendor tracking found: %w", err)
    }

    // 2. Close the vendor record
    if _, err := tx.Exec(`UPDATE ticket_vendors SET received_at = NOW() WHERE ticket_id = ? AND received_at IS NULL`, ticketID); err != nil {
        return err
    }

    // 3. Touch the ticket timestamp
    if _, err := tx.Exec(`UPDATE tickets SET updated_at = NOW(), last_updated_by = ? WHERE ticket_id = ?`, userID, ticketID); err != nil {
        return err
    }

    // 4. Log the return
    if err := logHistory(tx, ticketID, "Vendor Return", vendorName, "Internal", userID); err != nil {
        return err
    }

    return tx.Commit()
}

// UpdateTicket handles the transaction to update ticket details and log history.
// It requires the current userID (last_updated_by) for the audit log.
func (r *OrderRepository) UpdateTicket(ticketID string, input *domain.TicketInput, userID string) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
			log.Printf("Transaction panicked and rolled back: %v", r)
		} else if err != nil {
			tx.Rollback()
			log.Printf("Transaction failed and rolled back: %v", err)
		} else {
			err = tx.Commit()
			if err != nil {
				log.Printf("Transaction commit failed: %v", err)
			}
		}
	}()

	oldTicket, err := r.GetTicketByID(ticketID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("ticket not found: %s", ticketID)
		}
		return fmt.Errorf("failed to fetch old ticket data: %w", err)
	}

	var historyErr error
	newTotalCost := oldTicket.TotalCost
	var itemsAddedCount int

	if len(input.ServiceLineItems) > 0 {
		var newItemsCost float64
		lineItemQuery := `
            INSERT INTO order_line_items (item_id, ticket_id, service_name, rate, discount_percent, final_price)
            VALUES (?, ?, ?, ?, ?, ?)
        `
		for i, item := range input.ServiceLineItems {
			if item.ID != "" {
				continue // Skip existing items as they are immutable and already in the DB.
			}

			// If we reach here, the item is NEW.
			itemID := domain.GenerateID("ITEM")
			newItemsCost += item.FinalPrice

			_, err = tx.Exec(lineItemQuery, itemID, ticketID, item.ServiceName, item.Rate, item.DiscountPercent, item.FinalPrice)
			if err != nil {
				return fmt.Errorf("failed to insert new line item %d: %w", i+1, err)
			}
			itemsAddedCount++
		}

		if itemsAddedCount > 0 {
			newTotalCost = oldTicket.TotalCost + newItemsCost
		}

		if itemsAddedCount > 0 && newTotalCost != oldTicket.TotalCost {
			if err := logHistory(tx, ticketID, "total_cost", fmt.Sprintf("%.2f", oldTicket.TotalCost), fmt.Sprintf("%.2f", newTotalCost), userID); err != nil {
				return err
			}
		}
	}

	if oldTicket.AssignedEngineerID != input.AssignedEngineerID {
		historyErr = logHistory(tx, ticketID, "assigned_engineer_id", oldTicket.AssignedEngineerID, input.AssignedEngineerID, userID)
		if historyErr != nil {
			return historyErr
		}
	}

	if oldTicket.Status != input.Status {
		historyErr = logHistory(tx, ticketID, "status", oldTicket.Status, input.Status, userID)
		if historyErr != nil {
			return historyErr
		}
	}

	existingDateStr := ""
    if oldTicket.ExpectedDeliveryDate != "" {
        if len(oldTicket.ExpectedDeliveryDate) >= 10 {
            existingDateStr = oldTicket.ExpectedDeliveryDate[:10]
        }
    }

    inputDateStr := ""
    if input.ExpectedDeliveryDate != "" {
        if len(input.ExpectedDeliveryDate) >= 10 {
            inputDateStr = input.ExpectedDeliveryDate[:10]
        }
    }

    if inputDateStr != "" && existingDateStr != inputDateStr {
        historyErr = logHistory(tx, ticketID, "expected_delivery_date", existingDateStr, inputDateStr, userID)
        if historyErr != nil { return historyErr }
    }

	if oldTicket.IssueDescription != input.IssueDescription {
		historyErr = logHistory(tx, ticketID, "issue_description", oldTicket.IssueDescription, input.IssueDescription, userID)
		if historyErr != nil {
			return historyErr
		}
	}

	updateTicketQuery := `
        UPDATE tickets SET
            assigned_engineer_id = ?,
            status = ?,
            expected_delivery_date = ?,
            issue_description = ?,
            total_cost = ?,
            last_updated_by = ?,
            updated_at = NOW()
        WHERE ticket_id = ?
    `
	_, err = tx.Exec(updateTicketQuery,
		input.AssignedEngineerID,
		input.Status,
		input.ExpectedDeliveryDate,
		input.IssueDescription,
		newTotalCost,
		userID,
		ticketID,
	)
	if err != nil {
		return fmt.Errorf("failed to update tickets table: %w", err)
	}

	return nil
}

// GetTicketByID retrieves a single ticket and related customer/device information.
func (r *OrderRepository) GetTicketByID(ticketID string) (*domain.Ticket, error) {
	var t domain.Ticket
	query := `
        SELECT
            t.ticket_id, c.name, c.phone, c.email, c.address, c.city, c.state, c.zip,
			d.type, d.brand, d.model, d.serial_no, d.accessories_received, d.under_warranty, d.warranty_no, d.warranty_exp_date,
			t.assigned_engineer_id, u.full_name, t.ticket_type, t.data_backup_consent, t.last_updated_by,
            t.status, t.total_cost, 
            t.created_by, t.created_at, t.updated_at,
            t.expected_delivery_date, t.issue_description
        FROM tickets t
        JOIN customers c ON t.customer_id = c.customer_id
        JOIN device_details d ON t.device_id = d.device_id
		JOIN users u ON t.assigned_engineer_id = u.id
        WHERE t.ticket_id = ?
    `

	row := r.db.QueryRow(query, ticketID)

	err := row.Scan(
		&t.ID,
		&t.CustomerName,
		&t.CustomerPhone,
		&t.CustomerEmail,
		&t.CustomerAddress,
		&t.CustomerCity,
		&t.CustomerState,
		&t.CustomerZip,
		&t.DeviceType,
		&t.DeviceBrand,
		&t.DeviceModel,
		&t.DeviceSerialNo,
		&t.AccessoriesReceived,
		&t.UnderWarranty,
		&t.WarrantyNo,
		&t.WarrantyExpDate,
		&t.AssignedEngineerID,
		&t.AssignedEngineerName,
		&t.TicketType,
		&t.DataBackupConsent,
		&t.LastUpdatedBy,
		&t.Status,
		&t.TotalCost,
		&t.CreatedBy,
		&t.CreatedAt,
		&t.UpdatedAt,
		&t.ExpectedDeliveryDate,
		&t.IssueDescription,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("ticket with ID %s not found: %w", ticketID, err)
		}
		log.Printf("Error scanning ticket row for ID %s: %v", ticketID, err)
		return nil, fmt.Errorf("database query failed for ticket ID %s: %w", ticketID, err)
	}

	t.ServiceLineItems = make([]domain.LineItem, 0)
	itemQuery := `SELECT item_id, service_name, rate, discount_percent, final_price FROM order_line_items WHERE ticket_id = ?`
	
	itemRows, err := r.db.Query(itemQuery, ticketID)
	if err != nil {
		log.Printf("Error fetching line items for ticket %s: %v", ticketID, err)
	} else {
		defer itemRows.Close()
		for itemRows.Next() {
			var item domain.LineItem
			if err := itemRows.Scan(&item.ID, &item.ServiceName, &item.Rate, &item.DiscountPercent, &item.FinalPrice); err == nil {
				t.ServiceLineItems = append(t.ServiceLineItems, item)
			}
		}
	}

	t.History = make([]domain.TicketHistory, 0)
	historyQuery := `
		SELECT h.history_id, h.field_name, h.old_value, h.new_value, h.updated_at, COALESCE(u.full_name, 'System')
		FROM ticket_history h
		LEFT JOIN users u ON h.updated_by = u.id
		WHERE h.ticket_id = ?
		ORDER BY h.updated_at DESC
	`

	historyRows, err := r.db.Query(historyQuery, ticketID)
	if err != nil {
		log.Printf("Error fetching history for ticket %s: %v", ticketID, err)
	} else {
		defer historyRows.Close()
		for historyRows.Next() {
			var h domain.TicketHistory
			if err := historyRows.Scan(&h.ID, &h.FieldName, &h.OldValue, &h.NewValue, &h.UpdatedAt, &h.UpdatedByName); err == nil {
				t.History = append(t.History, h)
			}
		}
	}

	// --- Fetch Specific Vendor Tracking Records ---
    t.VendorHistory = make([]domain.TicketVendor, 0)
    vendorQuery := `
        SELECT id, vendor_name, reason, outsourced_at, received_at, created_by
        FROM ticket_vendors
        WHERE ticket_id = ?
        ORDER BY outsourced_at DESC
    `
    vRows, err := r.db.Query(vendorQuery, ticketID)
    if err != nil {
        log.Printf("Error fetching vendor history for ticket %s: %v", ticketID, err)
    } else {
        defer vRows.Close()
        for vRows.Next() {
            var v domain.TicketVendor
            if err := vRows.Scan(&v.ID, &v.VendorName, &v.Reason, &v.OutsourcedAt, &v.ReceivedAt, &v.CreatedBy); err == nil {
                t.VendorHistory = append(t.VendorHistory, v)
                
                // Identify current location for the detail view header
                if v.ReceivedAt == nil {
                    t.CurrentVendorName = v.VendorName
                }
            }
        }
    }

	return &t, nil
}

// GetOrdersByStatus is a placeholder.
func (r *OrderRepository) GetOrdersByStatus(status string) ([]domain.Ticket, error) {
	// For now, return an empty slice and an error indicating it needs full implementation
	return []domain.Ticket{}, fmt.Errorf("GetOrdersByStatus not fully implemented")
}

// logHistory inserts a single record into the ticket_history table within the transaction.
func logHistory(tx *sql.Tx, ticketID, fieldName, oldValue, newValue, userID string) error {
	historyID := domain.GenerateID("HIST")
	query := `
        INSERT INTO ticket_history (history_id, ticket_id, field_name, old_value, new_value, updated_by)
        VALUES (?, ?, ?, ?, ?, ?)
    `
	_, err := tx.Exec(query, historyID, ticketID, fieldName, oldValue, newValue, userID)
	return err
}

func (r *OrderRepository) GetDashboardMetrics() (*domain.OrderMetrics, error) {
    query := `
        SELECT 
            COUNT(CASE WHEN expected_delivery_date <= CURDATE() AND status NOT IN ('Delivered') THEN 1 END) as overdue,
            COUNT(CASE WHEN status = 'In Progress' THEN 1 END) as in_progress,
            COUNT(CASE WHEN status = 'Ready for Delivery' THEN 1 END) as ready
        FROM tickets`
    
    var m domain.OrderMetrics
    err := r.db.QueryRow(query).Scan(&m.OverdueCount, &m.InProgressCount, &m.ReadyCount)
    return &m, err
}

func (r *OrderRepository) GetCustomerByPhone(phone string) (*domain.Customer, error) {
    query := `SELECT name, email, address, city, state, zip FROM customers WHERE phone = ? LIMIT 1`
    var c domain.Customer
    err := r.db.QueryRow(query, phone).Scan(&c.Name, &c.Email, &c.Address, &c.City, &c.State, &c.Zip)
    if err != nil {
        return nil, err
    }
    return &c, nil
}
