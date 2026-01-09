/**
 * SECURITY GUARD: Auth & Back-button logic
 */

(function () {
  const checkAuth = () => {
    const token = localStorage.getItem("authToken");
    if (!token) {
      window.location.replace("/views/auth/login.html");
    }
  };
  checkAuth();
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
const NEW_ORDER_ENDPOINT = `${API_BASE_URL}/orders/create`;

// --- GLOBAL STATE ---
let serviceLineItems = [];

// --- CONSTANTS ---
const DEVICE_TYPES = {
  desktop: "Desktop Computer",
  laptop: "Laptop",
  printer: "Printer",
  toner: "Toner",
  ups: "UPS",
  other: "other",
};

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Tamil Nadu",
  "Telangana",
  "Uttar Pradesh",
  "West Bengal",
];

const customerFields = [
  "customerName",
  "customerEmail",
  "customerAddress",
  "customerCity",
  "customerZip",
  "customerState",
];

// UPDATED: Removed Zip, Brand, and Model from required list. Added Expected Delivery.
const requiredFields = [
  "customerName",
  "customerPhone",
  "customerAddress",
  "customerCity",
  "customerState",
  "deviceType",
  "issueDescription",
  "assignedEngineer",
  "expectedDeliveryDate",
];

// --- DOM REFERENCES ---
const form = document.getElementById("new-order-form");
const submitBtn = document.getElementById("submit-order-btn");
const deviceTypeSelect = document.getElementById("deviceType");
const customerPhoneInput = document.getElementById("customerPhone");
const customerStateSelect = document.getElementById("customerState");
const lineItemsBody = document.getElementById("line-items-body");
const addServiceBtn = document.getElementById("add-service-btn");
const assignedEngineerSelect = document.getElementById("assignedEngineer");

// --- UTILITY & IDENTITY ---
function initializeIdentity() {
  const name = localStorage.getItem("userName");
  const display = document.getElementById("user-display");
  if (display) display.textContent = name;

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("authToken");
      localStorage.removeItem("userName");
      localStorage.removeItem("userId");
      window.location.replace("/views/auth/login.html");
    });
  }
}

function validateIndianPhone(phone) {
  const clean = phone.replace(/\s/g, "");
  return clean.length === 10 && /^\d+$/.test(clean);
}

function showNotification(message, type = "info") {
  const notification = document.createElement("div");
  notification.className = `fixed top-4 right-4 p-4 rounded-xl shadow-2xl z-50 text-white font-bold animate-bounce ${
    type === "success" ? "bg-green-600" : "bg-red-600"
  }`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 4000);
}

// Function to handle visual error states
function highlightError(element, isError) {
  if (isError) {
    element.classList.add(
      "border-red-500",
      "ring-2",
      "ring-red-100",
      "animate-shake"
    );
    element.classList.remove("border-gray-200");
  } else {
    element.classList.remove(
      "border-red-500",
      "ring-2",
      "ring-red-100",
      "animate-shake"
    );
    element.classList.add("border-gray-200");
  }
}

// --- CUSTOMER LOGIC ---
function fillCustomerFields(customer) {
  customerFields.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;

    // Map the API key to the element ID
    const apiKey = id.replace("customer", "").toLowerCase();
    el.value = customer[apiKey] || "";

    el.readOnly = false;
    el.classList.remove("bg-gray-100", "cursor-not-allowed", "text-gray-500");

    highlightError(el, false);
  });
  showNotification(`Found details for ${customer.name}`, "success");
}

function unlockCustomerFields() {
  customerFields.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = ""; // Clear fields for new entry
    el.readOnly = false;
    el.classList.remove("bg-gray-100", "cursor-not-allowed", "text-gray-500");
  });
}

async function lookupCustomerByPhone(phone) {
  try {
    const response = await fetch(
      `/api/v1/customers/lookup?phone=${encodeURIComponent(phone)}`
    );
    if (response.ok) {
      const customer = await response.json();
      fillCustomerFields(customer);
    }
  } catch (error) {
    console.error("Lookup failed:", error);
  }
}

