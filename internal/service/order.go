package service

import (
	"fmt"
	"techops-manager/internal/domain"
	"techops-manager/internal/repository" // Service depends on Repository
)

// OrderService handles business logic for ticket/order management.
type OrderService struct {
	repo *repository.OrderRepository // Dependency on the repository
}

// NewOrderService creates a new OrderService.
func NewOrderService(repo *repository.OrderRepository) *OrderService {
	return &OrderService{repo: repo}
}

// CreateTicket orchestrates the creation of a new ticket, device, and line items.
func (s *OrderService) CreateTicket(input *domain.TicketInput) (string, error) {
	// Add business validation here (e.g., check TotalCost calculation, engineer ID exists).
	return s.repo.CreateTicket(input)
}

// GetTicketByID retrieves a ticket by its ID.
func (s *OrderService) GetTicketByID(ticketID string) (*domain.Ticket, error) {
	return s.repo.GetTicketByID(ticketID)
}

// UpdateTicket orchestrates the update of an existing ticket.
func (s *OrderService) UpdateTicket(ticketID string, input *domain.TicketInput, userID string) error {
	return s.repo.UpdateTicket(ticketID, input, userID)
}

// GetAllOrders retrieves the list of orders for the dashboard.
func (s *OrderService) GetPaginatedOrders(p domain.PaginationInput) (*domain.PaginatedTickets, error) {
	return s.repo.GetAllOrders(p)
}

// GetOrdersByStatus retrieves orders filtered by status.
func (s *OrderService) GetOrdersByStatus(status string) ([]domain.Ticket, error) {
	return s.repo.GetOrdersByStatus(status)
}

// GetDashboardMetrics retrieves aggregated metrics for the dashboard.
func (s *OrderService) GetDashboardMetrics() (*domain.OrderMetrics, error) {
	return s.repo.GetDashboardMetrics()
}

// GetCustomerByPhone retrieves a customer by phone number.
func (s *OrderService) GetCustomerByPhone(phone string) (*domain.Customer, error) {
	return s.repo.GetCustomerByPhone(phone)
}

// OutsourceTicket handles the business logic for sending a device to a vendor.
func (s *OrderService) OutsourceTicket(ticketID string, vendorName string, reason string, userID string) error {
    if vendorName == "" {
        return fmt.Errorf("vendor name is required for outsourcing")
    }
    return s.repo.OutsourceTicket(ticketID, vendorName, reason, userID)
}

// ReceiveFromVendor handles the return of a device from a third party.
func (s *OrderService) ReceiveFromVendor(ticketID string, userID string) error {
    return s.repo.ReceiveFromVendor(ticketID, userID)
}