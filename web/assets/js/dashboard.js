(function () {
  const checkAuth = () => {
    const token = localStorage.getItem("authToken");
    if (!token) {
      window.location.replace("/views/auth/login.html");
    }
  };

  // Run immediately on script load
  checkAuth();

  // Run when the page is shown (handles browser back/forward cache)
  window.addEventListener("pageshow", (event) => {
    if (
      event.persisted ||
      (window.performance && window.performance.navigation.type === 2)
    ) {
      checkAuth();
    }
  });
})();

const API_BASE_URL = "http://localhost:8080/api/v1";
const ORDERS_ENDPOINT = `${API_BASE_URL}/orders`;
const TICKET_DETAILS_ENDPOINT = `${API_BASE_URL}/orders/`;

let currentPage = 1;
const recordsPerPage = 20;
let currentSortBy = "updated_at";
let currentSortOrder = "DESC";
let activeDetailRow = null;
let activeTicketRow = null;
let allUsers = [];
let activeTileFilter = "";
let currentViewedTicket = null;
let allOrders = [];
let activeOutsourceId = null;

document.addEventListener("DOMContentLoaded", () => {
  checkAuthAndRedirect();
  displayUserName();
  setupSortListeners();
  fetchUsers();
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);

  const filterForm = document.getElementById("filterForm");
  const resetBtn = document.getElementById("resetBtn");

  if (filterForm) filterForm.addEventListener("submit", handleFilterSubmit);
  if (resetBtn) resetBtn.addEventListener("click", handleFilterReset);

  // Search-as-you-type with debounce
  const searchInput = document.getElementById("search");
  let searchTimeout;
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentPage = 1;
        loadDashboardData();
      }, 500); // 500ms delay
    });
  }

  loadDashboardData();
});

function checkAuthAndRedirect() {
  const token = localStorage.getItem("authToken");
  if (!token) {
    // Redirecting from /views/dashboard.html back to /views/auth/login.html
    window.location.href = "auth/login.html";
  }
}

function displayUserName() {
  const name = localStorage.getItem("userName");
  const displayEl = document.getElementById("user-display");
  if (displayEl) {
    displayEl.textContent = name;
  }
}

function handleLogout() {
  localStorage.removeItem("authToken");
  localStorage.removeItem("userName");
  localStorage.removeItem("userId");
  window.location.replace("/views/auth/login.html");
}

