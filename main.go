package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os/exec"
	"runtime"

	"techops-manager/internal/config"
	"techops-manager/internal/db"
	"techops-manager/internal/handler"
	"techops-manager/internal/repository"
	"techops-manager/internal/service"

	"github.com/rs/cors"
)

// 1. CRITICAL FIX: The directive below MUST be present for embedding to work.
// 'all:web' ensures that hidden files and all subdirectories are included.
//go:embed all:web
var embeddedWeb embed.FS

func main() {
	// 2. Load Configuration
	cfg := config.GetDBConfig()

	// 3. Initialize Database Connection and Tables
	dbConn := db.InitDatabase(cfg)
	defer dbConn.Close()

	// 4. Initialize Repositories
	userRepo := repository.NewUserRepository(dbConn)
	orderRepo := repository.NewOrderRepository(dbConn)

	// 5. Initialize Services
	userService := service.NewUserService(userRepo)
	orderService := service.NewOrderService(orderRepo)

	// 6. Initialize Handlers
	authHandler := handler.NewAuthHandler(userService)
	ticketHandler := handler.NewTicketHandler(orderService)

	// 7. --- CONFIGURE ROUTER AND ROUTES ---
	mux := http.NewServeMux()

	// A. API Handlers
	mux.HandleFunc("/api/v1/health", handler.HealthCheckHandler)
	mux.HandleFunc("/api/v1/auth/register", authHandler.RegisterHandler)
	mux.HandleFunc("/api/v1/auth/login", authHandler.LoginHandler)
	mux.HandleFunc("/api/v1/auth/forgot-password", authHandler.ForgotPasswordHandler)
	mux.HandleFunc("/api/v1/auth/reset-password-otp", authHandler.ResetPasswordWithOTPHandler)
	mux.HandleFunc("/api/v1/users", authHandler.GetUsersHandler)

	mux.HandleFunc("/api/v1/dashboard/metrics", ticketHandler.GetDashboardMetricsHandler)
	mux.HandleFunc("/api/v1/orders", ticketHandler.GetOrdersHandler)
	mux.HandleFunc("/api/v1/orders/", ticketHandler.GetOrderByIDHandler)
	mux.HandleFunc("/api/v1/orders/create", ticketHandler.CreateOrderHandler)
	mux.HandleFunc("/api/v1/orders/update", ticketHandler.UpdateOrderHandler)
	mux.HandleFunc("/api/v1/orders/metrics", ticketHandler.GetOrderMetricsHandler)
	mux.HandleFunc("/api/v1/customers/lookup", ticketHandler.LookupCustomer)
	mux.HandleFunc("/api/v1/orders/outsource", ticketHandler.OutsourceTicketHandler)
	mux.HandleFunc("/api/v1/orders/receive", ticketHandler.ReceiveFromVendorHandler)
	mux.HandleFunc("/api/v1/orders/send-confirmation", ticketHandler.SendOrderConfirmationHandler)

	// D. EMBEDDED STATIC FRONTEND HANDLER
	// Extract the "web" subfolder so paths start from /assets or /views
	webContent, err := fs.Sub(embeddedWeb, "web")
	if err != nil {
		log.Fatalf("Failed to create sub-filesystem: %v", err)
	}

	// DEBUG: Print all embedded files to terminal on startup
	// This confirms if views/auth/login.html actually exists in the binary
	log.Println("Listing embedded files:")
	if err := fs.WalkDir(webContent, ".", func(path string, d fs.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			log.Printf("-> Embedded: %s", path)
		}
		return nil
	}); err != nil {
		log.Printf("Failed to walk embedded files: %v", err)
	}

	embeddedFs := http.FileServer(http.FS(webContent))

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Log incoming requests to help debug 404s
		log.Printf("Incoming request: %s", r.URL.Path)

		if r.URL.Path == "/" {
			http.Redirect(w, r, "/views/auth/login.html", http.StatusTemporaryRedirect)
			return
		}

		embeddedFs.ServeHTTP(w, r)
	})

	// 8. Start the Server
	corsHandler := cors.Default().Handler(mux)
	port := config.GetEnv("PORT", "8080")

	// START THE BROWSER AUTOMATICALLY
    // We use a goroutine (go ...) so it doesn't block the server from starting
    go func() {
        log.Printf("Opening Lokenath Login Page...")
        openBrowser("http://localhost:" + port)
    }()

	log.Printf("Lokenath Computer Systems live at http://localhost:%s", port)

	if err := http.ListenAndServe(":"+port, corsHandler); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}

// Function to automatically open the browser
func openBrowser(url string) {
	var err error
	switch runtime.GOOS {
	case "linux":
		err = exec.Command("xdg-open", url).Start()
	case "windows":
		err = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		err = exec.Command("open", url).Start()
	}
	if err != nil {
		log.Printf("Failed to open browser: %v", err)
	}
}
