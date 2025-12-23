require('dotenv').config();
const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const creds = require('./credentials.json');

const app = express();
app.use(express.json());

// --- GOOGLE SHEET LOGIC ---
async function addToSheet(data) {
  try {
    const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);

    await doc.useServiceAccountAuth({
      client_email: creds.client_email,
      private_key: creds.private_key,
    });

    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];

    // Data add kar rahe hain (Headers se match hona chahiye)
    await sheet.addRow({
      OrderID: data.id,
      OrderName: data.name,         // Jaise #1001
      OrderDate: data.created_at,
      Products: data.products,      // Saare items comma separated
      TotalAmount: data.total_price,
      FullAddress: data.address,    // Pura address ek cell mein
      RiskScore: data.risk
    });

    console.log('📝 Saved to Google Sheet successfully!');
  } catch (error) {
    console.error('❌ Sheet Error:', error.message);
  }
}

// --- WEBHOOK ROUTE ---
app.post('/webhook/orders', async (req, res) => {
  try {
    const order = req.body;
    
    // 1. Basic Variables Extraction
    const city = order.shipping_address?.city?.toLowerCase() || "";
    const riskScore = order.risk_analysis?.score ? parseFloat(order.risk_analysis.score) : 0.0;
    
    // Filtering: Sirf Delhi aur Low Risk chahiye
    if (city === 'delhi' && riskScore < 0.5) {
      console.log(`✅ Order ${order.name} Matched! Preparing data...`);

      // --- LOGIC: Products ka naam nikalna ---
      // Order mein 5 item ho sakte hain, hum map use karke sabka title nikalenge
      // Result example: "Aviator sunglasses, Leather Case"
      const productNames = order.line_items.map(item => item.title).join(", ");

      // --- LOGIC: Full Address banana ---
      const addr = order.shipping_address;
      // Address ko jod rahe hain saaf tareeke se
      const fullAddress = `${addr.address1}, ${addr.city}, ${addr.province}, ${addr.zip}, ${addr.country}`;

      // Sheet function ko clean data bhejo
      await addToSheet({
        id: order.id,
        name: order.name,          // Shopify ka Order Name (e.g. #9999)
        created_at: order.created_at,
        products: productNames,    // Upar banaya hua string
        total_price: order.total_price,
        address: fullAddress,      // Upar banaya hua string
        risk: riskScore
      });

    } else {
      console.log(`⛔ Skipped: ${order.name} is from ${city} (Risk: ${riskScore})`);
    }

    res.status(200).send('Webhook Received');

  } catch (error) {
    console.error('Server Error:', error);
    res.status(200).send('Error handled');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));