// --- BILLING & LINE ITEMS ---
function calculateTotals() {
  let subtotal = 0;
  let totalDiscount = 0;

  serviceLineItems.forEach((item) => {
    const rate = parseFloat(item.rate) || 0;
    const discPercent = Math.max(
      0,
      Math.min(100, parseFloat(item.discountPercent) || 0)
    );
    item.discountValue = rate * (discPercent / 100);
    item.finalPrice = rate - item.discountValue;
    subtotal += rate;
    totalDiscount += item.discountValue;
  });

  const grandTotal = subtotal - totalDiscount;
  document.getElementById("service-count").textContent =
    serviceLineItems.length;
  document.getElementById(
    "sidebar-subtotal"
  ).textContent = `₹${subtotal.toLocaleString("en-IN")}`;
  document.getElementById("sidebar-discount").textContent = `-₹${Math.round(
    totalDiscount
  ).toLocaleString("en-IN")}`;
  document.getElementById("sidebar-grand-total").textContent = `₹${Math.round(
    grandTotal
  ).toLocaleString("en-IN")}`;
}

function renderLineItems() {
  lineItemsBody.innerHTML =
    serviceLineItems.length === 0
      ? `<tr><td colspan="5" class="text-center py-10 text-gray-400 italic">No services added. Click "Add Service" to begin.</td></tr>`
      : "";

  serviceLineItems.forEach((item, index) => {
    const row = document.createElement("tr");
    row.className = "hover:bg-gray-50";
    row.innerHTML = `
      <td class="px-6 py-4">
          <input type="text" value="${
            item.serviceName
          }" class="service-name-input w-full p-2 border border-gray-200 rounded-lg text-sm" 
          oninput="updateLineItem(${index}, 'serviceName', this.value)" placeholder="e.g. OS Installation">
      </td>
      <td class="px-6 py-4">
          <input type="number" value="${
            item.rate
          }" class="service-rate-input w-full p-2 border border-gray-200 rounded-lg text-sm text-right" 
          oninput="updateLineItem(${index}, 'rate', this.value)">
      </td>
      <td class="px-6 py-4">
          <input type="number" value="${
            item.discountPercent
          }" class="w-full p-2 border border-gray-200 rounded-lg text-sm text-right" 
          oninput="updateLineItem(${index}, 'discountPercent', this.value)">
      </td>
      <td class="px-6 py-4 text-right font-bold text-indigo-600">
          ₹${Math.round(item.finalPrice).toLocaleString("en-IN")}
      </td>
      <td class="px-6 py-4 text-center">
          <button type="button" onclick="removeLineItem(${index})" class="text-red-400 hover:text-red-600">
              <i class="ph ph-trash text-xl"></i>
          </button>
      </td>
    `;
    lineItemsBody.appendChild(row);
  });
}

window.updateLineItem = (index, field, value) => {
  serviceLineItems[index][field] =
    field === "serviceName" ? value : parseFloat(value) || 0;
  calculateTotals();
  const row = lineItemsBody.children[index];
  if (row) {
    row.querySelector(".text-indigo-600").textContent = `₹${Math.round(
      serviceLineItems[index].finalPrice
    ).toLocaleString("en-IN")}`;
    if (field === "serviceName" && value.trim() !== "")
      highlightError(row.querySelector(".service-name-input"), false);
    if (field === "rate" && parseFloat(value) > 0)
      highlightError(row.querySelector(".service-rate-input"), false);
  }
};

window.removeLineItem = (index) => {
  serviceLineItems.splice(index, 1);
  renderLineItems();
  calculateTotals();
};

