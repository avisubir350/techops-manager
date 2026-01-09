package handler

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"techops-manager/internal/domain"
	"techops-manager/internal/service"
)

// TicketHandler holds the dependency on the OrderService.
type TicketHandler struct {
	orderService *service.OrderService
}

// NewTicketHandler creates a new TicketHandler.
func NewTicketHandler(os *service.OrderService) *TicketHandler {
	return &TicketHandler{orderService: os}
}

// GetDashboardMetricsHandler retrieves and aggregates key operational data.
func (h *TicketHandler) GetDashboardMetricsHandler(w http.ResponseWriter, r *http.Request) {
	// Implementation needed: Call service layer for dashboard data
}

// CreateOrderHandler handles the submission of a new service order.
func (h *TicketHandler) CreateOrderHandler(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    if r.Method != "POST" {
        http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
        return
    }

    var input domain.TicketInput
    if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
        http.Error(w, "Invalid request payload", http.StatusBadRequest)
        return
    }

    // Basic Validation
    if input.CustomerPhone == "" || input.CustomerName == "" {
        http.Error(w, "Customer Name and Phone are required", http.StatusBadRequest)
        return
    }

    // Capture the ticketID returned from the service layer
    ticketID, err := h.orderService.CreateTicket(&input) 
    if err != nil {
        log.Printf("Error creating ticket: %v", err)
        // Return a structured JSON error instead of just a string
        w.WriteHeader(http.StatusInternalServerError)
        json.NewEncoder(w).Encode(map[string]string{"error": "Failed to create ticket: " + err.Error()})
        return
    }

    // Success response with the newly created Order ID
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(map[string]interface{}{
        "message": "Ticket created successfully",
        "orderId": ticketID,
    })
}

// UpdateOrderHandler handles updating an existing service order.
func (h *TicketHandler) UpdateOrderHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != "PUT" {
		http.Error(w, "Only PUT method is allowed", http.StatusMethodNotAllowed)
		return
	}

	var input domain.TicketInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	// Extract ticket ID from query parameters or URL (implementation depends on routing setup)
	ticketID := r.URL.Query().Get("id")
	if ticketID == "" {
		http.Error(w, "Missing ticket ID", http.StatusBadRequest)
		return
	}

	// TODO : Extract current user ID from auth context/session
	userID := input.LastUpdatedBy
	if userID == "" {
		http.Error(w, "Missing current user ID in the payload", http.StatusBadRequest)
		return
	}

	if err := h.orderService.UpdateTicket(ticketID, &input, userID); err != nil {
		log.Printf("Error updating ticket: %v", err)
		http.Error(w, "Failed to update ticket: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Ticket updated successfully"})
}

// GetOrdersHandler handles pagination, sorting, and generic filtering.
func (h *TicketHandler) GetOrdersHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	params := r.URL.Query()

	// 1. Initialize Input & Defaults
	input := domain.PaginationInput{
		Page:    1,
		Limit:   20,
		Filters: make(map[string]string), // Initialize the map for generic filters
	}

	// 2. Extract SFS Metadata Fields (Page/Limit/Sort/Search)
	if p, err := strconv.Atoi(params.Get("page")); err == nil && p > 0 {
		input.Page = p
	}
	if l, err := strconv.Atoi(params.Get("limit")); err == nil && l > 0 {
		if l > 100 {
			input.Limit = 100
		} else {
			input.Limit = l
		}
	}
	input.SortBy = params.Get("sort_by")
	input.SortOrder = params.Get("sort_order")
	input.Search = params.Get("search")

	// Define a list of expected SFS keys to exclude from generic filtering
	sfsKeys := map[string]bool{
		"page": true, "limit": true, "sort_by": true, "sort_order": true, "search": true,
	}

	// 3. Extract Generic Filters (All other query parameters)
	// Keys like 'status', 'customer_name', 'created_at_start' will fall here.
	for key, values := range params {
		// Skip SFS metadata fields
		if sfsKeys[key] {
			continue
		}
		// Use the first value for filtering
		if len(values) > 0 && values[0] != "" {
			input.Filters[key] = values[0]
		}
	}

	// 4. Call the service
	paginatedTickets, err := h.orderService.GetPaginatedOrders(input)
	if err != nil {
		log.Printf("Error retrieving paginated tickets: %v", err)
		http.Error(w, "Failed to retrieve orders: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// 5. Respond
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(paginatedTickets)
}

// GetOrderByIDHandler retrieves a specific order by its ID.
// Endpoint: /api/v1/orders/{TICKET-ID}
func (h *TicketHandler) GetOrderByIDHandler(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    
    if r.Method != "GET" {
        http.Error(w, "Only GET method is allowed", http.StatusMethodNotAllowed)
        return
    }
    
    // --- CORRECT ID EXTRACTION USING PATH PARSING ---
    path := r.URL.Path
    // 1. Remove the static prefix "/api/v1/orders/"
    // The path should look like: "TICKET-1764417133157845000"
    ticketID := strings.TrimPrefix(path, "/api/v1/orders/")
    
    // 2. Validate extracted ID
    if ticketID == "" || strings.Contains(ticketID, "/") {
        // The check for '/' is an extra safety check for improperly formatted paths
        http.Error(w, "Invalid or missing ticket ID in path", http.StatusBadRequest)
        return
    }
    // --------------------------------------------------
    
    ticket, err := h.orderService.GetTicketByID(ticketID)
    if err != nil {
        log.Printf("Error retrieving ticket by ID %s: %v", ticketID, err)

        // Handle the "not found" error specifically from the repository
        if strings.Contains(err.Error(), "not found: sql: no rows in result set") {
             http.Error(w, "Ticket not found", http.StatusNotFound)
             return
        }

        http.Error(w, "Failed to retrieve ticket: "+err.Error(), http.StatusInternalServerError)
        return
    }
    
    w.WriteHeader(http.StatusOK)
    if err := json.NewEncoder(w).Encode(ticket); err != nil {
        log.Printf("Error encoding response for ticket %s: %v", ticketID, err)
    }
}

// GetOrderMetricsHandler handles the request for dashboard KPI counts
func (h *TicketHandler) GetOrderMetricsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
        http.Error(w, "Only GET method is allowed", http.StatusMethodNotAllowed)
        return
    }
    metrics, err := h.orderService.GetDashboardMetrics()
    if err != nil {
        log.Printf("Error fetching metrics: %v", err)
        w.WriteHeader(http.StatusInternalServerError)
        json.NewEncoder(w).Encode(map[string]string{"error": "Failed to fetch dashboard metrics"})
        return
    }

    // 3. Return JSON response
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusOK)
    if err := json.NewEncoder(w).Encode(metrics); err != nil {
        log.Printf("Error encoding metrics response: %v", err)
    }
}