async function fetchUsers() {
  try {
    const token = localStorage.getItem("authToken");
    const response = await fetch(`${API_BASE_URL}/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      allUsers = await response.json();
      populateCreatedByDropdown(allUsers);
    }
  } catch (error) {
    console.error("Failed to fetch users:", error);
  }
}

// Helper to translate User ID to Full Name using the global allUsers array
function getUserNameById(userId) {
  if (!userId || userId === "null") return "Unassigned";
  const user = allUsers.find((u) => u.id === userId);
  return user ? user.fullName || user.full_name : userId;
}

/**
 * Translates DB field names into readable labels for the UI
 */
function formatFieldLabel(fieldName) {
  const labels = {
    assigned_engineer_id: "Assigned Engineer",
    status: "Ticket Status",
    total_cost: "Total Billing Amount",
    issue_description: "Issue Description",
    expected_delivery_date: "Expected Delivery",
    ticket_type: "Service Type",
  };

  // Return the mapped label, or a "prettified" version of the key if not found
  return (
    labels[fieldName] ||
    fieldName.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
  );
}

function setupSortListeners() {
  const headers = document.querySelectorAll("thead th[data-sort-by]");
  headers.forEach((header) => {
    header.addEventListener("click", () => {
      const sortBy = header.getAttribute("data-sort-by");

      if (sortBy === currentSortBy) {
        currentSortOrder = currentSortOrder === "ASC" ? "DESC" : "ASC";
      } else {
        currentSortBy = sortBy;
        currentSortOrder = "DESC";
      }

      currentPage = 1;
      loadDashboardData();
    });
  });
}

function updateSortArrows() {
  // 1. Reset all headers and hide all arrows
  const allHeaders = document.querySelectorAll("thead th[data-sort-by]");
  allHeaders.forEach((th) => {
    th.classList.remove("bg-indigo-50", "text-indigo-700");
    const icon = th.querySelector("i");
    if (icon) {
      icon.classList.remove("rotate-180", "text-indigo-600");
      icon.classList.add("opacity-0"); // Hide inactive arrows
    }
  });

  // 2. Find the active header using the data attribute
  // currentSortBy must match the string in your HTML's data-sort-by
  const activeHeader = document.querySelector(
    `thead th[data-sort-by="${currentSortBy}"]`
  );

  if (activeHeader) {
    activeHeader.classList.add("bg-indigo-50", "text-indigo-700");
    const activeIcon = activeHeader.querySelector("i");

    if (activeIcon) {
      activeIcon.classList.remove("opacity-0");
      activeIcon.classList.add("opacity-100", "text-indigo-600");

      // 3. Force direction using our CSS classes
      if (currentSortOrder === "ASC") {
        activeIcon.classList.add("rotate-up");
        activeIcon.classList.remove("rotate-down");
      } else {
        activeIcon.classList.add("rotate-down");
        activeIcon.classList.remove("rotate-up");
      }
    }
  }
}

function loadDashboardData() {
  // Clear any open detail rows before reloading to prevent UI glitches
  if (activeDetailRow) {
    activeDetailRow.remove();
    if (activeTicketRow)
      activeTicketRow.classList.remove("bg-indigo-50", "bg-opacity-50");
    activeDetailRow = null;
    activeTicketRow = null;
  }

  const params = new URLSearchParams();

  // 1. Capture Global Search (From Top Bar)
  const searchInput = document.getElementById("search");
  if (searchInput && searchInput.value.trim() !== "") {
    params.append("search", searchInput.value.trim());
  }

  // 2. Capture Status (From Top Bar - Immediate Apply)
  const statusFilter = document.getElementById("statusFilter");
  const statusValue = statusFilter ? statusFilter.value : "";
  if (statusValue !== "") {
    params.append("status", statusValue);
  }

  // 3. Capture Advanced Filters (Technician, Date Ranges from the Hidden Form)
  const form = document.getElementById("filterForm");
  if (form) {
    const formData = new FormData(form);
    for (const [key, value] of formData.entries()) {
      // We skip 'status' and 'search' here because they are handled above
      // from the top-level inputs to ensure immediate priority.
      if (value.trim() !== "" && key !== "status" && key !== "search") {
        if (key === "is_outsourced") {
          params.append("isOutsourced", value.trim());
        } else {
          params.append(key, value.trim());
        }
      }
    }
  }

  // 4. TILE LOGIC: Apply "Quick Filters" from Metrics Tiles
  // Note: If a user has manually selected a status in the dropdown,
  // we give the dropdown priority over tile logic.
  if (!statusValue) {
    if (activeTileFilter === "overdue") {
      const today = new Date().toISOString().split("T")[0];
      params.set("expected_delivery_date_end", today);
      params.append("exclude_status", "Delivered");
      params.append("exclude_status", "Cancelled");
    } else if (activeTileFilter === "in_progress") {
      params.set("status", "In Progress");
    } else if (activeTileFilter === "ready") {
      params.set("status", "Ready for Delivery");
    }
  }

  // 5. Pagination & Sorting
  // Ensure these match your backend column names (e.g., updated_at)
  params.append("sort_by", currentSortBy);
  params.append("sort_order", currentSortOrder);
  params.append("page", currentPage);
  params.append("limit", recordsPerPage);

  // 6. Execute API Calls and UI Updates
  fetchOrders(params.toString());
  fetchMetrics();
  updateSortArrows();

  // Highlight the "Filters" button if date ranges or users are active
  updateFilterButtonState(params);
}

function updateFilterButtonState(params) {
  const filterBtn = document.querySelector(
    '[onclick="toggleAdvancedFilters()"]'
  );
  if (!filterBtn) return;

  // Check if any advanced keys (dates/technician) exist in params
  const hasActiveFilters = Array.from(params.keys()).some((key) =>
    [
      "created_at_start",
      "created_at_end",
      "expected_delivery_date_start",
      "expected_delivery_date_end",
      "created_by",
      "is_outsourced",
    ].includes(key)
  );

  if (hasActiveFilters) {
    filterBtn.classList.add(
      "border-indigo-600",
      "bg-indigo-50",
      "text-indigo-600"
    );
    filterBtn.innerHTML = `<i class="ph-sliders"></i> Filters (Active)`;
  } else {
    filterBtn.classList.remove(
      "border-indigo-600",
      "bg-indigo-50",
      "text-indigo-600"
    );
    filterBtn.innerHTML = `<i class="ph-sliders"></i> Filters`;
  }
}

function handleFilterSubmit(e) {
  e.preventDefault();
  currentPage = 1;
  loadDashboardData();
}

function handleStatusChange() {
  currentPage = 1;
  // If a tile filter was active (e.g., Overdue), changing the status dropdown
  // usually means the user wants to break out of that quick filter.
  activeTileFilter = "";
  loadDashboardData();
}

function handleFilterReset() {
  // 1. Reset the Advanced Form
  const form = document.getElementById("filterForm");
  if (form) form.reset();

  // 2. Reset Top Bar Inputs
  const searchInput = document.getElementById("search");
  if (searchInput) searchInput.value = "";

  const statusFilter = document.getElementById("statusFilter");
  if (statusFilter) statusFilter.value = "";

  // 3. Reset the specific Vendor Status Filter (Safety check)
  const vendorFilter = document.getElementById("vendorStatusFilter");
  if (vendorFilter) vendorFilter.value = "";

  // 3. Reset Global State
  activeTileFilter = "";
  currentPage = 1;
  currentSortBy = "updated_at";
  currentSortOrder = "DESC";

  // 4. Refresh
  loadDashboardData();

  // 5. Close panel if it was open (Optional)
  document.getElementById("advancedFilters").classList.add("hidden");
}

async function fetchOrders(queryString) {
  const ordersTableBody = document.getElementById("ordersTableBody");
  const token = localStorage.getItem("authToken");

  ordersTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-gray-500">Loading orders...</td></tr>`;

  try {
    const response = await fetch(`${ORDERS_ENDPOINT}?${queryString}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.message || `API returned status ${response.status}`
      );
    }

    const data = await response.json();

    if (data && data.tickets && Array.isArray(data.tickets)) {
      allOrders = data.tickets;
      renderOrdersTable(data.tickets);
      renderPaginationControls(
        data.currentPage,
        data.totalPages,
        data.totalRecords
      );
    } else {
      throw new Error("Invalid data structure from API.");
    }
  } catch (error) {
    console.error("Error fetching orders:", error);
    ordersTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-red-500">Error loading data. ${error.message}</td></tr>`;
  }
}

function toggleAdvancedFilters() {
  const panel = document.getElementById("advancedFilters");
  panel.classList.toggle("hidden");
}

// In your fetchUsers function, populate the technician dropdown
function populateCreatedByDropdown(users) {
  const dropdown = document.getElementById("createdByFilter");
  if (!dropdown) return;

  // Clear existing (except first)
  dropdown.innerHTML = '<option value="">All Users</option>';

  users.forEach((user) => {
    const opt = document.createElement("option");
    opt.value = user.id;
    opt.textContent = user.fullName;
    dropdown.appendChild(opt);
  });
}

async function fetchMetrics() {
  const metricsContainer = document.getElementById("metricsContainer");
  const token = localStorage.getItem("authToken");

  try {
    const response = await fetch(`${API_BASE_URL}/orders/metrics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    metricsContainer.innerHTML = `
        <div onclick="applyTileFilter('overdue')"
             class="cursor-pointer bg-white p-4 rounded-xl shadow-md border-l-4 border-red-500 transition-all hover:shadow-lg ${
               activeTileFilter === "overdue"
                 ? "ring-2 ring-red-500 scale-105"
                 : ""
             }">
            <div class="flex items-center justify-between">
                <div>
                    <p class="text-xs font-bold text-gray-500 uppercase">Overdue / Due Today</p>
                    <p class="text-2xl font-black text-red-600">${
                      data.overdueCount || 0
                    }</p>
                </div>
                <i class="ph-warning-octagon text-3xl text-red-200"></i>
            </div>
        </div>

        <div onclick="applyTileFilter('in_progress')"
             class="cursor-pointer bg-white p-4 rounded-xl shadow-md border-l-4 border-yellow-500 transition-all hover:shadow-lg ${
               activeTileFilter === "in_progress"
                 ? "ring-2 ring-yellow-500 scale-105"
                 : ""
             }">
            <div class="flex items-center justify-between">
                <div>
                    <p class="text-xs font-bold text-gray-500 uppercase">In Progress</p>
                    <p class="text-2xl font-black text-yellow-600">${
                      data.inProgressCount || 0
                    }</p>
                </div>
                <i class="ph-wrench text-3xl text-yellow-200"></i>
            </div>
        </div>

        <div onclick="applyTileFilter('ready')"
             class="cursor-pointer bg-white p-4 rounded-xl shadow-md border-l-4 border-green-500 transition-all hover:shadow-lg ${
               activeTileFilter === "ready"
                 ? "ring-2 ring-green-500 scale-105"
                 : ""
             }">
            <div class="flex items-center justify-between">
                <div>
                    <p class="text-xs font-bold text-gray-500 uppercase">Ready for Delivery</p>
                    <p class="text-2xl font-black text-green-600">${
                      data.readyCount || 0
                    }</p>
                </div>
                <i class="ph-check-circle text-3xl text-green-200"></i>
            </div>
        </div>
    `;
  } catch (error) {
    console.error("Metrics load failed", error);
  }
}

function applyTileFilter(filterType) {
  // If clicking the same active filter, toggle it off (show all)
  if (activeTileFilter === filterType) {
    activeTileFilter = "";
  } else {
    activeTileFilter = filterType;
  }

  // Reset to page 1 when filtering
  currentPage = 1;

  // Refresh UI
  fetchMetrics();
  loadDashboardData();
}

function renderOrdersTable(tickets) {
  const ordersTableBody = document.getElementById("ordersTableBody");
  ordersTableBody.innerHTML = "";

  if (!tickets || tickets.length === 0) {
    ordersTableBody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-gray-400 italic">No matching records found.</td></tr>`;
    return;
  }

  tickets.forEach((ticket) => {
    const row = document.createElement("tr");

    const formattedCost =
      ticket.totalCost !== undefined
        ? ticket.totalCost.toLocaleString("en-IN", { minimumFractionDigits: 2 })
        : "0.00";

    const vendorBadge = ticket.currentVendor
      ? `<div class="mt-1 flex items-center text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100 w-fit">
           <i class="ph-truck mr-1"></i> @ ${ticket.currentVendor}
         </div>`
      : "";

    const lastUpdated = new Date(ticket.updatedAt).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

    const deliveryDate =
      ticket.expectedDeliveryDate &&
      ticket.expectedDeliveryDate !== "0001-01-01T00:00:00Z"
        ? new Date(ticket.expectedDeliveryDate).toLocaleDateString("en-IN")
        : "Not Set";

    row.className =
      "hover:bg-gray-100 transition-colors cursor-pointer ticket-row border-b border-gray-100";

    // This is what handleRowClick looks for (dataset.ticketId)
    row.dataset.ticketId = ticket.id;

    row.innerHTML = `
        <td class="px-4 py-4 whitespace-nowrap text-xs font-bold text-indigo-600">
          ${ticket.id.split("-").pop()} </td>
        <td class="px-4 py-4 whitespace-nowrap">
          <div class="text-xs font-bold text-gray-900">${
            ticket.customerName
          }</div>
          <div class="text-[10px] text-gray-500">${ticket.customerPhone}</div>
        </td>
        <td class="px-4 py-4">
            <span class="px-2 inline-flex text-[10px] leading-5 font-extrabold rounded-full uppercase ${getStatusColor(
              ticket.status
            )}">
                ${ticket.status}
            </span>
            ${vendorBadge} 
        </td>
        <td class="px-4 py-4 whitespace-nowrap text-xs text-gray-600 italic">
          ${ticket.assignedEngineerName || "Unassigned"}
        </td>
        <td class="px-4 py-4 whitespace-nowrap text-xs text-gray-500 font-medium">
          <div class="flex items-center">
            <i class="ph ph-clock-counter-clockwise mr-1.5 opacity-70"></i>
            ${lastUpdated}
          </div>
        </td>
        <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-900 font-black text-right">
          ₹${formattedCost}
        </td>
        <td class="px-4 py-4 whitespace-nowrap text-sm text-indigo-600 font-medium text-center">
          ${deliveryDate}
        </td>
        <td class="px-4 py-4 text-center">
           <i class="ph ph-caret-right text-gray-300"></i>
        </td>
    `;

    // FIX: Pass the event object to handleRowClick
    row.addEventListener("click", (e) => handleRowClick(e));

    ordersTableBody.appendChild(row);
  });
}

async function handleRowClick(e) {
  const clickedRow = e.currentTarget;
  const ticketId = clickedRow.dataset.ticketId;

  if (e.target.closest("button")) {
    return;
  }

  if (activeTicketRow && activeTicketRow !== clickedRow) {
    activeTicketRow.classList.remove("bg-indigo-50", "bg-opacity-50");
    activeDetailRow.remove();
    activeDetailRow = null;
  }

  if (activeTicketRow === clickedRow) {
    clickedRow.classList.remove("bg-indigo-50", "bg-opacity-50");
    activeDetailRow.remove();
    activeDetailRow = null;
    activeTicketRow = null;
  } else {
    clickedRow.classList.add("bg-indigo-50", "bg-opacity-50");
    activeTicketRow = clickedRow;

    const template = document.getElementById("detailRowTemplate");
    activeDetailRow = template.content.cloneNode(true).querySelector("tr");
    clickedRow.after(activeDetailRow);

    activeDetailRow.classList.remove("hidden");

    try {
      const details = await fetchTicketDetails(ticketId);
      currentViewedTicket = details;
      renderTicketDetails(activeDetailRow, details);
    } catch (error) {
      const detailLoading = activeDetailRow.querySelector("#detail-loading");
      detailLoading.textContent = `Error loading details. Check console.`;
      console.error("Error fetching ticket details:", error);
    }
  }
}

async function fetchTicketDetails(ticketId) {
  const token = localStorage.getItem("authToken");
  const response = await fetch(`${TICKET_DETAILS_ENDPOINT}${ticketId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ticket ${ticketId}. Status: ${response.status}`
    );
  }

  const data = await response.json();
  currentViewedTicket = data;

  return data;
}