async function fetchEngineers() {
  try {
    const response = await fetch("/api/v1/users");
    if (!response.ok) throw new Error("Failed to fetch engineers");
    const users = await response.json();
    assignedEngineerSelect.innerHTML =
      '<option value="">Select Assigned Engineer *</option>';
    users.forEach((user) => {
      const option = new Option(user.fullName, user.id);
      assignedEngineerSelect.add(option);
    });
  } catch (error) {
    assignedEngineerSelect.innerHTML =
      '<option value="">Error loading engineers</option>';
  }
}

// --- INITIALIZATION ---
function setupNewOrderForm() {
  // --- Initial Dropdown Population ---
  customerStateSelect.innerHTML = INDIAN_STATES.map(
    (s) =>
      `<option value="${s}" ${
        s === "West Bengal" ? "selected" : ""
      }>${s}</option>`
  ).join("");

  deviceTypeSelect.innerHTML =
    '<option value="">Select Type *</option>' +
    Object.entries(DEVICE_TYPES)
      .map(([k, v]) => `<option value="${k}">${v}</option>`)
      .join("");

  fetchEngineers();

  // --- 1. Dynamic Toggles (Other Device, Other Acc, Warranty) ---

  // Toggle 'Other' Equipment Type
  deviceTypeSelect.addEventListener("change", function () {
    const otherContainer = document.getElementById("otherDeviceDetails");
    const otherInput = document.getElementById("otherDeviceName");
    if (this.value === "other") {
      otherContainer.classList.remove("hidden");
      otherInput.required = true;
    } else {
      otherContainer.classList.add("hidden");
      otherInput.required = false;
      otherInput.value = "";
    }
  });

  // Toggle 'Other' Accessories
  const otherAccCheckbox = document.getElementById("otherAccessoriesCheckbox");
  const otherAccDetails = document.getElementById("otherAccessoriesDetails");
  const otherAccInput = document.getElementById("otherAccessoriesName");

  otherAccCheckbox.addEventListener("change", function () {
    if (this.checked) {
      otherAccDetails.classList.remove("hidden");
      otherAccInput.focus();
    } else {
      otherAccDetails.classList.add("hidden");
      otherAccInput.value = "";
    }
  });

  // Toggle Warranty Details
  const warrantyRadios = document.querySelectorAll(
    'input[name="underWarranty"]'
  );
  const warrantySection = document.getElementById("warranty-details");

  warrantyRadios.forEach((radio) => {
    radio.addEventListener("change", function () {
      if (this.value === "yes") {
        warrantySection.classList.remove("hidden");
      } else {
        warrantySection.classList.add("hidden");
        document.getElementById("warrantyNo").value = "";
        document.getElementById("warrantyExpDate").value = "";
      }
    });
  });

  // --- 2. Existing Functionality (Add Service, Phone Lookup) ---

  addServiceBtn.addEventListener("click", () => {
    serviceLineItems.push({
      serviceName: "",
      rate: 0,
      discountPercent: 0,
      finalPrice: 0,
    });
    renderLineItems();
  });

  customerPhoneInput.addEventListener("input", function () {
    let value = this.value.replace(/\D/g, ""); // Remove non-digits

    // Format the display (e.g., 98765 43210)
    if (value.length > 0) {
      this.value =
        value.length > 5 ? `${value.slice(0, 5)} ${value.slice(5, 10)}` : value;
    }

    if (value.length === 10) {
      highlightError(this, false);
      lookupCustomerByPhone(value);
    } else {
      // Just ensure fields are editable so Arjun can keep typing the name
      customerFields.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.readOnly = false;
          el.classList.remove(
            "bg-gray-100",
            "cursor-not-allowed",
            "text-gray-500"
          );
        }
      });
    }
  });

  requiredFields.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", () => highlightError(el, false));
  });

  // --- 3. Form Submission ---
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    let isValid = true;
    let firstErrorElement = null;

    // Validation
    requiredFields.forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.value.trim() === "" || el.value === "0") {
        highlightError(el, true);
        isValid = false;
        if (!firstErrorElement) firstErrorElement = el;
      }
    });

    if (!validateIndianPhone(customerPhoneInput.value)) {
      highlightError(customerPhoneInput, true);
      isValid = false;
      if (!firstErrorElement) firstErrorElement = customerPhoneInput;
    }

    if (serviceLineItems.length === 0) {
      showNotification("Please add at least one service.", "error");
      isValid = false;
    }

    const backupSelected = document.querySelector(
      'input[name="dataBackup"]:checked'
    );
    if (!backupSelected) {
      showNotification("Please confirm Data Backup status.", "error");
      isValid = false;
    }

    if (!isValid) {
      if (firstErrorElement)
        firstErrorElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      showNotification("Fix the highlighted errors to continue.", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<i class="ph ph-circle-notch animate-spin mr-2"></i> Creating Order...';

    // Handle 'Other' device text
    const finalDeviceType =
      deviceTypeSelect.value === "other"
        ? document.getElementById("otherDeviceName").value
        : DEVICE_TYPES[deviceTypeSelect.value] || deviceTypeSelect.value;

    // Handle 'Other' accessories text
    let selectedAccessories = Array.from(
      document.querySelectorAll('input[name="accessories"]:checked')
    ).map((cb) => cb.value);

    if (otherAccCheckbox.checked) {
      const otherVal = document.getElementById("otherAccessoriesName").value;
      selectedAccessories = selectedAccessories.map((val) =>
        val === "Others (Specify)" ? `Other: ${otherVal}` : val
      );
    }

    const payload = {
      customerName: document.getElementById("customerName").value,
      customerEmail: document.getElementById("customerEmail").value,
      customerPhone: customerPhoneInput.value.replace(/\s/g, ""),
      customerAddress: document.getElementById("customerAddress").value,
      customerCity: document.getElementById("customerCity").value,
      customerState: document.getElementById("customerState").value,
      customerZip: document.getElementById("customerZip").value || "",

      deviceType: finalDeviceType,
      deviceBrand: document.getElementById("deviceBrand").value || "",
      deviceModelNo: document.getElementById("deviceModelNo").value || "",
      deviceSerialNo: document.getElementById("deviceSerialNo").value || "",
      devicePassword: document.getElementById("devicePassword").value || "",
      accessoriesReceived: selectedAccessories.join(", "),

      ticketType: document.getElementById("ticketType").value,
      engineerId: assignedEngineerSelect.value,
      issueDescription: document.getElementById("issueDescription").value,
      dataBackup: backupSelected.value,

      vendorName: document.getElementById("vendorName")?.value || "",
      vendorReason: document.getElementById("vendorReason")?.value || "",

      underWarranty:
        document.querySelector('input[name="underWarranty"]:checked').value ===
        "yes",
      warrantyNo: document.getElementById("warrantyNo")?.value || "",
      warrantyExpDate: document.getElementById("warrantyExpDate")?.value || "",
      expectedDeliveryDate: document.getElementById("expectedDeliveryDate")
        .value,

      createdBy: localStorage.getItem("userId"),
      serviceLineItems: serviceLineItems.map((item) => ({
        itemId: "",
        serviceName: item.serviceName,
        rate: parseFloat(item.rate),
        discountPercent: parseFloat(item.discountPercent),
        finalPrice: parseFloat(item.finalPrice),
      })),
      totalCost: parseFloat(
        document
          .getElementById("sidebar-grand-total")
          .textContent.replace(/[^\d.-]/g, "")
      ),
    };

    try {
      const response = await fetch(NEW_ORDER_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const result = await response.json();
        const orderId = result.orderId;
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        generateOrderPDF(payload, doc, orderId);
        const pdfBase64 = doc.output("datauristring").split(",")[1];

        if (payload.customerEmail) {
          fetch(`${API_BASE_URL}/orders/send-confirmation`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: payload.customerEmail,
              orderId: result.orderId,
              customerName: payload.customerName,
              deviceType: payload.deviceType,
              deviceBrand: payload.deviceBrand,
              issueDescription: payload.issueDescription,
              deliveryDate: payload.expectedDeliveryDate,
              totalCost: payload.totalCost,
              pdfData: pdfBase64, // The raw PDF string
            }),
          });
        }
        doc.save(`Lokenath_Computer_${orderId}.pdf`);
        showNotification("Order Created Successfully", "success");
        // triggerMessages(
        //   payload.customerPhone,
        //   payload.customerName,
        //   payload.deviceType,
        //   payload.totalCost
        // );
        setTimeout(() => window.location.replace("../dashboard.html"), 1500);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create order");
      }
    } catch (error) {
      showNotification(error.message, "error");
      submitBtn.disabled = false;
      submitBtn.innerHTML =
        '<i class="ph ph-file-plus-fill mr-2"></i> Create Order';
    }
  });

  renderLineItems();
}

