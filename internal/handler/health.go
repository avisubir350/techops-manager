package handler

import (
	"fmt"
	"net/http"
)

// HealthCheckHandler provides a simple status check.
func HealthCheckHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, "TechOps Manager API is operational")
}
