require('dotenv').config();
const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const creds = {
  client_email: process.env.CLIENT_EMAIL,
  private_key: process.env.PRIVATE_KEY ? process.env.PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
};

const app = express();
app.use(express.json());

// --- GOOGLE SHEET LOGIC ---
async function addToSheet(data) {
  try {
    const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];

    await sheet.addRow({
      OrderID: data.id,
      OrderName: data.name,
      OrderDate: data.created_at,
      FirstName: data.first_name,
      LastName: data.last_name,
      Email: data.email,
      Phone: data.phone,           // Ab ye kabhi khali nahi hoga (agar customer ne diya hai)
      Products: data.products,
      TotalAmount: data.total_price,
      FullAddress: data.address,
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
    
    // --- 1. Variables Extraction ---
    const state = order.shipping_address?.province?.toLowerCase() || ""; 
    const riskScore = order.risk_analysis?.score ? parseFloat(order.risk_analysis.score) : 0.0;
    
    // --- 2. Filter Logic (State: Delhi) ---
    if (state.includes('delhi') && riskScore < 0.5) {
      
      console.log(`✅ Order Matched! Fetching details...`);

      const addr = order.shipping_address || {};

      // 🔥 PHONE NUMBER LOGIC (Ye hai main change) 🔥
      // Hum har jagah check karenge priority ke hisaab se
      const finalPhone = 
        order.phone ||                 // 1. Direct Order Phone
        addr.phone ||                  // 2. Shipping Address Phone
        order.billing_address?.phone || // 3. Billing Address Phone
        order.customer?.phone ||       // 4. Customer Profile Phone
        "No Phone";                    // Agar kahin nahi mila

      // Address Merge
      const fullAddress = `${addr.address1 || ""}, ${addr.city || ""}, ${addr.province || ""}, ${addr.zip || ""}, ${addr.country || ""}`;

      // Products Merge
      const productNames = order.line_items.map(item => item.title).join(", ");

      await addToSheet({
        id: order.id,
        name: order.name,
        created_at: order.created_at,
        first_name: addr.first_name || order.customer?.first_name || "",
        last_name: addr.last_name || order.customer?.last_name || "",
        email: order.email || order.customer?.email || "",
        
        phone: finalPhone, // Updated variable pass kiya
        
        products: productNames,
        total_price: order.total_price,
        address: fullAddress,
        risk: riskScore
      });

    } else {
      console.log(`⛔ Skipped: Order is from State: '${state}' (Risk: ${riskScore})`);
    }

    res.status(200).send('Webhook Received');

  } catch (error) {
    console.error('Server Error:', error);
    res.status(200).send('Error handled');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));