const generateOrderPDF = (data, doc, orderId = "DRAFT") => {
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // --- 1. Full Screen Transparent Background Watermark ---
  const lokenathImg = "../../assets/img/lokenath_baba.png";
  doc.saveGraphicsState();
  doc.setGState(new doc.GState({ opacity: 0.05 }));
  doc.addImage(lokenathImg, "PNG", 0, 0, pageWidth, pageHeight);
  doc.restoreGraphicsState();

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
  doc.text(
    `Date : ${new Date().toLocaleDateString("en-IN")}`,
    pageWidth - 60,
    53
  );

  // --- 4. Call Type & Equipment (Clean Display) ---
  doc.setFont("helvetica", "bold");
  doc.text(`${data.ticketType}`, margin, 61); // Mentions only "Diagnostics Call" or "Service Call"
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
  doc.text(`Address: ${data.customerAddress}`, margin, 90);
  doc.text(
    `City/State: ${data.customerCity}, ${data.customerState}`,
    margin,
    95
  );

  doc.text(`Brand: ${data.deviceBrand}`, 105, 80);
  doc.text(`Model No: ${data.deviceModelNo}`, 105, 85);
  doc.text(`Serial No: ${data.deviceSerialNo}`, 105, 90);
  doc.text(`Issue: ${data.issueDescription.substring(0, 50)}`, 105, 95);

  // --- 6. Service Table ---
  doc.autoTable({
    startY: 105,
    head: [["Description", "Rate", "Discount", "Final Amount"]],
    body: data.serviceLineItems.map((item) => [
      item.serviceName,
      `Rs. ${item.rate.toFixed(2)}`,
      `${item.discountPercent}%`,
      `Rs. ${item.finalPrice.toFixed(2)}`,
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
    `Grand Total: Rs. ${data.totalCost.toLocaleString("en-IN")}`,
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
  const backupText =
    data.dataBackup === "request_backup"
      ? "Consent: User requested data backup (Charges may apply)."
      : "Consent: User has backed up data / do not want backup.";
  doc.text(backupText, margin, currentY);

  currentY += 5;
  const warrantyText = data.underWarranty
    ? `Warranty: YES (No: ${data.warrantyNo} | Exp: ${data.warrantyExpDate})`
    : "Warranty: NO";
  doc.text(warrantyText, margin, currentY);

  // --- 9. Disclaimer ---
  currentY += 10;
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
};

const triggerMessages = (customerPhone, customerName, deviceType, total) => {
  const shopName = "Lokenath Computer";
  const messageText = `Hello ${customerName}, your ${deviceType} service order is created at ${shopName}. \n\nEstimate: ₹${total}\nStatus: New Order\n\nThank you for choosing us!`;

  // WhatsApp Trigger (Opens in new tab)
  const waUrl = `https://wa.me/91${customerPhone}?text=${encodeURIComponent(
    messageText
  )}`;
  window.open(waUrl, "_blank");

  // Using a slight delay to ensure the browser handles both popups
  setTimeout(() => {
    window.location.href = smsUrl;
  }, 1000);
};

window.addEventListener("DOMContentLoaded", () => {
  initializeIdentity();
  setupNewOrderForm();
});
