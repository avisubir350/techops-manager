package service

import (
	"fmt"
	"io"

	"gopkg.in/gomail.v2"
)

func SendOrderConfirmationEmail(customerEmail string, orderData map[string]interface{}, pdfBytes []byte) error {
	if customerEmail == "" {
		return nil // Skip if no email provided
	}

	from := "lokenathcomputer.sodepur@gmail.com"
	pass := "jtpf kntd wnvk vkke" 

	m := gomail.NewMessage()
	m.SetHeader("From", fmt.Sprintf("Lokenath Computer <%s>", from))
	m.SetHeader("To", customerEmail)
	m.SetHeader("Subject", fmt.Sprintf("Order Confirmation - %s", orderData["orderId"]))

	// HTML Body with professional styling
	body := fmt.Sprintf(`
		<div style="font-family: Arial, sans-serif; max-width: 600px; border: 1px solid #e0e0e0; padding: 20px; border-radius: 10px;">
			<h2 style="color: #4f46e5;">LOKENATH COMPUTER</h2>
			<p>Hello <strong>%s</strong>,</p>
			<p>Your service order has been successfully created. We have received your <strong>%s</strong> for repair/service.</p>
			
			<div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
				<p style="margin: 5px 0;"><strong>Order ID:</strong> %s</p>
				<p style="margin: 5px 0;"><strong>Device:</strong> %s (%s)</p>
				<p style="margin: 5px 0;"><strong>Issue:</strong> %s</p>
				<p style="margin: 5px 0;"><strong>Expected Delivery:</strong> %s</p>
				<p style="margin: 5px 0; color: #4f46e5; font-size: 18px;"><strong>Estimate: ₹%v</strong></p>
			</div>

			<p>Attached to this email is your official <strong>Service Report (PDF)</strong>. Please keep this for your records.</p>
			
			<p style="font-size: 12px; color: #6b7280; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 10px;">
				114/A, Surya Tarun Apartment, Sodepur, Kolkata - 700 110<br>
				Contact: 8777679535 / 8013338334
			</p>
		</div>
	`, 
	orderData["customerName"], 
	orderData["deviceType"],
	orderData["orderId"],
	orderData["deviceType"], orderData["deviceBrand"],
	orderData["issueDescription"],
	orderData["deliveryDate"],
	orderData["totalCost"])

	m.SetBody("text/html", body)

	// Attach PDF from memory
	m.Attach("Service_Report_"+fmt.Sprint(orderData["orderId"])+".pdf", gomail.SetCopyFunc(func(w io.Writer) error {
		_, err := w.Write(pdfBytes)
		return err
	}))

	d := gomail.NewDialer("smtp.gmail.com", 587, from, pass)
	return d.DialAndSend(m)
}