function renderTicketDetails(detailRow, ticket) {
  const detailLoading = detailRow.querySelector("#detail-loading");
  const detailContent = detailRow.querySelector("#detail-content");

  // Show content, hide loader
  detailLoading.classList.add("hidden");
  detailContent.classList.remove("hidden");

  // Resolve Names from IDs using your existing helper
  const createdByName = getUserNameById(ticket.createdBy);
  const updatedByName = getUserNameById(ticket.lastUpdatedBy);

  // 1. Basic Header Info
  detailRow.querySelector("#detail-ticket-id").textContent = ticket.id;
  detailRow.querySelector("#detail-ticket-type").textContent =
    ticket.ticketType;

  // Updated header string to include "Updated By" name
  detailRow.querySelector("#detail-last-updated").textContent =
    new Date(ticket.updatedAt).toLocaleString() + " by " + updatedByName;

  // 2. The Professional Top-Right Edit Button
  const editContainer = detailRow.querySelector("#detail-edit-container");
  editContainer.innerHTML = `
    <button id="edit-btn-${ticket.id}"
            class="flex items-center gap-2 bg-white border-2 border-indigo-600 text-indigo-600 px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide hover:bg-indigo-600 hover:text-white transition-all shadow-sm active:transform active:scale-95">
      <i class="ph-pencil-simple-line-bold text-base"></i>
      Edit Order
    </button>
  `;

  document
    .getElementById(`edit-btn-${ticket.id}`)
    .addEventListener("click", (e) => {
      e.stopPropagation();
      openEditModal(ticket);
    });

  // 3. Customer Section
  const customerList = detailRow.querySelector("#customer-data-list");
  customerList.innerHTML = `
    <p><strong>Name:</strong> ${ticket.customerName}</p>
    <p><strong>Phone:</strong> ${ticket.customerPhone}</p>
    <p><strong>Email:</strong> ${ticket.customerEmail}</p>
    <p class="mt-2 text-[11px] text-indigo-600"><strong>Created:</strong> ${new Date(
      ticket.createdAt
    ).toLocaleString()} by ${createdByName}</p>
    <p class="mt-2 text-xs text-gray-500"><strong>Address:</strong><br>${
      ticket.customerAddress
    }, ${ticket.customerCity}, ${ticket.customerState} - ${
    ticket.customerZip
  }</p>
  `;

  // 4. Device Section
  const deviceList = detailRow.querySelector("#device-data-list");
  const expDate = ticket.warrantyExpDate
    ? new Date(ticket.warrantyExpDate).toLocaleDateString()
    : "N/A";

  const warrantyBadge = ticket.underWarranty
    ? `<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-bold">Active</span>`
    : `<span class="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-[10px] font-bold">Expired</span>`;

  deviceList.innerHTML = `
    <p><strong>Type:</strong> ${ticket.deviceType}</p>
    <p><strong>Model:</strong> ${ticket.deviceBrand} ${ticket.deviceModel}</p>
    <p><strong>Serial:</strong> <span class="font-mono">${
      ticket.deviceSerialNo
    }</span></p>
    <p><strong>Warranty:</strong> ${warrantyBadge} ${
    ticket.warrantyNo || ""
  }</p>
    <p><strong>Warranty Exp:</strong> <span class="${
      ticket.underWarranty ? "" : "text-red-500 font-semibold"
    }">${expDate}</span></p>
    <p><strong>Accessories:</strong> <span class="text-gray-500">${
      ticket.accessoriesReceived || "None"
    }</span></p>
  `;

  // 5. Service Line Items
  const serviceContainer = detailRow.querySelector("#serviceLineItems");
  serviceContainer.innerHTML = "";
  ticket.serviceLineItems.forEach((item) => {
    serviceContainer.innerHTML += `
      <div class="flex justify-between text-xs bg-gray-50 p-2 rounded border border-gray-100">
        <div>
          <div class="font-bold text-gray-800">${item.serviceName}</div>
          <div class="text-gray-400">Rate: Rs. ${item.rate.toFixed(
            2
          )} | Disc: ${item.discountPercent}%</div>
        </div>
        <div class="font-bold text-indigo-600">Rs. ${item.finalPrice.toFixed(
          2
        )}</div>
      </div>
    `;
  });

  detailRow.querySelector(
    "#detail-total-cost"
  ).textContent = `Rs. ${ticket.totalCost.toFixed(2)}`;

  // 6. Issue & Consent
  detailRow.querySelector("#detail-issue-desc").textContent =
    ticket.issueDescription;
  const consentText =
    ticket.dataBackupConsent === "no_backup_no_service"
      ? "⚠️ Customer declined data backup"
      : "✅ Data Backup Consent Provided";
  detailRow.querySelector("#detail-backup-consent").textContent = consentText;

  // 7. History Log (Audit Trail)
  const historyLog = detailRow.querySelector("#historyLog");
  historyLog.innerHTML = "";
  if (ticket.history && ticket.history.length > 0) {
    ticket.history.forEach((log) => {
      const logDate = new Date(log.updatedAt).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
      const fieldLabel = formatFieldLabel(log.fieldName);
      const isEngineerField = log.fieldName === "assigned_engineer_id";
      const displayOld = isEngineerField
        ? getUserNameById(log.oldValue)
        : log.oldValue || "None";
      const displayNew = isEngineerField
        ? getUserNameById(log.newValue)
        : log.newValue;

      historyLog.innerHTML += `
            <div class="relative pl-6 pb-4 border-l border-indigo-100 last:border-0">
              <div class="absolute -left-[5.5px] top-1 w-2.5 h-2.5 bg-indigo-500 rounded-full border-2 border-white shadow-sm"></div>
              <div class="text-[10px] font-black text-indigo-900 uppercase tracking-wider mb-1">${fieldLabel}</div>
              <div class="flex items-center text-[11px] gap-2">
                <span class="text-gray-400 line-through decoration-red-300">${displayOld}</span>
                <i class="ph-arrow-right text-gray-300"></i>
                <span class="text-green-700 font-bold bg-green-50 px-1.5 py-0.5 rounded">${displayNew}</span>
              </div>
              <div class="text-[9px] text-gray-400 mt-1 italic">${logDate} • Updated by ${log.updatedByName}</div>
            </div>`;
    });
  } else {
    historyLog.innerHTML = `<p class="text-gray-400 italic text-xs p-4">No activity recorded.</p>`;
  }

  // --- NEW: VENDOR TRACKING LOGIC ---

  // 8. Render External Vendor History
  const vendorLog = detailRow.querySelector("#vendorHistoryLog");
  vendorLog.innerHTML = "";
  if (ticket.vendorHistory && ticket.vendorHistory.length > 0) {
    ticket.vendorHistory.forEach((vh) => {
      vendorLog.innerHTML += `
        <div class="bg-gray-50 border border-gray-200 p-3 rounded-lg shadow-sm">
          <div class="flex justify-between items-start mb-1">
            <span class="font-bold text-orange-700 text-xs uppercase tracking-tight">${
              vh.vendorName
            }</span>
            <span class="text-[10px] text-gray-400 font-medium">${new Date(
              vh.outsourcedAt
            ).toLocaleDateString()}</span>
          </div>
          <p class="text-[11px] text-gray-600 leading-tight">${
            vh.reason || "Outsourced for repair"
          }</p>
          ${
            vh.receivedAt
              ? `<div class="mt-2 flex items-center text-[10px] text-green-600 font-bold bg-green-50 w-fit px-2 py-0.5 rounded">
              <i class="ph-check-circle mr-1"></i> Received: ${new Date(
                vh.receivedAt
              ).toLocaleDateString()}
             </div>`
              : `<div class="mt-2 flex items-center text-[10px] text-orange-600 font-bold bg-orange-50 w-fit px-2 py-0.5 rounded animate-pulse">
              <i class="ph-truck mr-1"></i> Currently at Vendor
             </div>`
          }
        </div>
      `;
    });
  } else {
    vendorLog.innerHTML = `<p class="text-gray-400 italic text-xs p-4 bg-gray-50 rounded-lg border border-dashed border-gray-200">No external vendor history available.</p>`;
  }

  // 9. Vendor Action Buttons (Logic to toggle between Outsource and Receive)
  const vendorActions = detailRow.querySelector("#vendor-action-buttons");
  vendorActions.innerHTML = "";

  // Check if the device is CURRENTLY with a vendor
  if (
    !ticket.currentVendorName ||
    ticket.currentVendorName === "" ||
    ticket.currentVendorName === "null"
  ) {
    // STATE: Internal (In-Shop)
    vendorActions.innerHTML = `
      <button onclick="openOutsourceModal('${ticket.id}')" 
              class="w-full flex items-center justify-center gap-2 bg-white border border-orange-200 text-orange-600 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide hover:bg-orange-600 hover:text-white transition-all shadow-sm active:scale-95">
        <i class="ph-truck-bold text-base"></i>
        Outsource to Vendor
      </button>
    `;
  } else {
    // STATE: Outsourced (At Vendor)
    vendorActions.innerHTML = `
      <div class="space-y-3">
        <div class="flex items-center gap-2 text-orange-600 bg-orange-50 p-2 rounded border border-orange-100">
           <i class="ph-info-bold"></i>
           <span class="text-[11px] font-bold">Current Vendor: ${ticket.currentVendorName}</span>
        </div>
        <button onclick="handleReceive('${ticket.id}')" 
                class="w-full flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide hover:bg-green-700 transition-all shadow-md active:scale-95">
          <i class="ph-check-circle-bold text-base"></i>
          Mark as Received In-Shop
        </button>
      </div>
    `;
  }
}