func (h *TicketHandler) LookupCustomer(w http.ResponseWriter, r *http.Request) {
	// 1. Get phone from query params (e.g., /api/v1/customers/lookup?phone=9876543210)
	phone := r.URL.Query().Get("phone")
	if phone == "" {
		http.Error(w, "Phone number is required", http.StatusBadRequest)
		return
	}

	// 2. Call the repository method we discussed
	customer, err := h.orderService.GetCustomerByPhone(phone)

	if err != nil {
		if err == sql.ErrNoRows {
			// Customer not found - this is a valid case for the frontend
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"message": "New customer"})
			return
		}
		// Something else went wrong (database connection, etc.)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// 3. Return the customer data as JSON
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(customer)
}

// OutsourceTicketHandler handles sending a device to a third-party vendor.
// Endpoint: POST /api/v1/orders/outsource
func (h *TicketHandler) OutsourceTicketHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != "POST" {
		http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract everything (including TicketID) from the JSON body
	var req struct {
		TicketID   string `json:"ticketId"`
		VendorName string `json:"vendorName"`
		Reason     string `json:"reason"`
		UpdatedBy  string `json:"updatedBy"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	if req.TicketID == "" {
		http.Error(w, "Missing ticketId in request body", http.StatusBadRequest)
		return
	}

	// Call Service
	err := h.orderService.OutsourceTicket(req.TicketID, req.VendorName, req.Reason, req.UpdatedBy)
	if err != nil {
		log.Printf("Error outsourcing ticket %s: %v", req.TicketID, err)
		http.Error(w, "Failed to outsource ticket: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Ticket marked as Outsourced successfully"})
}

// ReceiveFromVendorHandler handles the return of a device from a vendor.
// Endpoint: POST /api/v1/orders/receive
func (h *TicketHandler) ReceiveFromVendorHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != "POST" {
		http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract everything from the JSON body
	var req struct {
		TicketID  string `json:"ticketId"`
		UpdatedBy string `json:"updatedBy"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	if req.TicketID == "" {
		http.Error(w, "Missing ticketId in request body", http.StatusBadRequest)
		return
	}

	// Call Service
	err := h.orderService.ReceiveFromVendor(req.TicketID, req.UpdatedBy)
	if err != nil {
		log.Printf("Error receiving ticket %s from vendor: %v", req.TicketID, err)
		http.Error(w, "Failed to receive ticket: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Ticket received back from vendor successfully"})
}

// SendOrderConfirmationHandler handles sending the service report via email.
func (h *TicketHandler) SendOrderConfirmationHandler(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    if r.Method != "POST" {
        http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
        return
    }

    // Structure to match the frontend JSON payload
    var req struct {
        Email            string  `json:"email"`
        OrderID          string  `json:"orderId"`
        CustomerName     string  `json:"customerName"`
        DeviceType       string  `json:"deviceType"`
        DeviceBrand      string  `json:"deviceBrand"`
        IssueDescription string  `json:"issueDescription"`
        DeliveryDate     string  `json:"deliveryDate"`
        TotalCost        float64 `json:"totalCost"`
        PDFData          string  `json:"pdfData"` // Base64 string from frontend
    }

    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "Invalid request payload", http.StatusBadRequest)
        return
    }

    if req.Email == "" {
        http.Error(w, "Recipient email is required", http.StatusBadRequest)
        return
    }

    // 1. Decode the Base64 PDF
    pdfBytes, err := base64.StdEncoding.DecodeString(req.PDFData)
    if err != nil {
        log.Printf("Error decoding PDF data: %v", err)
        http.Error(w, "Invalid PDF data format", http.StatusBadRequest)
        return
    }

    // 2. Prepare data map for the email template
    orderData := map[string]interface{}{
        "orderId":          req.OrderID,
        "customerName":     req.CustomerName,
        "deviceType":       req.DeviceType,
        "deviceBrand":      req.DeviceBrand,
        "issueDescription": req.IssueDescription,
        "deliveryDate":     req.DeliveryDate,
        "totalCost":        req.TotalCost,
    }

    // 3. Call the Service Layer to send email
    // Note: Assuming you placed SendOrderConfirmationEmail in the service package
    err = service.SendOrderConfirmationEmail(req.Email, orderData, pdfBytes)
    if err != nil {
        log.Printf("Failed to send confirmation email to %s: %v", req.Email, err)
        w.WriteHeader(http.StatusInternalServerError)
        json.NewEncoder(w).Encode(map[string]string{"error": "Order created but email failed to send"})
        return
    }

    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]string{"message": "Confirmation email sent successfully"})
}