function openOutsourceModal(ticketId) {
  activeOutsourceId = ticketId;
  document.getElementById("outsourceTicketId").value = ticketId;
  document.getElementById("outsourceModal").classList.remove("hidden");
}

function closeOutsourceModal() {
  document.getElementById("outsourceModal").classList.add("hidden");
  document.getElementById("vendorNameInput").value = "";
  document.getElementById("vendorReasonInput").value = "";
}

async function submitOutsource() {
  const vendorName = document.getElementById("vendorNameInput").value;
  const reason = document.getElementById("vendorReasonInput").value;

  if (!vendorName) return alert("Please enter a vendor name");

  try {
    const response = await fetch(`${API_BASE_URL}/orders/outsource`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      },
      body: JSON.stringify({
        ticketId: activeOutsourceId, // Matches your payload
        vendorName: vendorName, // Matches your payload
        reason: reason, // UPDATED: was outsourceReason
        updatedBy: localStorage.getItem("userId"), // Matches your payload
      }),
    });

    if (response.ok) {
      closeOutsourceModal();
      loadDashboardData();
    } else {
      const errData = await response.json();
      alert("Error: " + (errData.message || "Failed to outsource"));
    }
  } catch (err) {
    alert("Network error: Failed to outsource device");
  }
}

async function handleReceive(ticketId) {
  if (!confirm("Confirm that device has been received back from the vendor?"))
    return;

  try {
    const response = await fetch(`${API_BASE_URL}/orders/receive`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      },
      body: JSON.stringify({
        ticketId: ticketId, // Matches your payload
        updatedBy: localStorage.getItem("userId"), // Matches your payload
      }),
    });

    if (response.ok) {
      loadDashboardData();
    } else {
      const errData = await response.json();
      alert("Error: " + (errData.message || "Failed to receive device"));
    }
  } catch (err) {
    alert("Network error: Failed to receive device");
  }
}

function getStatusColor(status) {
  switch (status) {
    case "New Order":
      return "bg-blue-100 text-blue-800";
    case "In Progress":
      return "bg-yellow-100 text-yellow-800";
    case "Ready for Delivery":
      return "bg-green-100 text-green-800";
    case "Delivered":
      return "bg-gray-100 text-gray-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function renderPaginationControls(current, total, totalRecords) {
  const controls = document.getElementById("paginationControls");
  controls.innerHTML = "";

  // If there are no records, show 0 entries message
  if (totalRecords === 0 || total === 0) {
    const emptyInfo = document.createElement("div");
    emptyInfo.className = "text-sm text-gray-500 italic";
    emptyInfo.textContent = "Showing 0 entries";
    controls.appendChild(emptyInfo);
    return;
  }

  // 1. Calculate the Range (X to Y of Z)
  // 'from' is the index of the first record on the current page
  const from = (current - 1) * recordsPerPage + 1;

  // 'to' is the index of the last record on the page, capped at totalRecords
  const to = Math.min(current * recordsPerPage, totalRecords);

  // 2. Create the Status Text
  const infoText = document.createElement("div");
  infoText.className = "text-sm text-gray-700";
  infoText.innerHTML = `Showing <span class="font-semibold">${from}</span> to <span class="font-semibold">${to}</span> of <span class="font-semibold">${totalRecords}</span> entries`;
  controls.appendChild(infoText);

  // 3. Navigation Group
  const navGroup = document.createElement("div");
  navGroup.className = "flex items-center space-x-2";

  // Previous Button
  const prevBtn = createPageButton("Previous", current - 1, current > 1);
  navGroup.appendChild(prevBtn);

  // Jump Input
  const pageInput = document.createElement("input");
  pageInput.type = "number";
  pageInput.value = current;
  pageInput.min = 1;
  pageInput.max = total;
  pageInput.title = "Press Enter to jump to page";
  pageInput.className =
    "w-16 h-9 text-center border border-gray-300 rounded-md text-sm font-medium focus:ring-indigo-500 focus:border-indigo-500";

  // Handle "Enter" key for jumping
  pageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      let requestedPage = parseInt(pageInput.value);
      if (
        !isNaN(requestedPage) &&
        requestedPage >= 1 &&
        requestedPage <= total
      ) {
        currentPage = requestedPage;
        loadDashboardData();
      } else {
        pageInput.value = current;
      }
    }
  });

  navGroup.appendChild(pageInput);

  // Next Button
  const nextBtn = createPageButton("Next", current + 1, current < total);
  navGroup.appendChild(nextBtn);

  controls.appendChild(navGroup);
}

function createPageButton(text, page, isEnabled, isActive = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;

  // Base classes
  let baseClass =
    "relative inline-flex items-center px-4 py-2 border text-sm font-medium transition-colors rounded-md ";

  // Style based on state
  if (isActive) {
    baseClass += "z-10 bg-indigo-50 border-indigo-500 text-indigo-600";
  } else if (isEnabled) {
    baseClass += "bg-white border-gray-300 text-gray-500 hover:bg-gray-50";
  } else {
    baseClass += "bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed";
  }

  button.className = baseClass;

  if (isEnabled && !isActive) {
    button.addEventListener("click", () => {
      currentPage = page;
      loadDashboardData();
    });
  } else {
    button.disabled = true;
  }
  return button;
}

let currentEditItems = [];
let originalItemCount = 0; // To track which items are locked
let originalSnapshot = {};

function openEditModal(ticket) {
  // 1. Set Basic Fields
  document.getElementById("modalTicketId").textContent = ticket.id;
  document.getElementById("edit-id").value = ticket.id;
  document.getElementById("edit-status").value = ticket.status;

  const cleanNotes = (ticket.issueDescription || "").trim();
  document.getElementById("edit-notes").value = cleanNotes;

  // 2. Handle Date (IST Safe)
  let formattedDate = "";
  if (ticket.expectedDeliveryDate) {
    const d = new Date(ticket.expectedDeliveryDate);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    formattedDate = `${year}-${month}-${day}`;
  }
  // Set the input value
  document.getElementById("edit-delivery").value = formattedDate;

  const engineerSelect = document.getElementById("edit-engineer");
  if (engineerSelect) {
    engineerSelect.innerHTML = "";
    allUsers.forEach((user) => {
      const isSelected =
        user.id === ticket.assignedEngineerID ? "selected" : "";

      const opt = document.createElement("option");
      opt.value = user.id;
      opt.textContent = user.fullName;
      if (user.id === ticket.assignedEngineerID) {
        opt.selected = true;
      }
      engineerSelect.appendChild(opt);
    });
  }

  // 3. Load Items
  currentEditItems = JSON.parse(JSON.stringify(ticket.serviceLineItems || []));
  originalItemCount = currentEditItems.length;

  // 4. CAPTURE SNAPSHOT (Using the exact variables assigned above)
  originalSnapshot = {
    status: ticket.status,
    notes: cleanNotes,
    delivery: formattedDate,
    engineer: ticket.assignedEngineerID || "",
    itemCount: originalItemCount,
  };

  // 5. Render and Force Initial Validation
  renderEditLineItems();

  // Wait a tiny bit for the DOM to settle, then validate
  setTimeout(() => {
    validateForm();
  }, 10);

  document.getElementById("editModal").classList.remove("hidden");
}

function validateForm() {
  const saveBtn = document.querySelector(
    'button[onclick="saveTicketChanges()"]'
  );

  const currentStatus = document.getElementById("edit-status").value;
  const currentNotes = document.getElementById("edit-notes").value;
  const currentDelivery = document.getElementById("edit-delivery").value;
  const currentEngineer = document.getElementById("edit-engineer").value;

  const hasBaseChanges =
    currentStatus !== originalSnapshot.status ||
    currentNotes !== originalSnapshot.notes ||
    currentDelivery !== originalSnapshot.delivery ||
    String(currentEngineer) !== String(originalSnapshot.engineer || "") ||
    currentEditItems.length > originalSnapshot.itemCount;

  let allNewItemsValid = true;
  let hasNewItems = currentEditItems.length > originalSnapshot.itemCount;

  for (let i = originalItemCount; i < currentEditItems.length; i++) {
    const item = currentEditItems[i];
    if (!item.serviceName.trim() || !item.rate || parseFloat(item.rate) <= 0) {
      allNewItemsValid = false;
      break;
    }
  }

  const canSave = hasBaseChanges && allNewItemsValid;
  saveBtn.disabled = !canSave;

  if (saveBtn.disabled) {
    saveBtn.classList.add("opacity-50", "cursor-not-allowed");
  } else {
    saveBtn.classList.remove("opacity-50", "cursor-not-allowed");
  }
}

function renderEditLineItems() {
  const tbody = document.getElementById("edit-line-items-body");
  tbody.innerHTML = "";
  let grandTotal = 0;

  currentEditItems.forEach((item, index) => {
    const isLocked = index < originalItemCount;
    const finalPrice = item.rate * (1 - item.discountPercent / 100);
    grandTotal += finalPrice;

    tbody.innerHTML += `
            <tr class="border-b last:border-0 ${
              isLocked ? "bg-gray-50" : "bg-white"
            }">
                <td class="p-2">
                    ${
                      isLocked
                        ? `<span class="text-gray-500 ml-2 italic">${item.serviceName}</span>`
                        : `<input type="text" value="${item.serviceName}" oninput="updateItem(${index}, 'serviceName', this.value)" class="w-full border rounded px-2 py-1 text-sm">`
                    }
                </td>
                <td class="p-2">
                    ${
                      isLocked
                        ? `<span class="text-gray-500">${item.rate}</span>`
                        : `<input type="number" value="${item.rate}" oninput="updateItem(${index}, 'rate', this.value)" class="w-full border rounded px-2 py-1 text-sm">`
                    }
                </td>
                <td class="p-2">
                    ${
                      isLocked
                        ? `<span class="text-gray-500">${item.discountPercent}%</span>`
                        : `<input type="number" value="${item.discountPercent}" oninput="updateItem(${index}, 'discountPercent', this.value)" class="w-full border rounded px-2 py-1 text-sm">`
                    }
                </td>
                <td class="p-2 text-right font-semibold text-gray-700">
                    Rs. <span id="row-final-${index}">${finalPrice.toFixed(
      2
    )}</span>
                </td>
                <td class="p-2 text-center">
                    ${
                      isLocked
                        ? `<i class="ph-lock-key-fill text-gray-300"></i>`
                        : `<button type="button" onclick="removeItem(${index})" class="text-red-400 hover:text-red-600"><i class="ph-trash"></i></button>`
                    }
                </td>
            </tr>
        `;
  });
  updateGrandTotal();
}

function updateItem(index, field, value) {
  // 1. Update the data array
  if (field === "rate" || field === "discountPercent") {
    currentEditItems[index][field] = parseFloat(value) || 0;
  } else {
    currentEditItems[index][field] = value;
  }

  // 2. Calculate the specific row's final price
  const rate = currentEditItems[index].rate || 0;
  const discount = currentEditItems[index].discountPercent || 0;
  const finalPrice = rate * (1 - discount / 100);
  currentEditItems[index].finalPrice = finalPrice;

  // 3. TARGETED DOM UPDATE: Update only the row total and grand total
  // This prevents re-rendering the inputs, so you don't lose focus.
  const rowFinalSpan = document.getElementById(`row-final-${index}`);
  if (rowFinalSpan) {
    rowFinalSpan.textContent = finalPrice.toFixed(2);
  }

  updateGrandTotal();
  validateForm();
}

function updateGrandTotal() {
  const total = currentEditItems.reduce(
    (sum, item) => sum + (item.finalPrice || 0),
    0
  );
  document.getElementById(
    "edit-total-display"
  ).textContent = `Rs. ${total.toFixed(2)}`;
}

function removeItem(index) {
  currentEditItems.splice(index, 1);
  renderEditLineItems(); // Full re-render is fine here
  validateForm();
}

function addBlankItemRow() {
  currentEditItems.push({
    serviceName: "",
    rate: 0,
    discountPercent: 0,
    finalPrice: 0,
  });
  renderEditLineItems(); // Full re-render is fine here
  validateForm();
}

function closeEditModal() {
  document.getElementById("editModal").classList.add("hidden");
}

async function saveTicketChanges() {
  const ticketId = document.getElementById("edit-id").value;
  const saveBtn = document.querySelector(
    'button[onclick="saveTicketChanges()"]'
  );
  const currentUserId = localStorage.getItem("userId");

  // 1. Gather Data from Modal
  const updatedData = {
    status: document.getElementById("edit-status").value,
    issueDescription: document.getElementById("edit-notes").value,
    expectedDeliveryDate: document.getElementById("edit-delivery").value,
    serviceLineItems: currentEditItems,
    lastUpdatedBy: currentUserId,
    engineerId: document.getElementById("edit-engineer").value,
  };

  // 2. UI Loading State
  const originalBtnText = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = `<i class="ph-circle-notch ph-spin mr-2"></i> Saving...`;

  try {
    const token = localStorage.getItem("authToken");
    const response = await fetch(
      `${API_BASE_URL}/orders/update?id=${ticketId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updatedData),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Failed to update ticket");
    }

    // 3. Success Handling
    alert("Ticket updated successfully!");
    closeEditModal();

    // Refresh the dashboard to show new status/totals
    // If you have a fetchOrders() function, call it here:
    if (typeof fetchOrders === "function") {
      fetchOrders();
    } else {
      window.location.reload();
    }
  } catch (error) {
    console.error("Update Error:", error);
    alert("Error: " + error.message);
  } finally {
    // 4. Reset Button
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalBtnText;
  }
}

/**
 * Generates and downloads a Service Report PDF.
 * Works for both new ticket creation and dashboard read-only view.
 */
const generateOrderPDF = (data, orderId = "DRAFT") => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // --- 1. Full Screen Transparent Watermark ---
  // Ensure this path is correct relative to the HTML file calling this function
  const lokenathImg = "../../assets/img/lokenath_baba.png";
  try {
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.05 }));
    doc.addImage(lokenathImg, "PNG", 0, 0, pageWidth, pageHeight);
    doc.restoreGraphicsState();
  } catch (e) {
    console.warn("Watermark image not found, skipping...");
  }

  // --- 2. Official Header ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("LOKENATH COMPUTER", margin, 20);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(
    "114/A, Surya Tarun Apartment, Sodepur Beside Panihati Collage, Kolkata - 700 110",
    margin,
    26
  );
  doc.text(
    "Contact: 8777679535 / 8013338334 | E-mail: lokenathcomputer.sodepur@gmail.com",
    margin,
    31
  );

  doc.setLineWidth(0.5);
  doc.line(margin, 35, pageWidth - margin, 35);

  // --- 3. Report Type & Job Info ---
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("SERVICE REPORT", pageWidth / 2, 45, { align: "center" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Job No. : ${orderId}`, margin, 53);

  // Use existing CreatedAt if available, otherwise use current date
  const reportDate = data.createdAt
    ? new Date(data.createdAt).toLocaleDateString("en-IN")
    : new Date().toLocaleDateString("en-IN");
  doc.text(`Date : ${reportDate}`, pageWidth - 60, 53);

  // --- 4. Call Type & Equipment ---
  doc.setFont("helvetica", "bold");
  doc.text(`${data.ticketType || "General Service"}`, margin, 61);
  doc.setFont("helvetica", "normal");
  doc.text(`Equipment Type: ${data.deviceType}`, 100, 61);

  // --- 5. Customer & Device Headers ---
  doc.setFont("helvetica", "bold");
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, 67, 90, 7, "F");
  doc.rect(105, 67, 90, 7, "F");
  doc.text("CUSTOMER DETAILS", margin + 2, 72);
  doc.text("DEVICE DETAILS", 105 + 2, 72);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Name: ${data.customerName}`, margin, 80);
  doc.text(`Phone: ${data.customerPhone}`, margin, 85);
  doc.text(`Address: ${data.customerAddress || "N/A"}`, margin, 90);
  doc.text(
    `City/State: ${data.customerCity || ""}, ${data.customerState || ""}`,
    margin,
    95
  );

  doc.text(`Brand: ${data.deviceBrand}`, 105, 80);
  // Handle mapping between ModelNo and Model (API vs Input struct)
  doc.text(
    `Model No: ${data.deviceModelNo || data.deviceModel || "N/A"}`,
    105,
    85
  );
  doc.text(`Serial No: ${data.deviceSerialNo}`, 105, 90);

  const issue = data.issueDescription
    ? data.issueDescription.substring(0, 50)
    : "N/A";
  doc.text(`Issue: ${issue}`, 105, 95);

  // --- 6. Service Table ---
  const lineItems = data.serviceLineItems || [];
  doc.autoTable({
    startY: 105,
    head: [["Description", "Rate", "Discount", "Final Amount"]],
    body: lineItems.map((item) => [
      item.serviceName,
      `Rs. ${Number(item.rate).toFixed(2)}`,
      `${item.discountPercent}%`,
      `Rs. ${Number(item.finalPrice).toFixed(2)}`,
    ]),
    theme: "grid",
    headStyles: { fillColor: [79, 70, 229], textColor: 255 },
    styles: { fontSize: 9 },
    margin: { left: margin, right: margin },
  });

  let currentY = doc.lastAutoTable.finalY + 10;

  // --- 7. Summary & Total ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(
    `Grand Total: Rs. ${Number(data.totalCost || 0).toLocaleString("en-IN")}`,
    pageWidth - margin,
    currentY,
    { align: "right" }
  );

  // --- 8. Consent & Warranty ---
  currentY += 10;
  doc.setFontSize(10);
  doc.text("DATA BACKUP & WARRANTY", margin, currentY);
  doc.line(margin, currentY + 1, margin + 50, currentY + 1);

  currentY += 7;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  // Mapping for Backup Consent field
  const backupVal = data.dataBackup || data.dataBackupConsent;
  const backupText =
    backupVal === "request_backup" || backupVal === "Yes"
      ? "Consent: User requested data backup (Charges may apply)."
      : "Consent: User has backed up data / do not want backup.";
  doc.text(backupText, margin, currentY);

  currentY += 5;
  const wExp = data.warrantyExpDate
    ? new Date(data.warrantyExpDate).toLocaleDateString("en-IN")
    : "N/A";
  const warrantyText = data.underWarranty
    ? `Warranty: YES (No: ${data.warrantyNo || "N/A"} | Exp: ${wExp})`
    : "Warranty: NO";
  doc.text(warrantyText, margin, currentY);

  // --- 9. Disclaimer ---
  currentY += 12;
  doc.setFontSize(8);
  doc.setTextColor(100);
  const disclaimer =
    "Disclaimer: We are not responsible for any loss of data. Please ensure you have a backup before handing over equipment. Warranty covers only service performed.";
  doc.text(
    doc.splitTextToSize(disclaimer, pageWidth - margin * 2),
    margin,
    currentY
  );

  // --- 10. Footer & Signatures ---
  currentY = pageHeight - 40;
  doc.setTextColor(0);
  doc.text("__________________________", margin, currentY);
  doc.text("Customer Signature", margin, currentY + 5);

  doc.text("__________________________", pageWidth - 75, currentY);
  doc.text("Signature of IT Consultant", pageWidth - 75, currentY + 5);

  doc.setFontSize(9);
  doc.text(
    `Delivery Date: ${data.expectedDeliveryDate || "................"}`,
    margin,
    currentY + 15
  );
  doc.text(
    "For Feedback Contact: 8777679535",
    pageWidth - margin,
    currentY + 15,
    { align: "right" }
  );

  doc.save(`Lokenath_Computer_${orderId}.pdf`);
};

// The handler for the PDF button click
function handleDownloadPDF() {
  if (!currentViewedTicket) {
    alert("No order data available to download.");
    return;
  }

  // Call the updated function provided in the previous step
  generateOrderPDF(currentViewedTicket, currentViewedTicket.id);
}

/**
 * Fetches all filtered records (ignoring pagination) and exports to CSV
 */
async function downloadDashboardCSV() {
  try {
    // 1. Show a loading indicator (optional but recommended)
    const btn = document.querySelector('[title="Export to CSV"]');
    const originalIcon = btn.innerHTML;
    btn.innerHTML = '<i class="ph ph-circle-notch ph-spin text-2xl"></i>';
    btn.disabled = true;

    // 2. Prepare parameters based on CURRENT active filters
    const params = new URLSearchParams();

    // Get filters from the advanced form
    const formData = new FormData(document.getElementById("filterForm"));
    for (const [key, value] of formData.entries()) {
      if (value.trim() !== "") {
        // Sync with your Go backend naming
        if (key === "is_outsourced") params.append("isOutsourced", value);
        else params.append(key, value);
      }
    }

    // Add Top bar filters
    const searchVal = document.getElementById("search").value;
    const statusVal = document.getElementById("statusFilter").value;
    if (searchVal) params.append("search", searchVal);
    if (statusVal) params.append("status", statusVal);

    // IMPORTANT: Ask for a huge limit or a special "all" flag
    // Assuming your Go backend can handle a high limit
    params.append("limit", "10000");
    params.append("page", "1");
    params.append("sort_by", currentSortBy);
    params.append("sort_order", currentSortOrder);

    // 3. Fetch data from backend
    const response = await fetch(
      `${API_BASE_URL}/orders?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      }
    );

    const result = await response.json();
    const dataToExport = result.tickets;

    if (!dataToExport || dataToExport.length === 0) {
      alert("No data found for the current filters.");
      return;
    }

    // 4. Define CSV Headers
    const headers = [
      "Ticket ID",
      "Customer Name",
      "Phone",
      "Email",
      "Status",
      "Device",
      "Brand",
      "Model",
      "Cost (INR)",
      "Engineer",
      "Created At",
      "Exp. Delivery",
    ];

    // 5. Map Data to Rows
    const rows = dataToExport.map((order) => [
      `"${order.id}"`,
      `"${order.customerName}"`,
      `"${order.customerPhone}"`,
      `"${order.customerEmail || ""}"`,
      `"${order.status}"`,
      `"${order.deviceType}"`,
      `"${order.deviceBrand || ""}"`,
      `"${order.deviceModel || ""}"`,
      order.totalCost,
      `"${order.assignedEngineerName || "Unassigned"}"`,
      new Date(order.createdAt).toLocaleDateString("en-IN"),
      order.expectedDeliveryDate
        ? new Date(order.expectedDeliveryDate).toLocaleDateString("en-IN")
        : "N/A",
    ]);

    // 6. Generate and Trigger Download
    const csvContent = [
      headers.join(","),
      ...rows.map((e) => e.join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().split("T")[0];

    link.href = URL.createObjectURL(blob);
    link.download = `Lokenath_Computer_${timestamp}.csv`;
    link.click();
  } catch (error) {
    console.error("Export failed:", error);
    alert("Failed to export data. Please try again.");
  } finally {
    // Restore button state
    const btn = document.querySelector('[title="Export to CSV"]');
    btn.innerHTML = '<i class="ph ph-download-simple text-2xl"></i>';
    btn.disabled = false;
  }
}

// Attach to window so HTML 'onclick' can find them
window.openOutsourceModal = openOutsourceModal;
window.closeOutsourceModal = closeOutsourceModal;
window.submitOutsource = submitOutsource;
window.handleReceive = handleReceive;
